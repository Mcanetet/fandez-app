/**
 * Use case: GenerateCommissionInvoice
 *
 * Entrada: monto comisión (15% IVA incl.) + costo pasarela + datos del socio.
 * Salida: DTE 33 firmado, timbrado (TED), enviado al SII (o dry-run), PDF/HTML.
 * Idempotente por hash (requestId + phase + total + receptor + environment).
 */
'use strict';

const { getConfig, isDirectConfigured, normalizeRut, cafPathForType } = require('./config');
const { calculateCommissionInvoiceAmounts, calculateManualInvoiceAmounts } = require('./amounts');
const { buildIdempotencyHash } = require('./idempotency');
const { loadCafForType, allocateFolio } = require('./folio/caf');
const { loadPkcs12 } = require('./crypto/certificate');
const { signDocumento, signEnvio } = require('./crypto/xmldsig');
const { buildDocumento33, buildEnvioDte } = require('./xml/dte33');
const { buildDocumento43 } = require('./xml/dte43');
const { buildDocumento46 } = require('./xml/dte46');
const { buildDocumento61, normalizeCodRef } = require('./xml/dte61');
const {
  normalizeDteType,
  dteKindLabel,
  dtePhase,
  defaultLineName,
  dryRunHint
} = require('./dteTypes');
const { authenticate } = require('./sii/auth');
const { buildEnvioZip, uploadDte } = require('./sii/upload');
const { renderCommissionInvoiceHtml } = require('./pdf/render');
const { writeArtifact, publicPdfUrl, publicXmlUrl } = require('./storage');
const repo = require('./repository');
const { scheduleStatusPoll } = require('./jobs/pollStatus');

function normalizeReference(raw = {}) {
  const folio = Math.max(0, parseInt(raw.folio ?? raw.refFolio, 10) || 0);
  if (!folio) return null;
  return {
    dteType: parseInt(raw.dteType ?? raw.refDteType, 10) || 33,
    folio,
    date: String(raw.date || raw.refDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    code: normalizeCodRef(raw.code ?? raw.refCode ?? 3),
    reason: String(raw.reason || raw.refReason || 'Corrección de montos').trim().slice(0, 90)
  };
}

function pickPartnerBilling(partner = {}) {
  const legal = partner.providerContract?.legalEntity || {};
  const rut = normalizeRut(
    legal.rut || partner.companyRut || partner.rut || partner.billing?.rut || ''
  );
  const name = legal.legalName || partner.companyName || partner.name || 'Socio Fandez';
  return {
    rut,
    name,
    giro: legal.giro || partner.giro || 'Servicios técnicos',
    address: legal.address || partner.address || 'Santiago',
    commune: legal.commune || 'Santiago',
    city: legal.city || 'Santiago',
    email: partner.email || partner.billing?.invoiceEmail || null
  };
}

function normalizeReceptor(raw = {}) {
  const rut = normalizeRut(raw.rut || '');
  return {
    rut,
    name: String(raw.name || raw.razonSocial || '').trim().slice(0, 100) || 'Receptor',
    giro: String(raw.giro || 'Servicios').trim().slice(0, 40),
    address: String(raw.address || raw.direccion || 'Santiago').trim().slice(0, 70),
    commune: String(raw.commune || raw.comuna || 'Santiago').trim().slice(0, 20),
    city: String(raw.city || raw.ciudad || 'Santiago').trim().slice(0, 20),
    email: raw.email ? String(raw.email).trim().slice(0, 80) : null
  };
}

/**
 * @param {object} input
 * @param {string} [input.requestId]
 * @param {object} [input.partner] usuario socio
 * @param {object} [input.receptor] receptor libre (prioridad sobre partner)
 * @param {number} [input.commissionClp] 15% IVA incl.
 * @param {number} [input.cardFeeClp] costo MP IVA incl.
 * @param {number} [input.appTotal] suma ya calculada (preferida)
 * @param {number} [input.totalClp] total IVA incl. (manual)
 * @param {string} [input.description] glosa (manual)
 * @param {Array} [input.lines] líneas manuales
 * @param {object} [input.amounts] montos ya calculados
 * @param {string} [input.phase]
 * @param {boolean} [input.manual]
 * @param {string} [input.notes] solo interno
 * @param {string} [input.observation] visible en factura / DscItem
 * @param {string} [input.issuedBy]
 * @param {boolean} [input.force] ignora idempotencia (peligroso)
 */
async function generateCommissionInvoice(input = {}) {
  const observation = String(input.observation || input.observacion || input.obs || '')
    .trim()
    .slice(0, 500) || null;
  const cfg = getConfig();
  const partner = input.partner || {};
  const receptor = input.receptor
    ? normalizeReceptor(input.receptor)
    : pickPartnerBilling(partner);
  if (!receptor.rut || receptor.rut.length < 3) {
    return {
      error: input.manual
        ? 'Indica el RUT del receptor.'
        : 'El socio no tiene RUT de facturación (contrato / e-RUT). Completa el contrato antes de emitir DTE.'
    };
  }

  let amounts = input.amounts || null;
  if (!amounts) {
    if (
      input.manual
      || input.description
      || input.totalClp != null
      || (Array.isArray(input.lines) && input.lines.length)
    ) {
      amounts = calculateManualInvoiceAmounts(input);
    } else {
      amounts = calculateCommissionInvoiceAmounts({
        commissionClp: input.commissionClp,
        cardFeeClp: input.cardFeeClp,
        appTotal: input.appTotal
      });
    }
  }
  if (amounts.total <= 0) {
    return { error: 'Monto inválido para DTE (debe ser mayor a 0).' };
  }

  const dteType = normalizeDteType(input.dteType, input.manual ? 33 : 33);
  const reference = dteType === 61
    ? normalizeReference(input.reference || {
      folio: input.refFolio,
      dteType: input.refDteType || 33,
      date: input.refDate,
      code: input.refCode,
      reason: input.refReason
    })
    : null;
  if (dteType === 61 && !reference) {
    return { error: 'La nota de crédito requiere el folio de la factura que referencia.' };
  }

  const phase = input.phase || dtePhase(dteType, Boolean(input.manual));
  const requestId = String(input.requestId || `manual-${Date.now()}`).trim();
  const idempotencyHash = buildIdempotencyHash({
    requestId,
    phase,
    dteType,
    total: amounts.total,
    receptorRut: receptor.rut,
    environment: cfg.environment,
    refFolio: reference?.folio || ''
  });

  if (!input.force) {
    const existing = await repo.findByIdempotencyHash(idempotencyHash);
    if (existing) {
      return { success: true, document: existing, idempotent: true };
    }
  }

  const dry = cfg.dryRun || !isDirectConfigured(cfg, dteType);
  let caf = null;
  let cert = null;
  let folio;
  const cafPath = cafPathForType(cfg, dteType);

  if (!dry) {
    caf = loadCafForType(dteType, cafPath);
    cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    folio = allocateFolio(caf, `${cafPath}.folio`);
  } else {
    // Folio demo local (no SII)
    const n = Date.now() % 900000;
    folio = 100000 + n;
    caf = {
      rut: cfg.emitterRut,
      dteType,
      folioFrom: folio,
      folioTo: folio,
      privateKeyPem: null,
      cafFragment: `<CAF version="1.0"><DA><RE>${cfg.emitterRut}</RE><TD>${dteType}</TD><RNG><D>${folio}</D><H>${folio}</H></RNG></DA></CAF>`,
      _dry: true
    };
  }

  const issuedAt = new Date().toISOString();
  const emitter = {
    rut: cfg.emitterRut,
    name: cfg.emitterName,
    giro: cfg.emitterGiro,
    address: cfg.emitterAddress,
    commune: cfg.emitterCommune,
    city: cfg.emitterCity,
    acteco: cfg.emitterActeco,
    email: cfg.emitterEmail || null
  };

  const liquidation = dteType === 43
    ? {
        bruto: Math.max(0, Math.round(Number(input.liquidationBruto ?? input.brutoLiquidado) || 0)),
        comision: Math.max(0, Math.round(Number(input.liquidationComision ?? input.commissionClp) || amounts.total || 0)),
        liquido: input.liquidationLiquido != null || input.liquidoAPagar != null
          ? Math.round(Number(input.liquidationLiquido ?? input.liquidoAPagar) || 0)
          : null
      }
    : null;

  let documentoXml;
  let tedXml = '';
  if (dry) {
    // XML estructural de demostración (sin CAF/cert reales ni llamada al SII).
    const fch = issuedAt.slice(0, 10);
    let lineName = (amounts.lines[0] && amounts.lines[0].name) || defaultLineName(dteType);
    if (liquidation && liquidation.bruto > 0) {
      lineName = String(`${lineName} · bruto $${Math.round(liquidation.bruto).toLocaleString('es-CL')}`).slice(0, 80);
    }
    const line = { name: lineName, neto: amounts.neto };
    const refXml = reference
      ? `<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>${reference.dteType}</TpoDocRef>` +
        `<FolioRef>${reference.folio}</FolioRef><FchRef>${reference.date}</FchRef>` +
        `<CodRef>${reference.code}</CodRef><RazonRef>${reference.reason}</RazonRef></Referencia>`
      : '';
    tedXml =
      `<TED version="1.0"><DD>` +
      `<RE>${emitter.rut}</RE><TD>${dteType}</TD><F>${folio}</F><FE>${fch}</FE>` +
      `<RR>${receptor.rut}</RR><RSR>${String(line.name).slice(0, 40)}</RSR>` +
      `<MNT>${amounts.total}</MNT><IT1>${String(line.name).slice(0, 40)}</IT1>` +
      `<TSTED>${issuedAt.slice(0, 19).replace('Z', '')}</TSTED>` +
      `</DD><FRMT algoritmo="SHA1withRSA">DRYRUN</FRMT></TED>`;
    documentoXml =
      `<Documento ID="F${folio}T${dteType}">` +
      `<Encabezado><IdDoc><TipoDTE>${dteType}</TipoDTE><Folio>${folio}</Folio><FchEmis>${fch}</FchEmis></IdDoc>` +
      `<Emisor><RUTEmisor>${emitter.rut}</RUTEmisor><RznSoc>${emitter.name}</RznSoc></Emisor>` +
      `<Receptor><RUTRecep>${receptor.rut}</RUTRecep><RznSocRecep>${receptor.name}</RznSocRecep></Receptor>` +
      `<Totales><MntNeto>${amounts.neto}</MntNeto><TasaIVA>19</TasaIVA><IVA>${amounts.iva}</IVA><MntTotal>${amounts.total}</MntTotal></Totales>` +
      `</Encabezado>` +
      `<Detalle><NroLinDet>1</NroLinDet><NmbItem>${line.name}</NmbItem>` +
      (observation ? `<DscItem>${observation.replace(/[<>&]/g, '')}</DscItem>` : '') +
      `<QtyItem>1</QtyItem><PrcItem>${line.neto || amounts.neto}</PrcItem><MontoItem>${line.neto || amounts.neto}</MontoItem></Detalle>` +
      `${refXml}${tedXml}<TmstFirma>${issuedAt.slice(0, 19).replace('Z', '')}</TmstFirma></Documento>`;
  } else if (dteType === 61) {
    const built = buildDocumento61({
      folio, issuedAt, emitter, receptor, amounts, caf, reference, observation
    });
    documentoXml = signDocumento(built.documentoXml, cert);
    tedXml = built.ted;
  } else if (dteType === 46) {
    const built = buildDocumento46({
      folio, issuedAt, emitter, receptor, amounts, caf, observation
    });
    documentoXml = signDocumento(built.documentoXml, cert);
    tedXml = built.ted;
  } else if (dteType === 43) {
    const built = buildDocumento43({
      folio, issuedAt, emitter, receptor, amounts, caf, liquidation, observation
    });
    documentoXml = signDocumento(built.documentoXml, cert);
    tedXml = built.ted;
  } else {
    const built = buildDocumento33({
      folio, issuedAt, emitter, receptor, amounts, caf, observation
    });
    documentoXml = signDocumento(built.documentoXml, cert);
    tedXml = built.ted;
  }

  let envioXml = buildEnvioDte({
    emitter,
    documentoFirmadoXml: documentoXml,
    folio,
    dteType,
    caratula: {
      resolutionDate: cfg.emitterResolutionDate,
      resolutionNumber: cfg.emitterResolutionNumber,
      rutEnvia: cfg.emitterRut
    }
  });
  // Certificación SII exige Signature del SetDTE dentro de EnvioDTE
  if (!dry && cert) {
    envioXml = signEnvio(envioXml, cert);
  }

  const docId = `sii-${requestId}-${dteType}-${folio}`;
  // Instructivo: encoding ISO-8859-1
  const xmlPath = writeArtifact(docId, 'xml', Buffer.from(envioXml, 'latin1'), cfg);

  const doc = {
    id: docId,
    requestId,
    providerId: partner.id || input.providerId || null,
    phase,
    dteType,
    folio,
    emitterRut: emitter.rut,
    receptorRut: receptor.rut,
    receptorName: receptor.name,
    neto: amounts.neto,
    iva: amounts.iva,
    total: amounts.total,
    commissionClp: amounts.commissionClp,
    cardFeeClp: amounts.cardFeeClp,
    siiStatus: 'pending',
    trackId: null,
    xmlPath,
    xmlContent: envioXml,
    xmlUrl: publicXmlUrl(docId),
    pdfPath: null,
    htmlContent: null,
    pdfUrl: null,
    idempotencyHash,
    environment: cfg.environment,
    errorMessage: null,
    signedAt: issuedAt,
    sentAt: null,
    acceptedAt: null,
    lastPollAt: null,
    meta: {
      dryRun: dry,
      manual: Boolean(input.manual || ['manual', 'credit_note', 'purchase_invoice', 'liquidation'].includes(phase)),
      notes: input.notes ? String(input.notes).slice(0, 400) : null,
      observation,
      issuedBy: input.issuedBy || null,
      emitterName: emitter.name,
      emitterGiro: emitter.giro,
      emitterAddress: emitter.address,
      emitterEmail: emitter.email || null,
      lines: amounts.lines,
      partnerEmail: receptor.email,
      receptorGiro: receptor.giro || null,
      receptorAddress: receptor.address || null,
      receptorCommune: receptor.commune || null,
      receptorCity: receptor.city || null,
      receptorEmail: receptor.email || null,
      reference: reference || null,
      liquidation: liquidation || null,
      kind: dteKindLabel(dteType)
    }
  };

  const html = await renderCommissionInvoiceHtml(doc, { tedXml });
  doc.pdfPath = writeArtifact(docId, 'html', html, cfg);
  doc.htmlContent = html;
  doc.pdfUrl = publicPdfUrl(docId);

  if (dry) {
    doc.siiStatus = 'signed';
    doc.meta.note = dryRunHint(dteType);
    await repo.save(doc);
    return { success: true, document: doc, dryRun: true };
  }

  try {
    const { token } = await authenticate(cfg.endpoints, cert);
    const zip = await buildEnvioZip(envioXml, `F${folio}T${dteType}.xml`);
    const uploaded = await uploadDte({
      endpoints: cfg.endpoints,
      token,
      emitterRut: cfg.emitterRut,
      companyRut: cfg.emitterRut,
      zipBuffer: zip,
      fileName: `F${folio}T${dteType}.zip`
    });
    doc.trackId = uploaded.trackId;
    doc.siiStatus = 'sent';
    doc.sentAt = new Date().toISOString();
    doc.meta.uploadRaw = String(uploaded.raw || '').slice(0, 1000);
    await repo.save(doc);
    scheduleStatusPoll(doc.id);
    return { success: true, document: doc };
  } catch (err) {
    doc.siiStatus = 'rejected';
    doc.errorMessage = err.message || String(err);
    await repo.save(doc);
    return { error: doc.errorMessage, document: doc };
  }
}

module.exports = {
  generateCommissionInvoice,
  pickPartnerBilling,
  normalizeReceptor,
  calculateCommissionInvoiceAmounts
};

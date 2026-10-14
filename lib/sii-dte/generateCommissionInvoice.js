/**
 * Use case: GenerateCommissionInvoice
 *
 * Entrada: monto comisión (15% IVA incl.) + costo pasarela + datos del socio.
 * Salida: DTE 33 firmado, timbrado (TED), enviado al SII (o dry-run), PDF/HTML.
 * Idempotente por hash (requestId + phase + total + receptor + environment).
 */
'use strict';

const { getConfig, isDirectConfigured, normalizeRut } = require('./config');
const { calculateCommissionInvoiceAmounts } = require('./amounts');
const { buildIdempotencyHash } = require('./idempotency');
const { loadCaf33, allocateFolio } = require('./folio/caf');
const { loadPkcs12 } = require('./crypto/certificate');
const { signDocumento } = require('./crypto/xmldsig');
const { buildDocumento33, buildEnvioDte } = require('./xml/dte33');
const { authenticate } = require('./sii/auth');
const { buildEnvioZip, uploadDte } = require('./sii/upload');
const { renderCommissionInvoiceHtml } = require('./pdf/render');
const { writeArtifact, publicPdfUrl } = require('./storage');
const repo = require('./repository');
const { scheduleStatusPoll } = require('./jobs/pollStatus');

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

/**
 * @param {object} input
 * @param {string} input.requestId
 * @param {object} [input.partner] usuario socio
 * @param {number} [input.commissionClp] 15% IVA incl.
 * @param {number} [input.cardFeeClp] costo MP IVA incl.
 * @param {number} [input.appTotal] suma ya calculada (preferida)
 * @param {string} [input.phase]
 * @param {boolean} [input.force] ignora idempotencia (peligroso)
 */
async function generateCommissionInvoice(input = {}) {
  const cfg = getConfig();
  const partner = input.partner || {};
  const receptor = pickPartnerBilling(partner);
  if (!receptor.rut || receptor.rut.length < 3) {
    return { error: 'El socio no tiene RUT de facturación (contrato / e-RUT). Completa el contrato antes de emitir DTE.' };
  }

  const amounts = calculateCommissionInvoiceAmounts({
    commissionClp: input.commissionClp,
    cardFeeClp: input.cardFeeClp,
    appTotal: input.appTotal
  });
  if (amounts.total <= 0) {
    return { error: 'Monto de comisión/pasarela inválido para DTE' };
  }

  const phase = input.phase || 'fandez_margin';
  const idempotencyHash = buildIdempotencyHash({
    requestId: input.requestId,
    phase,
    dteType: 33,
    total: amounts.total,
    receptorRut: receptor.rut,
    environment: cfg.environment
  });

  if (!input.force) {
    const existing = await repo.findByIdempotencyHash(idempotencyHash);
    if (existing) {
      return { success: true, document: existing, idempotent: true };
    }
  }

  const dry = cfg.dryRun || !isDirectConfigured(cfg);
  let caf = null;
  let cert = null;
  let folio;

  if (!dry) {
    caf = loadCaf33(cfg.cafPath33);
    cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    folio = allocateFolio(caf, `${cfg.cafPath33}.folio`);
  } else {
    // Folio demo local (no SII)
    const n = Date.now() % 900000;
    folio = 100000 + n;
    caf = {
      rut: cfg.emitterRut,
      dteType: 33,
      folioFrom: folio,
      folioTo: folio,
      privateKeyPem: null,
      cafFragment: '<CAF version="1.0"><DA><RE>' + cfg.emitterRut + '</RE><TD>33</TD><RNG><D>' + folio + '</D><H>' + folio + '</H></RNG></DA></CAF>',
      // Firma TED mock: se omite crypto real
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
    acteco: cfg.emitterActeco
  };

  let documentoXml;
  let tedXml = '';
  if (dry) {
    // XML estructural de demostración (sin CAF/cert reales ni llamada al SII).
    const fch = issuedAt.slice(0, 10);
    const line = amounts.lines[0] || { name: 'Comisión Fandez', neto: amounts.neto };
    tedXml =
      `<TED version="1.0"><DD>` +
      `<RE>${emitter.rut}</RE><TD>33</TD><F>${folio}</F><FE>${fch}</FE>` +
      `<RR>${receptor.rut}</RR><RSR>${String(line.name).slice(0, 40)}</RSR>` +
      `<MNT>${amounts.total}</MNT><IT1>${String(line.name).slice(0, 40)}</IT1>` +
      `<TSTED>${issuedAt.slice(0, 19).replace('Z', '')}</TSTED>` +
      `</DD><FRMT algoritmo="SHA1withRSA">DRYRUN</FRMT></TED>`;
    documentoXml =
      `<Documento ID="F${folio}T33">` +
      `<Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>${folio}</Folio><FchEmis>${fch}</FchEmis></IdDoc>` +
      `<Emisor><RUTEmisor>${emitter.rut}</RUTEmisor><RznSoc>${emitter.name}</RznSoc></Emisor>` +
      `<Receptor><RUTRecep>${receptor.rut}</RUTRecep><RznSocRecep>${receptor.name}</RznSocRecep></Receptor>` +
      `<Totales><MntNeto>${amounts.neto}</MntNeto><TasaIVA>19</TasaIVA><IVA>${amounts.iva}</IVA><MntTotal>${amounts.total}</MntTotal></Totales>` +
      `</Encabezado>` +
      `<Detalle><NroLinDet>1</NroLinDet><NmbItem>${line.name}</NmbItem><QtyItem>1</QtyItem><PrcItem>${line.neto || amounts.neto}</PrcItem><MontoItem>${line.neto || amounts.neto}</MontoItem></Detalle>` +
      `${tedXml}<TmstFirma>${issuedAt.slice(0, 19).replace('Z', '')}</TmstFirma></Documento>`;
  } else {
    const built = buildDocumento33({ folio, issuedAt, emitter, receptor, amounts, caf });
    documentoXml = signDocumento(built.documentoXml, cert);
    tedXml = built.ted;
  }

  const envioXml = buildEnvioDte({
    emitter,
    documentoFirmadoXml: documentoXml,
    folio,
    caratula: {
      resolutionDate: cfg.emitterResolutionDate,
      resolutionNumber: cfg.emitterResolutionNumber,
      rutEnvia: cfg.emitterRut
    }
  });

  const docId = `sii-${input.requestId || 'x'}-33-${folio}`;
  const xmlPath = writeArtifact(docId, 'xml', envioXml, cfg);

  const doc = {
    id: docId,
    requestId: input.requestId,
    providerId: partner.id || input.providerId || null,
    phase,
    dteType: 33,
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
    pdfPath: null,
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
      emitterName: emitter.name,
      emitterGiro: emitter.giro,
      emitterAddress: emitter.address,
      lines: amounts.lines,
      partnerEmail: receptor.email
    }
  };

  const html = await renderCommissionInvoiceHtml(doc, { tedXml });
  doc.pdfPath = writeArtifact(docId, 'html', html, cfg);
  doc.pdfUrl = publicPdfUrl(docId);

  if (dry) {
    doc.siiStatus = 'signed';
    doc.meta.note = 'Dry-run / sandbox sin cert+CAF reales. Configura SII_CERT_PATH, SII_CERT_PASSWORD y SII_CAF_33_PATH y SII_DTE_DRY_RUN=false para enviar al SII.';
    await repo.save(doc);
    return { success: true, document: doc, dryRun: true };
  }

  try {
    const { token } = await authenticate(cfg.endpoints, cert);
    const zip = await buildEnvioZip(envioXml, `F${folio}T33.xml`);
    const uploaded = await uploadDte({
      endpoints: cfg.endpoints,
      token,
      emitterRut: cfg.emitterRut,
      companyRut: cfg.emitterRut,
      zipBuffer: zip,
      fileName: `F${folio}T33.zip`
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
  calculateCommissionInvoiceAmounts
};

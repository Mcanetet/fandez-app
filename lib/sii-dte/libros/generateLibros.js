/**
 * Genera y opcionalmente envía Libros ESPECIALES de certificación SII:
 *  - Libro de Ventas (Atención 5137073): solo DTE del Set Básico
 *  - Libro de Compras (Atención 5137074): tabla del SII + FctProp 0.60
 */
'use strict';

const crypto = require('crypto');
const { getConfig, isDirectConfigured } = require('../config');
const { loadPkcs12 } = require('../crypto/certificate');
const { signEnvioLibro } = require('../crypto/xmldsig');
const { buildEnvioZip, uploadDte } = require('../sii/upload');
const { authenticate } = require('../sii/auth');
const { writeArtifact, publicXmlUrl } = require('../storage');
const repo = require('../repository');
const {
  buildEnvioLibroXml,
  dteDocsToVentaRows,
  filterSetBasicoDocs,
  earliestPeriod
} = require('./buildLibro');

function certReady(cfg = getConfig()) {
  try {
    const fs = require('fs');
    if (!cfg.certificatePath || !fs.existsSync(cfg.certificatePath)) return false;
    return Boolean(cfg.certificatePassword);
  } catch (_) {
    return false;
  }
}

async function persistLibro({
  cfg,
  op,
  folioNotif,
  periodo,
  xml,
  trackId,
  dry,
  docs,
  fctProp,
  setId,
  issuedBy
}) {
  const packId = `sii-libro-${op.toLowerCase()}-${folioNotif}-${Date.now().toString(36)}`;
  const xmlPath = writeArtifact(packId, 'xml', Buffer.from(xml, 'latin1'), cfg);
  const total = (docs || []).reduce((s, d) => s + (Number(d.mntTotal ?? d.total) || 0), 0);
  const packDoc = {
    id: packId,
    requestId: `libro-${op.toLowerCase()}-${folioNotif}`,
    providerId: null,
    phase: 'certification_libro',
    // Tipos sintéticos para no chocar con UNIQUE (dte_type, folio, env) de DTE reales
    dteType: op === 'COMPRA' ? 991 : 990,
    folio: parseInt(folioNotif, 10) || 0,
    emitterRut: cfg.emitterRut,
    receptorRut: '60803000-K',
    receptorName: 'SERVICIO DE IMPUESTOS INTERNOS',
    neto: 0,
    iva: 0,
    total,
    commissionClp: 0,
    cardFeeClp: 0,
    siiStatus: dry ? 'signed' : 'sent',
    trackId,
    xmlPath,
    xmlContent: xml,
    pdfUrl: null,
    htmlContent: null,
    idempotencyHash: crypto
      .createHash('sha256')
      .update(`libro-${op}-${folioNotif}-${packId}`)
      .digest('hex'),
    environment: cfg.environment,
    errorMessage: null,
    signedAt: new Date().toISOString(),
    sentAt: dry ? null : new Date().toISOString(),
    acceptedAt: null,
    lastPollAt: null,
    meta: {
      dryRun: dry,
      certificationLibro: true,
      tipoOperacion: op,
      folioNotificacion: folioNotif,
      periodoTributario: periodo,
      fctProp: fctProp != null ? Number(fctProp) : null,
      setId: setId || null,
      docsCount: (docs || []).length,
      issuedBy: issuedBy || null,
      kind: op === 'COMPRA' ? 'Libro de Compras SII' : 'Libro de Ventas SII'
    }
  };
  await repo.save(packDoc);
  return packDoc;
}

/**
 * Libro de Ventas ESPECIAL.
 * Body típico: { folioNotificacion: '5137073', setId, docs?, periodoTributario?, upload? }
 */
async function generateLibroVentas(input = {}) {
  const cfg = getConfig();
  const folioNotificacion = String(
    input.folioNotificacion || input.folioNotif || input.atencion || '5137073'
  ).replace(/\D/g, '');
  if (!folioNotificacion) {
    return { error: 'Indica el Folio de Notificación (Atención 5137073).' };
  }

  let rows = Array.isArray(input.docs) ? input.docs : null;
  const setId = String(input.setId || input.setID || '').replace(/\D/g, '') || null;

  if (!rows || !rows.length) {
    if (!setId && !(input.documentIds || []).length) {
      return {
        error: 'Indica setId del Set Básico, o docs[] / documentIds[] de las ventas a incluir.'
      };
    }
    const recent = await repo.listRecent(200);
    let source = recent;
    if ((input.documentIds || []).length) {
      const want = new Set((input.documentIds || []).map(String));
      source = recent.filter((d) => want.has(String(d.id)));
    } else {
      source = filterSetBasicoDocs(recent, setId);
    }
    if (!source.length) {
      return {
        error: setId
          ? `No hay DTE del set ${setId} en Facturas emitidas. Emite el Set Básico primero.`
          : 'No se encontraron los documentos indicados.'
      };
    }
    rows = dteDocsToVentaRows(source);
  }

  const periodo = input.periodoTributario || earliestPeriod(rows);
  let xml;
  try {
    xml = buildEnvioLibroXml({
      tipoOperacion: 'VENTA',
      folioNotificacion,
      periodoTributario: periodo,
      emitterRut: cfg.emitterRut,
      rutEnvia: input.rutEnvia || cfg.emitterRut,
      resolutionDate: cfg.emitterResolutionDate,
      resolutionNumber: cfg.emitterResolutionNumber,
      docs: rows,
      envioId: input.envioId || `LibroVenta${folioNotificacion}`
    });
  } catch (err) {
    return { error: err.message || 'No se pudo armar el XML del libro de ventas.' };
  }

  const dry = cfg.dryRun || !certReady(cfg);
  let trackId = null;
  if (!dry) {
    const cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    xml = signEnvioLibro(xml, cert);
    if (input.upload !== false) {
      const { token } = await authenticate(cfg.endpoints, cert);
      const zip = await buildEnvioZip(xml, `LibroVenta${folioNotificacion}.xml`);
      const uploaded = await uploadDte({
        endpoints: cfg.endpoints,
        token,
        emitterRut: cfg.emitterRut,
        companyRut: cfg.emitterRut,
        zipBuffer: zip,
        fileName: `LibroVenta${folioNotificacion}.zip`
      });
      trackId = uploaded.trackId;
    }
  }

  const document = await persistLibro({
    cfg,
    op: 'VENTA',
    folioNotif: folioNotificacion,
    periodo,
    xml,
    trackId,
    dry,
    docs: rows,
    fctProp: null,
    setId,
    issuedBy: input.issuedBy
  });

  return {
    success: true,
    dryRun: dry,
    tipoOperacion: 'VENTA',
    folioNotificacion,
    periodoTributario: periodo,
    docsCount: rows.length,
    trackId,
    envioXmlUrl: publicXmlUrl(document.id),
    document
  };
}

/**
 * Libro de Compras ESPECIAL.
 * Body: { folioNotificacion: '5137074', docs: [...], fctProp: 0.6 }
 */
async function generateLibroCompras(input = {}) {
  const cfg = getConfig();
  const folioNotificacion = String(
    input.folioNotificacion || input.folioNotif || input.atencion || '5137074'
  ).replace(/\D/g, '');
  if (!folioNotificacion) {
    return { error: 'Indica el Folio de Notificación (Atención 5137074).' };
  }

  const rows = Array.isArray(input.docs) ? input.docs : (input.compras || []);
  if (!rows.length) {
    return {
      error: 'Pega la tabla de compras del SII como docs[] (tpoDoc, nroDoc, fchDoc, rutDoc, montos, ivaUsoComun…).'
    };
  }

  const fctProp = input.fctProp != null ? Number(input.fctProp) : 0.6;
  if (!(fctProp > 0) || fctProp > 1) {
    return { error: 'FctProp debe ser un factor entre 0 y 1 (certificación: 0.60).' };
  }

  const periodo = input.periodoTributario || earliestPeriod(rows);
  let xml;
  try {
    xml = buildEnvioLibroXml({
      tipoOperacion: 'COMPRA',
      folioNotificacion,
      periodoTributario: periodo,
      emitterRut: cfg.emitterRut,
      rutEnvia: input.rutEnvia || cfg.emitterRut,
      resolutionDate: cfg.emitterResolutionDate,
      resolutionNumber: cfg.emitterResolutionNumber,
      docs: rows,
      fctProp,
      envioId: input.envioId || `LibroCompra${folioNotificacion}`
    });
  } catch (err) {
    return { error: err.message || 'No se pudo armar el XML del libro de compras.' };
  }

  const dry = cfg.dryRun || !certReady(cfg);
  let trackId = null;
  if (!dry) {
    const cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    xml = signEnvioLibro(xml, cert);
    if (input.upload !== false) {
      const { token } = await authenticate(cfg.endpoints, cert);
      const zip = await buildEnvioZip(xml, `LibroCompra${folioNotificacion}.xml`);
      const uploaded = await uploadDte({
        endpoints: cfg.endpoints,
        token,
        emitterRut: cfg.emitterRut,
        companyRut: cfg.emitterRut,
        zipBuffer: zip,
        fileName: `LibroCompra${folioNotificacion}.zip`
      });
      trackId = uploaded.trackId;
    }
  }

  const document = await persistLibro({
    cfg,
    op: 'COMPRA',
    folioNotif: folioNotificacion,
    periodo,
    xml,
    trackId,
    dry,
    docs: rows,
    fctProp,
    setId: null,
    issuedBy: input.issuedBy
  });

  return {
    success: true,
    dryRun: dry,
    tipoOperacion: 'COMPRA',
    folioNotificacion,
    periodoTributario: periodo,
    fctProp,
    docsCount: rows.length,
    trackId,
    envioXmlUrl: publicXmlUrl(document.id),
    document
  };
}

module.exports = {
  generateLibroVentas,
  generateLibroCompras,
  certReady,
  isDirectConfigured
};

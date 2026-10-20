/**
 * Arma y envía un set de pruebas SII: varios DTE en un solo EnvioDTE.
 */
'use strict';

const { getConfig, isDirectConfigured } = require('./config');
const { generateManualInvoice } = require('./generateManualInvoice');
const { buildEnvioDte } = require('./xml/dte33');
const { signEnvio } = require('./crypto/xmldsig');
const { loadPkcs12 } = require('./crypto/certificate');
const { buildEnvioZip, uploadDte } = require('./sii/upload');
const { authenticate } = require('./sii/auth');
const { writeArtifact, publicXmlUrl, publicPdfUrl } = require('./storage');
const { normalizeSetCase } = require('./xml/referencia');
const { calculateManualInvoiceAmounts } = require('./amounts');
const repo = require('./repository');

/**
 * @param {object} input
 * @param {string|number} input.setId — ID numérico del set (correo SII)
 * @param {object[]} input.cases — casos en orden
 * @param {number} input.cases[].caseNumber
 * @param {33|61|46|43} input.cases[].dteType
 * @param {object} input.cases[].receptor
 * @param {object[]} [input.cases[].lines]
 * @param {number} [input.cases[].totalClp]
 * @param {object} [input.cases[].reference] — para NC
 */
async function generateCertificationSet(input = {}) {
  const setId = String(input.setId || '').replace(/\D/g, '');
  if (!setId) return { error: 'Indica el ID del set (el número que envió el SII).' };
  const cases = Array.isArray(input.cases) ? input.cases : [];
  if (cases.length < 1) return { error: 'Agrega al menos un caso del set.' };

  const cfg = getConfig();
  const dry = cfg.dryRun || !isDirectConfigured(cfg);
  const signedXmls = [];
  const documents = [];
  const counts = new Map();

  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i] || {};
    const caseNumber = parseInt(c.caseNumber ?? c.caso ?? (i + 1), 10) || (i + 1);
    const setCase = normalizeSetCase({ setId, caseNumber });
    let totalClp = c.totalClp != null ? c.totalClp : c.total;
    if (!(Number(totalClp) > 0) && Array.isArray(c.lines) && c.lines.length) {
      totalClp = calculateManualInvoiceAmounts({ lines: c.lines }).total;
    }
    const result = await generateManualInvoice({
      dteType: c.dteType || 33,
      receptor: c.receptor,
      lines: c.lines,
      totalClp,
      description: c.description,
      observation: c.observation,
      reference: c.reference || null,
      refFolio: c.refFolio,
      refDteType: c.refDteType,
      refDate: c.refDate,
      refCode: c.refCode,
      refReason: c.refReason,
      setCase,
      skipUpload: true,
      force: true,
      requestId: `set-${setId}-${caseNumber}-${Date.now().toString(36)}-${i}`,
      issuedBy: input.issuedBy || 'certification-set',
      notes: c.notes || `Set SII ${setCase.razonRef}`
    });
    if (result.error) {
      return {
        error: `Caso ${caseNumber}: ${result.error}`,
        documents,
        failedCase: caseNumber
      };
    }
    const doc = result.document;
    const xml = doc.meta?.documentoFirmadoXml;
    if (!xml) {
      return { error: `Caso ${caseNumber}: no se generó Documento firmado.`, documents };
    }
    signedXmls.push(xml);
    documents.push({
      id: doc.id,
      folio: doc.folio,
      dteType: doc.dteType,
      total: doc.total,
      receptorRut: doc.receptorRut,
      setCase: setCase.razonRef,
      pdfUrl: doc.pdfUrl
    });
    const t = Number(doc.dteType) || 33;
    counts.set(t, (counts.get(t) || 0) + 1);
  }

  const emitter = {
    rut: cfg.emitterRut,
    name: cfg.emitterName
  };
  const subTotales = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dteType, count]) => ({ dteType, count }));

  let envioXml = buildEnvioDte({
    emitter,
    documentoFirmadoXml: signedXmls,
    setDteId: `Set${setId}`,
    subTotales,
    caratula: {
      resolutionDate: cfg.emitterResolutionDate,
      resolutionNumber: cfg.emitterResolutionNumber,
      rutEnvia: cfg.emitterRut
    }
  });

  let trackId = null;
  if (!dry) {
    const cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    envioXml = signEnvio(envioXml, cert);
    const { token } = await authenticate(cfg.endpoints, cert);
    const zip = await buildEnvioZip(envioXml, `Set${setId}.xml`);
    const uploaded = await uploadDte({
      endpoints: cfg.endpoints,
      token,
      emitterRut: cfg.emitterRut,
      companyRut: cfg.emitterRut,
      zipBuffer: zip,
      fileName: `Set${setId}.zip`
    });
    trackId = uploaded.trackId;
  }

  const packId = `sii-set-${setId}-${Date.now().toString(36)}`;
  const xmlPath = writeArtifact(packId, 'xml', Buffer.from(envioXml, 'latin1'), cfg);
  const packDoc = {
    id: packId,
    requestId: `set-${setId}`,
    providerId: null,
    phase: 'certification_set',
    dteType: subTotales[0]?.dteType || 33,
    folio: documents[0]?.folio || 0,
    emitterRut: cfg.emitterRut,
    receptorRut: '60803000-K',
    receptorName: 'SERVICIO DE IMPUESTOS INTERNOS',
    neto: documents.reduce((s, d) => s + (d.total || 0), 0),
    iva: 0,
    total: documents.reduce((s, d) => s + (d.total || 0), 0),
    commissionClp: 0,
    cardFeeClp: 0,
    siiStatus: dry ? 'signed' : 'sent',
    trackId,
    xmlPath,
    xmlContent: envioXml,
    pdfUrl: publicPdfUrl(documents[0]?.id || packId),
    htmlContent: null,
    idempotencyHash: require('crypto').createHash('sha256').update(`set-${setId}-${packId}`).digest('hex'),
    environment: cfg.environment,
    errorMessage: null,
    signedAt: new Date().toISOString(),
    sentAt: dry ? null : new Date().toISOString(),
    acceptedAt: null,
    lastPollAt: null,
    meta: {
      dryRun: dry,
      certificationSet: true,
      setId,
      cases: documents,
      subTotales,
      kind: 'Set de pruebas SII'
    }
  };
  await repo.save(packDoc);

  return {
    success: true,
    dryRun: dry,
    setId,
    trackId,
    envioXmlUrl: publicXmlUrl(packId),
    documents,
    document: packDoc
  };
}

module.exports = {
  generateCertificationSet
};

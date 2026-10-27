/**
 * Módulo SII DTE directo (Open Source) — Fandez.
 *
 * Flujo:
 *  1) Socio sube su boleta/factura al cliente
 *  2) GenerateCommissionInvoice emite DTE 33 Fandez → socio
 *     (15% IVA incl. + costo pasarela)
 *  3) Firma XMLDSig + TED (CAF) → ZIP → UploadDTE → poll Track ID
 *
 * Proveedor alternativo legacy: lib/dte (mock / LibreDTE SaaS).
 * Este módulo se registra como DTE_PROVIDER=sii_direct
 */
'use strict';

const { getConfig, isDirectConfigured, resolveEnv } = require('./config');
const {
  generateCommissionInvoice,
  pickPartnerBilling,
  normalizeReceptor
} = require('./generateCommissionInvoice');
const {
  generateManualInvoice,
  generateCreditNote,
  generatePurchaseInvoice,
  generateLiquidationInvoice
} = require('./generateManualInvoice');
const { generateCertificationSet } = require('./generateCertificationSet');
const { normalizeDteType, dteKindLabel, shortTypeLabel } = require('./dteTypes');
const { lookupReceptor } = require('./rutLookup');
const {
  calculateCommissionInvoiceAmounts,
  calculateManualInvoiceAmounts
} = require('./amounts');
const repo = require('./repository');
const { startPollWorker, scheduleStatusPoll, pollOnce } = require('./jobs/pollStatus');
const { inspectBothEnvironments, saveCafUpload } = require('./folio/cafStore');

function optionalRequire(moduleId) {
  try {
    return require(moduleId);
  } catch (err) {
    console.warn('[sii-dte] no se pudo cargar', moduleId, err.message || err);
    return null;
  }
}

const librosMod = optionalRequire('./libros/generateLibros');
const generateLibroVentas = librosMod?.generateLibroVentas
  || (async () => ({ error: 'Libros SII no disponibles' }));
const generateLibroCompras = librosMod?.generateLibroCompras
  || (async () => ({ error: 'Libros SII no disponibles' }));

const cafAlerts = optionalRequire('./jobs/cafAlerts') || {};
const inspectAllCafs = cafAlerts.inspectAllCafs || (() => []);
const overallLevel = cafAlerts.overallLevel || (() => 'ok');
const startCafAlertWorker = cafAlerts.startCafAlertWorker || (() => {});
const scheduleCafAlertCheck = cafAlerts.scheduleCafAlertCheck || (() => {});
const checkCafAlerts = cafAlerts.checkCafAlerts || (async () => {});

function getStatus() {
  const cfg = getConfig();
  let cafs = [];
  try {
    cafs = inspectAllCafs(cfg);
  } catch (_) { /* panel sigue aunque un CAF esté mal */ }
  return {
    provider: 'sii_direct',
    environment: cfg.environment,
    dryRun: cfg.dryRun || !isDirectConfigured(cfg),
    configured: isDirectConfigured(cfg),
    storageDir: cfg.storageDir,
    dteEmail: cfg.emitterEmail || 'dte@fandez.cl',
    cafs,
    cafsByEnv: inspectBothEnvironments(cfg),
    cafLevel: overallLevel(cafs)
  };
}

/**
 * Adaptador compatible con lib/dte.issueDocument (fase fandez_margin).
 */
async function emitAsDteProvider({ request, billing, amount, phase, description }) {
  // billing aquí es del cliente; para comisión el receptor es el socio.
  const store = require('../../models/store');
  const partner = store.getUserById(request.providerId);
  const fin = request.financials || {};
  const result = await generateCommissionInvoice({
    requestId: request.id,
    partner,
    providerId: request.providerId,
    appTotal: amount || fin.appTotal,
    commissionClp: fin.laborCommission,
    cardFeeClp: fin.cardFee,
    phase: phase || 'fandez_margin',
    description
  });
  if (result.error) return result;
  const d = result.document;
  return {
    id: d.id,
    requestId: d.requestId,
    kind: 'factura',
    dteType: 33,
    phase: d.phase,
    folio: d.folio,
    amount: d.total,
    description: description || 'Comisión Fandez',
    lineDescription: description || 'Comisión Fandez',
    receptorRut: d.receptorRut,
    receptorName: d.receptorName,
    receptorEmail: d.meta?.partnerEmail || null,
    issuerRut: d.emitterRut,
    issuerName: d.meta?.emitterName,
    status: 'issued',
    provider: 'sii_direct',
    issuedAt: d.signedAt || d.createdAt,
    pdfUrl: d.pdfUrl,
    xmlUrl: null,
    siiStatus: d.siiStatus,
    trackId: d.trackId,
    dryRun: Boolean(result.dryRun || d.meta?.dryRun)
  };
}

module.exports = {
  getConfig,
  getStatus,
  isDirectConfigured,
  resolveEnv,
  generateCommissionInvoice,
  generateManualInvoice,
  generateCreditNote,
  generatePurchaseInvoice,
  generateLiquidationInvoice,
  generateCertificationSet,
  generateLibroVentas,
  generateLibroCompras,
  sendDocumentEmail: require('./sendDocumentEmail').sendDocumentEmail,
  normalizeDteType,
  dteKindLabel,
  shortTypeLabel,
  lookupReceptor,
  pickPartnerBilling,
  normalizeReceptor,
  calculateCommissionInvoiceAmounts,
  calculateManualInvoiceAmounts,
  findById: repo.findById,
  findByIdempotencyHash: repo.findByIdempotencyHash,
  listRecent: repo.listRecent,
  listForExport: repo.listForExport,
  ensureTable: repo.ensureTable,
  startPollWorker,
  scheduleStatusPoll,
  pollOnce,
  startCafAlertWorker,
  scheduleCafAlertCheck,
  checkCafAlerts,
  inspectAllCafs,
  inspectBothEnvironments,
  saveCafUpload,
  emitAsDteProvider
};

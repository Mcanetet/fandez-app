/**
 * Cola liviana in-process para consultar Track ID en el SII.
 * En Hostinger/PM2 corre en el mismo proceso Node; para multi-instancia
 * conviene Redis/Bull — aquí priorizamos cero infra extra.
 */
'use strict';

const { getConfig, isDirectConfigured } = require('../config');
const { loadPkcs12 } = require('../crypto/certificate');
const { authenticate } = require('../sii/auth');
const { queryUploadStatus } = require('../sii/status');
const repo = require('../repository');

const timers = new Map();

function scheduleStatusPoll(docId, attempt = 0) {
  if (!docId || timers.has(docId)) return;
  const cfg = getConfig();
  const delay = attempt === 0 ? 5000 : cfg.pollIntervalMs;
  const timer = setTimeout(() => {
    timers.delete(docId);
    pollOnce(docId, attempt).catch(() => {});
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(docId, timer);
}

async function pollOnce(docId, attempt = 0) {
  const cfg = getConfig();
  const doc = await repo.findById(docId);
  if (!doc || !doc.trackId) return;
  if (['accepted', 'rejected'].includes(doc.siiStatus)) return;
  if (cfg.dryRun || !isDirectConfigured(cfg)) return;

  try {
    // QueryEstUp en algunos ambientes no exige token fresco; reautenticamos por robustez.
    const cert = loadPkcs12(cfg.certificatePath, cfg.certificatePassword);
    await authenticate(cfg.endpoints, cert);
    const result = await queryUploadStatus({
      endpoints: cfg.endpoints,
      trackId: doc.trackId,
      emitterRut: doc.emitterRut
    });
    doc.siiStatus = result.siiStatus;
    doc.lastPollAt = new Date().toISOString();
    doc.meta = { ...(doc.meta || {}), lastSiiEstado: result.estado, lastSiiGlosa: result.glosa };
    if (result.siiStatus === 'accepted') doc.acceptedAt = doc.lastPollAt;
    if (result.siiStatus === 'rejected') doc.errorMessage = result.glosa || result.estado;
    await repo.save(doc);

    if (!['accepted', 'rejected'].includes(doc.siiStatus) && attempt + 1 < cfg.pollMaxAttempts) {
      scheduleStatusPoll(docId, attempt + 1);
    }
  } catch (err) {
    doc.lastPollAt = new Date().toISOString();
    doc.meta = { ...(doc.meta || {}), pollError: err.message };
    await repo.save(doc);
    if (attempt + 1 < cfg.pollMaxAttempts) scheduleStatusPoll(docId, attempt + 1);
  }
}

/** Barrido periódico de pendientes (arrancar desde app.js). */
function startPollWorker() {
  const cfg = getConfig();
  const tick = async () => {
    try {
      const pending = await repo.listPendingPoll(10);
      pending.forEach((d) => scheduleStatusPoll(d.id));
    } catch (_) { /* noop */ }
  };
  const handle = setInterval(tick, cfg.pollIntervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}

module.exports = {
  scheduleStatusPoll,
  pollOnce,
  startPollWorker
};

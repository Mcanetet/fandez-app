/**
 * Sofía — recordatorios de hitos de paisajismo (>48 h).
 * Cliente: valida avance pendiente.
 * Técnico: sube o corrige hito pendiente.
 */
'use strict';

const {
  listDeliverablesNeedingClientNudge,
  listDeliverablesNeedingTechNudge,
  ensureGardenDeliverables
} = require('../gardenDeliverables');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 h
const OLDER_THAN_MS = 48 * 60 * 60 * 1000;
const COOLDOWN_MS = 36 * 60 * 60 * 1000;

let timer = null;
let storeRef = null;

function markNudge(request, key) {
  if (!request.gardenNudgeLog || typeof request.gardenNudgeLog !== 'object') {
    request.gardenNudgeLog = {};
  }
  request.gardenNudgeLog[key] = new Date().toISOString();
}

function canNudge(request, key) {
  const prev = request.gardenNudgeLog?.[key];
  if (!prev) return true;
  const t = Date.parse(prev) || 0;
  return Date.now() - t >= COOLDOWN_MS;
}

async function notifyUser(userId, { title, body, url }) {
  if (!userId) return;
  try {
    const webPush = require('../webPush');
    if (webPush.isReady?.()) {
      await webPush.notifyUsers([userId], { title, body, url });
    }
  } catch (err) {
    console.warn('[gardenDeliverableNudge] push', err.message);
  }
  console.info(`[gardenDeliverableNudge] user=${userId} ${title}: ${body} ${url || ''}`);
}

async function tick() {
  if (!storeRef?.isReady?.()) return;
  const requests = storeRef.requests || [];
  for (const request of requests) {
    if (!request?.gardenIntake) continue;
    if (!['assigned', 'in_progress'].includes(request.status)) continue;
    if (request.techStatus === 'completado' || request.status === 'completed') continue;
    ensureGardenDeliverables(request);

    const clientPending = listDeliverablesNeedingClientNudge(request, { olderThanMs: OLDER_THAN_MS });
    if (clientPending.length && request.clientId && canNudge(request, 'client')) {
      const labels = clientPending.map((d) => d.clientLabel || d.label).slice(0, 3).join(', ');
      await notifyUser(request.clientId, {
        title: 'Valida el avance de tu jardín',
        body: `Hay hitos esperando tu OK hace más de 48 h: ${labels}.`,
        url: `/cliente/servicio/${request.serviceId || 'jardineria'}?tracking=${request.id}`
      });
      markNudge(request, 'client');
      try {
        const repository = require('../../models/repository');
        repository.persist(() => repository.saveRequest(request), `garden nudge client ${request.id}`);
      } catch (_) { /* ignore */ }
    }

    const techPending = listDeliverablesNeedingTechNudge(request, { olderThanMs: OLDER_THAN_MS });
    if (techPending.length && request.technicianId && canNudge(request, 'tech')) {
      const labels = techPending.map((d) => d.label).slice(0, 3).join(', ');
      await notifyUser(request.technicianId, {
        title: 'Hitos de paisajismo pendientes',
        body: `Sube o corrige: ${labels}.`,
        url: `/tecnico/trabajo/${request.id}`
      });
      markNudge(request, 'tech');
      try {
        const repository = require('../../models/repository');
        repository.persist(() => repository.saveRequest(request), `garden nudge tech ${request.id}`);
      } catch (_) { /* ignore */ }
    }
  }
}

function start(store) {
  storeRef = store;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    tick().catch((err) => console.warn('[gardenDeliverableNudge]', err.message));
  }, CHECK_INTERVAL_MS);
  setTimeout(() => {
    tick().catch(() => {});
  }, 45 * 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };

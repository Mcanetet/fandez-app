/**
 * Sofía — recordatorio por correo si el socio lleva ≥1 día con registro incompleto.
 * Corre cada hora; envía como máximo 1 correo / 24 h por socio.
 */

'use strict';

const notifications = require('../notifications');
const { getContractSummary, defaultProviderContract } = require('../contracts');
const { appBaseUrl } = require('../emailLayout');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let running = false;
let timer = null;

function providerRegisteredAt(provider) {
  const candidates = [
    provider.emailVerifiedAt,
    provider.memberSince ? `${String(provider.memberSince).slice(0, 10)}T12:00:00` : null,
    provider.createdAt
  ].filter(Boolean);
  for (const c of candidates) {
    const t = Date.parse(c);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function isDemoProvider(provider) {
  const email = String(provider.email || '').toLowerCase();
  if (provider.isDemo) return true;
  if (/@fandez\.cl$/i.test(email) && /demo|pedro|marta|juan|ana|tecnico\.pedro/.test(email)) return true;
  if (String(provider.id || '').includes('demo')) return true;
  return false;
}

/**
 * Qué le falta al socio (solo acciones que él puede completar).
 * Si solo espera revisión Fandez → no molestar.
 */
function actionableMissing(store, provider) {
  if (!provider || provider.role !== 'provider') return [];
  if (provider.active === false) return [];
  if (typeof store.ensureProviderFields === 'function') {
    store.ensureProviderFields(provider);
  }
  const gate = store.canProviderGoOnline(provider);
  if (gate.ok) return [];

  const status = gate.contract?.status || getContractSummary(provider.providerContract).status;
  const missing = (gate.missing || []).filter((m) => !/revisión legal/i.test(String(m)));

  if (status === 'pending_review' && !missing.length) return [];
  if (status === 'approved' && !missing.length) return [];

  return missing.length ? missing : ['completar tu registro de socio'];
}

function lastNudgeAt(provider) {
  const raw = provider?.providerContract?.sofiaIncompleteNudgeAt
    || provider?.verification?.sofiaIncompleteNudgeAt;
  const t = Date.parse(raw || '');
  return Number.isFinite(t) ? t : 0;
}

function markNudged(store, provider) {
  const now = new Date().toISOString();
  if (!provider.providerContract) {
    provider.providerContract = defaultProviderContract();
  }
  provider.providerContract.sofiaIncompleteNudgeAt = now;
  if (provider.verification) {
    provider.verification.sofiaIncompleteNudgeAt = now;
  }
  const repository = require('../../models/repository');
  repository.persist(() => repository.saveUser(provider), `sofia nudge ${provider.id}`);
}

async function nudgeProvider(store, provider, missing) {
  const contratoUrl = `${appBaseUrl()}/proveedor/contrato`;
  const perfilUrl = `${appBaseUrl()}/proveedor/perfil`;

  await notifications.sendEvent('sofia.provider_incomplete', {
    to: provider.email,
    provider,
    missing,
    contratoUrl,
    perfilUrl,
    meta: { agent: 'sofia', kind: 'incomplete_registration' }
  });

  markNudged(store, provider);
}

async function run(store) {
  if (running || !store?.isReady?.()) return { sent: 0, checked: 0 };
  running = true;
  let sent = 0;
  let checked = 0;
  try {
    const users = Array.isArray(store.USERS) ? store.USERS : [];
    const now = Date.now();

    for (const provider of users) {
      if (!provider || provider.role !== 'provider') continue;
      if (isDemoProvider(provider)) continue;
      if (!provider.email) continue;

      checked += 1;
      const missing = actionableMissing(store, provider);
      if (!missing.length) continue;

      const registeredAt = providerRegisteredAt(provider);
      if (!registeredAt || now - registeredAt < ONE_DAY_MS) continue;
      if (now - lastNudgeAt(provider) < ONE_DAY_MS) continue;

      try {
        await nudgeProvider(store, provider, missing);
        sent += 1;
      } catch (err) {
        console.error(`[sofia-incomplete] ${provider.id}:`, err.message);
      }
    }
    return { sent, checked };
  } finally {
    running = false;
  }
}

function start(store) {
  if (timer) return timer;
  const tick = () => {
    run(store).catch((err) => {
      console.error('[sofia-incomplete] watcher:', err.message);
    });
  };
  const boot = setTimeout(tick, 2 * 60 * 1000);
  boot.unref?.();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log('✓ Sofía: recordatorio registro incompleto socio (≥1 día)');
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  ONE_DAY_MS,
  CHECK_INTERVAL_MS,
  actionableMissing,
  providerRegisteredAt,
  isDemoProvider,
  run,
  start,
  stop
};

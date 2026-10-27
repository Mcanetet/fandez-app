/**
 * Avisos de CAF exigidos por la operación SII:
 *  - Res. Ex. N° 58/2017: vigencia 6 meses (DTE con crédito fiscal).
 *  - Folios agotados / por agotar: pedir timbraje nuevo antes de no poder emitir.
 *
 * No hay web service del SII que empuje el saldo: se calcula del CAF local
 * y se avisa a admin (panel + correo/Telegram/ntfy).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig, cafPathForType } = require('../config');
const { loadCafForType, inspectCaf } = require('../folio/caf');
const { shortTypeLabel } = require('../dteTypes');

const CAF_TYPES = [33, 61, 46, 43];
const DEBOUNCE_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 6 * 60 * 60 * 1000;

function statePath(cfg = getConfig()) {
  return path.join(cfg.storageDir || path.join(__dirname, '../../../data/dte/sii'), 'caf-alert-state.json');
}

function readState(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) {
    return {};
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function inspectLoadedCaf(dteType, cafPath) {
  try {
    if (!cafPath || !fs.existsSync(cafPath)) {
      return {
        dteType,
        missing: true,
        level: 'ok',
        alerts: [],
        remaining: null,
        nextFolio: null
      };
    }
    const caf = loadCafForType(dteType, cafPath);
    return { ...inspectCaf(caf, `${cafPath}.folio`), missing: false, path: cafPath };
  } catch (err) {
    return {
      dteType,
      missing: false,
      error: err.message,
      level: 'critical',
      alerts: [{ level: 'critical', code: 'invalid', message: `CAF tipo ${dteType}: ${err.message}` }]
    };
  }
}

function inspectAllCafs(cfg = getConfig()) {
  return CAF_TYPES.map((type) => inspectLoadedCaf(type, cafPathForType(cfg, type)));
}

function overallLevel(rows) {
  if (rows.some((r) => r.level === 'critical')) return 'critical';
  if (rows.some((r) => r.level === 'warning')) return 'warning';
  return 'ok';
}

function alertKeys(row) {
  const range = `${row.folioFrom || 0}-${row.folioTo || 0}`;
  return (row.alerts || []).map((a) => ({
    key: `${row.dteType}:${range}:${a.code}`,
    alert: a,
    row
  }));
}

function shouldNotify(state, key, nowMs) {
  const last = Date.parse(state[key] || '');
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= DEBOUNCE_MS;
}

function formatDigest(rows) {
  const lines = [
    'Control de folios SII (CAF local).',
    'Res. Ex. SII N° 58/2017: el CAF de factura/NC/liquidación vale 6 meses desde su autorización.',
    'Si vence o se agota, el SII rechaza el DTE. Pide timbraje nuevo en sii.cl y reemplaza el XML en data/secrets/sii.',
    ''
  ];
  for (const row of rows) {
    const label = shortTypeLabel(row.dteType);
    if (row.missing) {
      lines.push(`${label}: sin CAF cargado.`);
      continue;
    }
    if (row.error) {
      lines.push(`${label}: ${row.error}`);
      continue;
    }
    const next = row.nextFolio != null ? row.nextFolio : '—';
    const exp = row.expiresAt
      ? `vence ${row.expiresAt}${row.daysToExpiry != null ? ` (${row.daysToExpiry} días)` : ''}`
      : 'sin fecha FA';
    lines.push(
      `${label}: quedan ${row.remaining} / ${row.range} · siguiente ${next} · ${row.folioFrom}–${row.folioTo} · ${exp}`
    );
    for (const a of row.alerts || []) {
      lines.push(`  · ${a.message}`);
    }
  }
  return lines.join('\n');
}

async function notifyDueAlerts(rows, { force = false, now = new Date() } = {}) {
  const due = [];
  const file = statePath();
  const state = readState(file);
  const nowMs = now.getTime();

  for (const row of rows) {
    for (const item of alertKeys(row)) {
      if (force || shouldNotify(state, item.key, nowMs)) due.push(item);
    }
  }
  if (!due.length) return { sent: false, skipped: true, reason: 'no_due_alerts' };

  const titleLevel = due.some((d) => d.alert.level === 'critical') ? 'CRÍTICO' : 'AVISO';
  const title = `SII · ${titleLevel} folios CAF (${due.length})`;
  const body = formatDigest(rows.filter((r) => !r.missing || (r.alerts || []).length));

  let result = null;
  try {
    const adminNotify = require('../../aland/adminNotify');
    result = await adminNotify.notifyAdminFree({ title, body });
  } catch (err) {
    return { sent: false, error: err.message, due: due.map((d) => d.key) };
  }

  const stamped = now.toISOString();
  for (const item of due) state[item.key] = stamped;
  try {
    writeState(file, state);
  } catch (_) { /* no bloquear emisión */ }

  return { sent: true, title, keys: due.map((d) => d.key), result };
}

async function checkCafAlerts(opts = {}) {
  const cfg = getConfig();
  const cafs = inspectAllCafs(cfg);
  const notify = await notifyDueAlerts(cafs, opts);
  return {
    level: overallLevel(cafs),
    cafs,
    notify
  };
}

let scheduled = null;
function scheduleCafAlertCheck() {
  if (scheduled) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    checkCafAlerts().catch((err) => {
      console.warn('[sii-dte] caf alerts:', err.message || err);
    });
  }, 800);
  if (typeof scheduled.unref === 'function') scheduled.unref();
}

function startCafAlertWorker() {
  const tick = () => {
    checkCafAlerts().catch((err) => {
      console.warn('[sii-dte] caf alerts:', err.message || err);
    });
  };
  const first = setTimeout(tick, 15_000);
  if (typeof first.unref === 'function') first.unref();
  const handle = setInterval(tick, TICK_MS);
  if (typeof handle.unref === 'function') handle.unref();
  return handle;
}

module.exports = {
  CAF_TYPES,
  inspectAllCafs,
  inspectLoadedCaf,
  overallLevel,
  formatDigest,
  notifyDueAlerts,
  checkCafAlerts,
  scheduleCafAlertCheck,
  startCafAlertWorker,
  shouldNotify,
  alertKeys
};

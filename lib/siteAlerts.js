/**
 * Mensajes alerta del sitio (clientes / socios / todos).
 * Persistencia en app_settings + caché en memoria.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { ensureAppSettingsTable } = require('./appModeStore');

const KEY = 'site_alerts';
const IMAGE_DIR = path.join(__dirname, '../public/uploads/alerts');

const AUDIENCES = {
  clients: { id: 'clients', label: 'Clientes' },
  providers: { id: 'providers', label: 'Socios' },
  all: { id: 'all', label: 'Todos' }
};

function defaultLaunchAlert() {
  return {
    id: 'launch-oct-2026-clients',
    audience: 'clients',
    title: 'Lanzamiento oficial: octubre 2026',
    message:
      '¡Qué bueno tenerte con nosotros! Este septiembre te recibimos con los brazos abiertos mientras preparamos el gran debut de Fandez. En octubre 2026 abrimos con todo el servicio. Gracias por confiar desde el inicio — juntos vamos a cuidar más hogares.',
    imageUrl: null,
    enabled: true,
    tone: 'launch',
    dismissible: true,
    showOnAuth: true,
    showOnApp: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeAlert(raw = {}) {
  const audience = ['clients', 'providers', 'all'].includes(raw.audience) ? raw.audience : 'all';
  const tone = ['launch', 'info', 'warning', 'success'].includes(raw.tone) ? raw.tone : 'info';
  return {
    id: String(raw.id || uuidv4()),
    audience,
    title: String(raw.title || '').trim().slice(0, 120),
    message: String(raw.message || '').trim().slice(0, 800),
    imageUrl: raw.imageUrl ? String(raw.imageUrl).trim().slice(0, 500) : null,
    enabled: raw.enabled !== false,
    tone,
    dismissible: raw.dismissible !== false,
    showOnAuth: raw.showOnAuth !== false,
    showOnApp: raw.showOnApp !== false,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

let cache = {
  loaded: false,
  alerts: [defaultLaunchAlert()]
};

function parseSetting(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function loadFromDb() {
  if (!db.isConfigured()) return null;
  await ensureAppSettingsTable();
  const res = await db.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [KEY]
  );
  return parseSetting(res.rows?.[0]?.setting_value);
}

async function saveToDb(alerts) {
  if (!db.isConfigured()) {
    cache = { loaded: true, alerts };
    return alerts;
  }
  await ensureAppSettingsTable();
  const payload = JSON.stringify({
    alerts,
    updatedAt: new Date().toISOString()
  });
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [KEY, payload]
  );
  cache = { loaded: true, alerts };
  return alerts;
}

async function ensureHydrated() {
  if (cache.loaded) return cache.alerts;
  try {
    const data = await loadFromDb();
    if (data && Array.isArray(data.alerts) && data.alerts.length) {
      cache = { loaded: true, alerts: data.alerts.map(normalizeAlert) };
    } else {
      const seeded = [defaultLaunchAlert()];
      await saveToDb(seeded);
      return seeded;
    }
  } catch (err) {
    console.error('[siteAlerts] hydrate:', err.message);
    cache = { loaded: true, alerts: [defaultLaunchAlert()] };
  }
  return cache.alerts;
}

async function listAlerts() {
  const alerts = await ensureHydrated();
  return alerts.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function getAlert(id) {
  const alerts = await ensureHydrated();
  return alerts.find((a) => a.id === id) || null;
}

async function upsertAlert(input) {
  const alerts = await ensureHydrated();
  const existing = input.id ? alerts.find((a) => a.id === input.id) : null;
  let imageUrl = input.imageUrl;
  if (imageUrl === undefined) imageUrl = existing?.imageUrl || null;
  const next = normalizeAlert({
    ...existing,
    ...input,
    imageUrl,
    updatedAt: new Date().toISOString()
  });
  if (!next.title || !next.message) {
    throw new Error('Título y mensaje son obligatorios');
  }
  const idx = alerts.findIndex((a) => a.id === next.id);
  if (idx >= 0) {
    next.createdAt = alerts[idx].createdAt || next.createdAt;
    alerts[idx] = next;
  } else {
    alerts.unshift(next);
  }
  await saveToDb(alerts);
  return next;
}

async function setEnabled(id, enabled) {
  const alert = await getAlert(id);
  if (!alert) throw new Error('Alerta no encontrada');
  return upsertAlert({ ...alert, enabled: Boolean(enabled) });
}

async function deleteAlert(id) {
  const alerts = await ensureHydrated();
  const next = alerts.filter((a) => a.id !== id);
  if (next.length === alerts.length) throw new Error('Alerta no encontrada');
  await saveToDb(next);
  return true;
}

/**
 * @param {{ role?: string|null, surface?: 'auth'|'app', authRoleHint?: string|null }} ctx
 */
async function getVisibleAlerts(ctx = {}) {
  const alerts = await ensureHydrated();
  const surface = ctx.surface || 'app';
  const role = ctx.role || null;
  const hint = ctx.authRoleHint || null;

  return alerts.filter((a) => {
    if (!a.enabled) return false;
    if (surface === 'auth' && !a.showOnAuth) return false;
    if (surface === 'app' && !a.showOnApp) return false;

    if (a.audience === 'all') return true;

    if (surface === 'auth') {
      if (hint === 'provider') return a.audience === 'providers' || a.audience === 'all';
      if (hint === 'client') return a.audience === 'clients' || a.audience === 'all';
      // Login genérico: clientes + todos (lanzamiento clientes). Socios ven la suya en registro socio.
      return a.audience === 'clients' || a.audience === 'all';
    }

    if (role === 'client') return a.audience === 'clients' || a.audience === 'all';
    if (role === 'provider' || role === 'tecnico') return a.audience === 'providers' || a.audience === 'all';
    return a.audience === 'all';
  });
}

async function saveImageFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) throw new Error('Imagen inválida. Usa PNG, JPG o WebP.');
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  const buf = Buffer.from(match[3], 'base64');
  if (buf.length > 2.5 * 1024 * 1024) throw new Error('La imagen supera 2.5 MB');
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const filename = `alert-${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;
  const abs = path.join(IMAGE_DIR, filename);
  fs.writeFileSync(abs, buf);
  return `/uploads/alerts/${filename}`;
}

function audienceLabel(id) {
  return AUDIENCES[id]?.label || id;
}

module.exports = {
  AUDIENCES,
  audienceLabel,
  defaultLaunchAlert,
  listAlerts,
  getAlert,
  upsertAlert,
  setEnabled,
  deleteAlert,
  getVisibleAlerts,
  saveImageFromDataUrl,
  ensureHydrated
};

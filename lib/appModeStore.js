const appMode = require('./appMode');
const db = require('./db');

const KEY = 'app_mode_override';

async function ensureAppSettingsTable() {
  if (!db.isConfigured()) return;
  try {
    await db.raw(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value JSON NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    // Algunas versiones Hostinger no aceptan JSON: fallback TEXT
    if (/JSON|1064|4151/i.test(String(err.message || ''))) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key VARCHAR(64) PRIMARY KEY,
          setting_value TEXT NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      return;
    }
    throw err;
  }
}

async function hydrateAppModeOverride() {
  if (!db.isConfigured()) return null;
  try {
    await ensureAppSettingsTable();
    const res = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      [KEY]
    );
    const raw = res.rows?.[0]?.setting_value;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const mode = parsed?.mode;
    if (mode === 'demo' || mode === 'production') {
      appMode.setRuntimeOverride(mode);
      return mode;
    }
    if (mode === null || mode === 'env') {
      appMode.clearRuntimeOverride();
      return null;
    }
  } catch (_) { /* noop */ }
  return null;
}

async function persistAppModeOverride(mode) {
  if (!db.isConfigured()) throw new Error('Base de datos no configurada');
  await ensureAppSettingsTable();
  const next = mode == null || mode === 'env' ? null : String(mode).trim().toLowerCase();
  if (next && next !== 'demo' && next !== 'production') {
    throw new Error('Modo inválido. Usa demo o production.');
  }
  const payload = JSON.stringify({
    mode: next,
    updatedAt: new Date().toISOString()
  });
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [KEY, payload]
  );
  if (!next) appMode.clearRuntimeOverride();
  else appMode.setRuntimeOverride(next);
  return appMode.getPublicStatus();
}

module.exports = {
  hydrateAppModeOverride,
  persistAppModeOverride,
  ensureAppSettingsTable
};

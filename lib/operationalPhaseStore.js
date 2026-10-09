const db = require('./db');
const operationalPhase = require('./operationalPhase');

const KEY_PHASE = 'operational_phase';
const KEY_RIBBON = 'show_demo_ribbon';

async function ensureAppSettingsTable() {
  return require('./appModeStore').ensureAppSettingsTable();
}

async function readSetting(key) {
  if (!db.isConfigured()) return null;
  await ensureAppSettingsTable();
  const res = await db.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  const raw = res.rows?.[0]?.setting_value;
  if (raw == null) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function writeSetting(key, value) {
  if (!db.isConfigured()) throw new Error('Base de datos no configurada');
  await ensureAppSettingsTable();
  const payload = JSON.stringify(value);
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, payload]
  );
}

async function hydrateOperationalPhase() {
  if (!db.isConfigured()) return null;
  try {
    const phaseRow = await readSetting(KEY_PHASE);
    const ribbonRow = await readSetting(KEY_RIBBON);
    if (phaseRow?.phase === 'demo' || phaseRow?.phase === 'productivo') {
      operationalPhase.setRuntimePhase(phaseRow.phase);
    }
    if (ribbonRow && typeof ribbonRow.show === 'boolean') {
      operationalPhase.setRuntimeRibbon(ribbonRow.show);
    }
    return operationalPhase.getPublicStatus();
  } catch (_) {
    return null;
  }
}

async function persistOperationalPhase(phase, options = {}) {
  const next = String(phase || '').trim().toLowerCase();
  if (next !== 'demo' && next !== 'productivo') {
    throw new Error('Fase inválida. Usa demo o productivo.');
  }

  let operationalReset = null;
  if (next === 'productivo' && options.purgeOperational) {
    const reset = require('./productivoOperationalReset');
    if (!reset.isValidGoLiveConfirm(options.confirmGoLive)) {
      throw new Error('Confirmación requerida: escribe PRODUCTIVO_CERO para limpiar datos operativos.');
    }
    if (!options.store) {
      throw new Error('No se pudo ejecutar la limpieza operativa (store).');
    }
    operationalReset = await reset.runProductivoOperationalReset(options.store);
  }

  operationalPhase.setRuntimePhase(next);
  operationalPhase.setRuntimeRibbon(next === 'demo');
  await writeSetting(KEY_PHASE, { phase: next, updatedAt: new Date().toISOString() });
  await writeSetting(KEY_RIBBON, { show: next === 'demo', updatedAt: new Date().toISOString() });
  const mp = require('./mercadopago');
  mp.resetClient?.();
  return {
    success: true,
    ...operationalPhase.getPublicStatus(),
    appMode: require('./appMode').getPublicStatus(),
    operationalReset
  };
}

module.exports = {
  hydrateOperationalPhase,
  persistOperationalPhase
};

/**
 * Soft launch: septiembre = reclutamiento de socios; octubre = operación.
 * El aviso se oculta solo a partir del 1 de octubre (hora Chile).
 *
 * Huincha “Modo DEMO”: independiente de APP_MODE (pagos). Se controla con
 * SHOW_DEMO_RIBBON=true|false. Si no está definida, se muestra durante el
 * soft launch (antes de OPERATIONS_START) o si APP_MODE=demo.
 */
'use strict';

const OPERATIONS_START_ISO = '2026-10-01T00:00:00-03:00';

function isPreOperations(now = Date.now()) {
  return now < Date.parse(OPERATIONS_START_ISO);
}

function envBool(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return null;
}

/**
 * ¿Mostrar la huincha global de modo DEMO / reclutamiento?
 * - SHOW_DEMO_RIBBON=true|false fuerza el valor
 * - Si no hay variable: visible en APP_MODE=demo o antes del inicio de operaciones
 * - Fallback: visible (reclutamiento) hasta que se apague explícitamente
 */
function showDemoRibbonFromEnvOnly(now = Date.now()) {
  const forced = envBool('SHOW_DEMO_RIBBON');
  if (forced != null) return forced;
  try {
    const appMode = require('./appMode');
    if (appMode.isDemoMode()) return true;
  } catch (_) { /* ignore */ }
  if (isPreOperations(now)) return true;
  return true;
}

function showDemoRibbon(now = Date.now()) {
  try {
    const op = require('./operationalPhase');
    if (op.getPhaseSync() === 'productivo') return false;
    if (op.getPhaseSync() === 'demo') return true;
  } catch (_) { /* ignore */ }
  return showDemoRibbonFromEnvOnly(now);
}

module.exports = {
  OPERATIONS_START_ISO,
  isPreOperations,
  showDemoRibbon,
  showDemoRibbonFromEnvOnly
};

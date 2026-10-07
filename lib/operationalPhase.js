/**
 * Fase comercial Fandez: demo (MP prueba) vs productivo (MP producción).
 * Se persiste desde admin y define qué par de credenciales Mercado Pago usa la app.
 */
const VALID = new Set(['demo', 'productivo']);

/** @type {'demo'|'productivo'|null} */
let phaseOverride = null;
/** @type {boolean|null} */
let ribbonOverride = null;

function setRuntimePhase(phase) {
  if (phase == null || phase === '' || phase === 'auto') {
    phaseOverride = null;
    return;
  }
  const next = String(phase).trim().toLowerCase();
  if (!VALID.has(next)) throw new Error('Fase inválida');
  phaseOverride = next;
}

function setRuntimeRibbon(show) {
  if (show == null || show === '') {
    ribbonOverride = null;
    return;
  }
  ribbonOverride = Boolean(show);
}

function clearRuntimePhase() {
  phaseOverride = null;
  ribbonOverride = null;
}

function getPhaseSync() {
  if (phaseOverride && VALID.has(phaseOverride)) return phaseOverride;

  const appMode = require('./appMode');
  if (appMode.isDemoMode()) return 'demo';

  if (ribbonOverride === true) return 'demo';
  if (ribbonOverride === false) return 'productivo';

  try {
    const launch = require('./launchNotice');
    if (launch.showDemoRibbonFromEnvOnly()) return 'demo';
  } catch (_) { /* noop */ }

  return 'productivo';
}

function isDemoPhase() {
  return getPhaseSync() === 'demo';
}

function getPublicStatus() {
  const phase = getPhaseSync();
  return {
    phase,
    isDemoPhase: phase === 'demo',
    isProductivoPhase: phase === 'productivo',
    mpCredentials: phase === 'demo' ? 'test' : 'live',
    overrideActive: Boolean(phaseOverride),
    ribbonOverrideActive: ribbonOverride != null
  };
}

module.exports = {
  setRuntimePhase,
  setRuntimeRibbon,
  clearRuntimePhase,
  getPhaseSync,
  isDemoPhase,
  getPublicStatus
};

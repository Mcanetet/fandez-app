/**
 * Acuerdo de pago socio → técnico (por técnico y, opcionalmente, por servicio).
 * mode: 'percent' (% del neto del socio) | 'fixed' (monto fijo CLP por visita).
 */

function clampPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v * 100) / 100));
}

function clampFixed(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.min(v, 50_000_000);
}

function normalizePayRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = String(raw.mode || '').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
  if (mode === 'fixed') {
    const value = clampFixed(raw.value);
    if (value == null) return null;
    return { mode, value };
  }
  const value = clampPercent(raw.value);
  if (value == null) return null;
  return { mode: 'percent', value };
}

function normalizePayTerms(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const baseSource = raw.default && typeof raw.default === 'object'
    ? raw.default
    : (raw.mode ? raw : null);
  const def = normalizePayRule(baseSource);
  if (!def) return null;

  const byService = {};
  const map = raw.byService && typeof raw.byService === 'object' ? raw.byService : {};
  Object.entries(map).forEach(([serviceId, rule]) => {
    const id = String(serviceId || '').trim();
    if (!id) return;
    const normalized = normalizePayRule(rule);
    if (normalized) byService[id] = normalized;
  });

  return {
    default: def,
    byService
  };
}

function getPayTermsForProvider(tecnico, providerId) {
  if (!tecnico || !providerId) return null;
  const map = tecnico.payTermsByProvider;
  if (!map || typeof map !== 'object') return null;
  return normalizePayTerms(map[providerId]);
}

function resolvePayRule(terms, serviceId) {
  if (!terms) return null;
  const sid = String(serviceId || '').trim();
  if (sid && terms.byService && terms.byService[sid]) {
    return { ...terms.byService[sid], source: 'service', serviceId: sid };
  }
  return { ...terms.default, source: 'default' };
}

function formatPayRuleLabel(rule, formatCLP) {
  if (!rule) return 'Sin acuerdo definido';
  if (rule.mode === 'fixed') {
    const fmt = typeof formatCLP === 'function' ? formatCLP(rule.value) : `$${rule.value}`;
    return `${fmt} fijo por visita`;
  }
  return `${rule.value}% del neto del socio`;
}

/**
 * Calcula lo que corresponde al técnico sobre el neto del socio.
 * @param {number} providerPayout neto empresa (después de comisión Fandez / MP)
 * @param {{mode:string,value:number}|null} rule
 */
function computeTechnicianPayout(providerPayout, rule) {
  const base = Math.max(0, Math.round(Number(providerPayout) || 0));
  if (!rule) {
    return {
      technicianPayout: null,
      providerKeep: base,
      configured: false,
      mode: null,
      value: null
    };
  }
  let technicianPayout = 0;
  if (rule.mode === 'fixed') {
    technicianPayout = Math.min(base, Math.max(0, Math.round(Number(rule.value) || 0)));
  } else {
    const pct = Math.max(0, Math.min(100, Number(rule.value) || 0));
    technicianPayout = Math.round(base * (pct / 100));
  }
  technicianPayout = Math.max(0, Math.min(base, technicianPayout));
  return {
    technicianPayout,
    providerKeep: Math.max(0, base - technicianPayout),
    configured: true,
    mode: rule.mode,
    value: rule.value,
    source: rule.source || 'default',
    serviceId: rule.serviceId || null
  };
}

module.exports = {
  normalizePayRule,
  normalizePayTerms,
  getPayTermsForProvider,
  resolvePayRule,
  formatPayRuleLabel,
  computeTechnicianPayout
};

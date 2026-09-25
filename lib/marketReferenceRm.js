/**
 * Referencias de precio de mercado — Región Metropolitana (Chile).
 * Orientativo para admin (no es cotización en vivo).
 * Fuentes tipificadas: talleres independientes, apps locales, retail (Sodimac/Easy) y rangos de oficio RM.
 */
'use strict';

const REGION = 'RM';
const UPDATED = '2026-09';
const SOURCES_LABOR = [
  'Referencia RM: cotizaciones de oficio, apps locales y talleres (orientativo, IVA incl.)'
];
const SOURCES_MATERIALS = [
  'Referencia RM: retail (Sodimac/Easy) y ferretería mayorista (orientativo)'
];

function roundClp(n, step = 1000) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v / step) * step;
}

function clampInt(n, fallback = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Rango de mercado laboral a partir del precio Fandez (si no hay override). */
function laborMarketFromBase(basePrice) {
  const mid = roundClp(basePrice, 1000);
  return {
    region: REGION,
    low: roundClp(mid * 0.85, 1000),
    mid,
    high: roundClp(mid * 1.3, 1000),
    sources: SOURCES_LABOR,
    updatedAt: UPDATED
  };
}

function materialMarketBand(marketPrice) {
  const mid = roundClp(marketPrice, 100);
  return {
    region: REGION,
    low: roundClp(mid * 0.9, 100),
    mid,
    high: roundClp(mid * 1.25, 100),
    sources: SOURCES_MATERIALS,
    updatedAt: UPDATED
  };
}

function normalizeMarketRef(raw, { fallbackMid = 0, step = 1000 } = {}) {
  const mid = clampInt(raw?.mid, fallbackMid);
  const low = clampInt(raw?.low, roundClp(mid * 0.85, step));
  const high = clampInt(raw?.high, roundClp(mid * 1.25, step));
  return {
    region: REGION,
    low: Math.min(low, mid || low),
    mid,
    high: Math.max(high, mid || high),
    sources: Array.isArray(raw?.sources) && raw.sources.length ? raw.sources : SOURCES_LABOR,
    updatedAt: String(raw?.updatedAt || UPDATED).slice(0, 32)
  };
}

function normalizeCatalogMarketRefs(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, ref] of Object.entries(raw)) {
    if (!id || !ref) continue;
    out[String(id)] = normalizeMarketRef(ref, { fallbackMid: 0, step: 1000 });
  }
  return out;
}

/**
 * Δ% Fandez vs mercado mid.
 * negativo = Fandez más barato que el mercado.
 */
function deltaVsMarket(fandezPrice, marketMid) {
  const f = Number(fandezPrice);
  const m = Number(marketMid);
  if (!Number.isFinite(f) || !Number.isFinite(m) || m <= 0) {
    return { pct: null, label: '—', tone: 'neutral' };
  }
  const pct = Math.round(((f - m) / m) * 1000) / 10;
  if (Math.abs(pct) <= 5) return { pct, label: `${pct > 0 ? '+' : ''}${pct}% · al mercado`, tone: 'ok' };
  if (pct < -5) return { pct, label: `${pct}% · bajo mercado`, tone: 'low' };
  return { pct, label: `+${pct}% · sobre mercado`, tone: 'high' };
}

function enrichServiceCatalog(serviceCatalog, pricing = {}) {
  const refs = pricing.catalogMarketRefs || {};
  return (Array.isArray(serviceCatalog) ? serviceCatalog : []).map((specialty) => {
    const activities = (specialty.activities || []).map((activity) => {
      const base = Number(activity.basePrice) || 0;
      const fallback = laborMarketFromBase(base);
      const saved = refs[activity.id];
      const market = saved
        ? normalizeMarketRef(saved, { fallbackMid: saved.mid || fallback.mid, step: 1000 })
        : fallback;
      const delta = deltaVsMarket(base, market.mid);
      return { ...activity, market, delta };
    });
    const withMid = activities.filter((a) => a.market?.mid > 0);
    const avgPct = withMid.length
      ? Math.round(
        (withMid.reduce((s, a) => s + (a.delta.pct || 0), 0) / withMid.length) * 10
      ) / 10
      : null;
    return {
      ...specialty,
      activities,
      marketSummary: {
        count: activities.length,
        avgPct,
        label: avgPct == null
          ? '—'
          : (Math.abs(avgPct) <= 5
            ? `${avgPct > 0 ? '+' : ''}${avgPct}% vs RM`
            : `${avgPct > 0 ? '+' : ''}${avgPct}% vs RM`)
      }
    };
  });
}

const APP_SERVICES = [
  { id: 'gasfiter', name: 'Gasfitería' },
  { id: 'electrico', name: 'Electricidad' },
  { id: 'aires', name: 'Aire acondicionado' },
  { id: 'termos', name: 'Termos' },
  { id: 'cerrajero', name: 'Cerrajería' },
  { id: 'calderas', name: 'Calderas' },
  { id: 'generadores', name: 'Generadores' },
  { id: 'pintura', name: 'Pintura' },
  { id: 'jardineria', name: 'Jardinería y paisajismo' },
  { id: 'limpieza', name: 'Limpieza' },
  { id: 'otros', name: 'Otros' }
];

function enrichMaterial(m) {
  const mid = Number(m.marketPrice) || 0;
  const band = materialMarketBand(mid);
  const low = clampInt(m.marketLow, band.low);
  const high = clampInt(m.marketHigh, band.high);
  const market = {
    region: REGION,
    low: Math.min(low, mid || low),
    high: Math.max(high, mid || high),
    mid,
    sources: SOURCES_MATERIALS,
    updatedAt: UPDATED
  };
  let delta;
  if (!mid) {
    delta = { pct: null, label: '—', tone: 'neutral' };
  } else if (mid < market.low) {
    const pct = Math.round(((mid - market.low) / market.low) * 1000) / 10;
    delta = { pct, label: `${pct}% · bajo retail RM`, tone: 'low' };
  } else if (mid > market.high) {
    const pct = Math.round(((mid - market.high) / market.high) * 1000) / 10;
    delta = { pct, label: `+${pct}% · sobre retail RM`, tone: 'high' };
  } else {
    delta = { pct: 0, label: 'Dentro rango RM', tone: 'ok' };
  }
  return { ...m, marketLow: market.low, marketHigh: market.high, market, delta };
}

/**
 * Agrupa materiales por especialidad (acordeón).
 * Cada material aparece una sola vez (primera especialidad), para no duplicar el form.
 */
function groupMaterialsBySpecialty(materialsCatalog) {
  const list = (Array.isArray(materialsCatalog) ? materialsCatalog : []).map(enrichMaterial);
  const byId = new Map(APP_SERVICES.map((s) => [s.id, { ...s, materials: [] }]));
  const general = { id: '_general', name: 'Sin especialidad / todos', materials: [] };

  list.forEach((m) => {
    const specs = Array.isArray(m.specialtyIds) ? m.specialtyIds.filter(Boolean) : [];
    if (!specs.length) {
      general.materials.push(m);
      return;
    }
    const primary = specs.find((sid) => byId.has(sid)) || specs[0];
    const g = byId.get(primary);
    if (g) g.materials.push(m);
    else general.materials.push(m);
  });

  const groups = APP_SERVICES
    .map((s) => byId.get(s.id))
    .filter((g) => g && g.materials.length);
  if (general.materials.length) groups.push(general);
  return { appServices: APP_SERVICES, groups, all: list };
}

module.exports = {
  REGION,
  UPDATED,
  APP_SERVICES,
  laborMarketFromBase,
  materialMarketBand,
  normalizeMarketRef,
  normalizeCatalogMarketRefs,
  deltaVsMarket,
  enrichServiceCatalog,
  enrichMaterial,
  groupMaterialsBySpecialty,
  roundClp
};

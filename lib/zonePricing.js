const { haversineKm, staticCommuneCenter, nearestRmCommuneSlug } = require('./geocode');
const { findCommuneByName, slugify } = require('./chile-geo');

const DEFAULT_ORIGIN = {
  regionCode: 'region-metropolitana',
  communeCode: 'nunoa',
  label: 'Ñuñoa',
  lat: -33.456,
  lng: -70.598
};

/** Recargo por comuna desde el hub (Ñuñoa). Editable en Admin → Precios. */
const DEFAULT_COMMUNE_SURCHARGES = [
  { code: 'nunoa', name: 'Ñuñoa', percent: 0 },
  { code: 'providencia', name: 'Providencia', percent: 5 },
  { code: 'las-condes', name: 'Las Condes', percent: 10 },
  { code: 'la-reina', name: 'La Reina', percent: 10 },
  { code: 'vitacura', name: 'Vitacura', percent: 15 },
  { code: 'lo-barnechea', name: 'Lo Barnechea', percent: 20 },
  { code: 'colina', name: 'Colina', percent: 20 }
];

const DEFAULT_ZONE_PRICING = {
  enabled: true,
  /** commune = % por comuna (recomendado). bands/per_km = legado distancia. */
  mode: 'commune',
  origin: { ...DEFAULT_ORIGIN },
  communes: DEFAULT_COMMUNE_SURCHARGES.map((row) => ({ ...row })),
  /** Si la comuna no está en la tabla. */
  defaultCommunePercent: 15,
  distance: {
    mode: 'bands',
    freeKm: 3,
    percentPerKm: 1.25,
    maxDistancePercent: 22,
    roadFactor: 1.2,
    bands: [
      { maxKm: 4, percent: 0 },
      { maxKm: 8, percent: 5 },
      { maxKm: 12, percent: 10 },
      { maxKm: 18, percent: 16 },
      { maxKm: 999, percent: 22 }
    ]
  },
  supply: {
    enabled: false,
    radiusKm: 14,
    tiers: [
      { minTechs: 5, percent: 0 },
      { minTechs: 3, percent: 4 },
      { minTechs: 2, percent: 9 },
      { minTechs: 1, percent: 16 },
      { minTechs: 0, percent: 24 }
    ]
  },
  maxTotalPercent: 35
};

function clampPercent(val, fallback = 0) {
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(-50, n));
}

function parseCoord(val, fallback) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDistanceBands(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_ZONE_PRICING.distance.bands;
  const bands = source
    .map((row) => ({
      maxKm: Math.max(0.1, parseFloat(row.maxKm) || 999),
      percent: clampPercent(row.percent, 0)
    }))
    .sort((a, b) => a.maxKm - b.maxKm);
  return bands.length ? bands : DEFAULT_ZONE_PRICING.distance.bands.slice();
}

function normalizeSupplyTiers(raw) {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_ZONE_PRICING.supply.tiers;
  const tiers = source
    .map((row) => ({
      minTechs: Math.max(0, parseInt(row.minTechs, 10) || 0),
      percent: clampPercent(row.percent, 0)
    }))
    .sort((a, b) => b.minTechs - a.minTechs);
  return tiers.length ? tiers : DEFAULT_ZONE_PRICING.supply.tiers.slice();
}

function normalizeCommunes(raw) {
  const source = Array.isArray(raw) && raw.length
    ? raw
    : DEFAULT_COMMUNE_SURCHARGES;
  const seen = new Set();
  const rows = [];
  for (const row of source) {
    const code = slugify(row.code || row.name || '');
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const fromDefault = DEFAULT_COMMUNE_SURCHARGES.find((d) => d.code === code);
    rows.push({
      code,
      name: String(row.name || fromDefault?.name || code).trim() || code,
      percent: clampPercent(
        row.percent != null ? row.percent : fromDefault?.percent,
        fromDefault?.percent ?? 0
      )
    });
  }
  return rows.length
    ? rows.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name, 'es'))
    : DEFAULT_COMMUNE_SURCHARGES.map((r) => ({ ...r }));
}

function normalizeZonePricing(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const originSrc = src.origin && typeof src.origin === 'object' ? src.origin : {};
  const distSrc = src.distance && typeof src.distance === 'object' ? src.distance : {};
  const supplySrc = src.supply && typeof src.supply === 'object' ? src.supply : {};

  const staticHit = staticCommuneCenter('Ñuñoa', 'Región Metropolitana');
  const originDefaults = {
    ...DEFAULT_ORIGIN,
    lat: staticHit?.lat ?? DEFAULT_ORIGIN.lat,
    lng: staticHit?.lng ?? DEFAULT_ORIGIN.lng
  };

  const origin = {
    regionCode: String(originSrc.regionCode || originDefaults.regionCode).trim() || originDefaults.regionCode,
    communeCode: String(originSrc.communeCode || originDefaults.communeCode).trim() || originDefaults.communeCode,
    label: String(originSrc.label || originDefaults.label).trim() || originDefaults.label,
    lat: parseCoord(originSrc.lat, originDefaults.lat),
    lng: parseCoord(originSrc.lng, originDefaults.lng)
  };

  const hasCommuneTable = Array.isArray(src.communes) && src.communes.length > 0;
  // Migración: configs viejas (solo tramos km + oferta) → tabla por comuna, sin oferta.
  const migrating = !hasCommuneTable;
  const requestedMode = String(src.mode || distSrc.mode || '').toLowerCase();
  let mode = 'commune';
  if (!migrating && (requestedMode === 'bands' || requestedMode === 'per_km')) {
    mode = requestedMode;
  } else if (!migrating && requestedMode === 'commune') {
    mode = 'commune';
  }

  return {
    enabled: src.enabled !== false,
    mode,
    origin,
    communes: normalizeCommunes(src.communes),
    defaultCommunePercent: clampPercent(
      src.defaultCommunePercent,
      DEFAULT_ZONE_PRICING.defaultCommunePercent
    ),
    distance: {
      mode: distSrc.mode === 'per_km' ? 'per_km' : 'bands',
      freeKm: Math.max(0, parseFloat(distSrc.freeKm) || DEFAULT_ZONE_PRICING.distance.freeKm),
      percentPerKm: Math.max(0, parseFloat(distSrc.percentPerKm) || DEFAULT_ZONE_PRICING.distance.percentPerKm),
      maxDistancePercent: clampPercent(
        distSrc.maxDistancePercent,
        DEFAULT_ZONE_PRICING.distance.maxDistancePercent
      ),
      roadFactor: Math.max(1, Math.min(2, parseFloat(distSrc.roadFactor) || DEFAULT_ZONE_PRICING.distance.roadFactor)),
      bands: normalizeDistanceBands(distSrc.bands)
    },
    supply: {
      enabled: migrating ? false : supplySrc.enabled === true,
      radiusKm: Math.max(1, parseFloat(supplySrc.radiusKm) || DEFAULT_ZONE_PRICING.supply.radiusKm),
      tiers: normalizeSupplyTiers(supplySrc.tiers)
    },
    maxTotalPercent: clampPercent(src.maxTotalPercent, DEFAULT_ZONE_PRICING.maxTotalPercent)
  };
}

function effectiveDistanceKm(origin, lat, lng, roadFactor) {
  const straight = haversineKm(origin.lat, origin.lng, lat, lng);
  return Math.round(straight * roadFactor * 10) / 10;
}

function distancePercent(cfg, distanceKm) {
  const dist = cfg.distance;
  if (dist.mode === 'per_km') {
    const billable = Math.max(0, distanceKm - dist.freeKm);
    const pct = billable * dist.percentPerKm;
    return Math.min(dist.maxDistancePercent, Math.round(pct * 10) / 10);
  }
  for (const band of dist.bands) {
    if (distanceKm <= band.maxKm) return band.percent;
  }
  const last = dist.bands[dist.bands.length - 1];
  return last ? last.percent : 0;
}

function supplyPercent(cfg, techCount) {
  if (!cfg.supply.enabled) return 0;
  const count = Math.max(0, parseInt(techCount, 10) || 0);
  for (const tier of cfg.supply.tiers) {
    if (count >= tier.minTechs) return tier.percent;
  }
  const last = cfg.supply.tiers[cfg.supply.tiers.length - 1];
  return last ? last.percent : 0;
}

function resolveCommuneCode(ctx = {}) {
  const direct = slugify(ctx.communeCode || '');
  if (direct) return direct;

  const byName = findCommuneByName(ctx.communeName || '');
  if (byName?.code) return byName.code;

  const fromAddress = String(ctx.address || '');
  if (fromAddress) {
    const hit = findCommuneByName(fromAddress)
      || (() => {
        const parts = fromAddress.split(',').map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
          const m = findCommuneByName(part);
          if (m) return m;
        }
        return null;
      })();
    if (hit?.code) return hit.code;
  }

  const lat = parseFloat(ctx.lat);
  const lng = parseFloat(ctx.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return nearestRmCommuneSlug(lat, lng);
  }
  return null;
}

function communePercent(cfg, communeCode) {
  const code = slugify(communeCode || '');
  if (!code) return clampPercent(cfg.defaultCommunePercent, 0);
  const row = (cfg.communes || []).find((c) => c.code === code);
  if (row) return row.percent;
  // Hub sin recargo aunque no esté en tabla
  if (code === slugify(cfg.origin?.communeCode || 'nunoa')) return 0;
  return clampPercent(cfg.defaultCommunePercent, 0);
}

function communeLabel(cfg, communeCode) {
  const code = slugify(communeCode || '');
  const row = (cfg.communes || []).find((c) => c.code === code);
  if (row?.name) return row.name;
  const hit = findCommuneByName(code.replace(/-/g, ' '));
  return hit?.name || code || 'Zona';
}

/**
 * Ajusta el valor base antes de horario × urgencia.
 * @returns {{ valorBase: number, zone: object|null }}
 */
function applyZonePricing(valorBase, pricingRaw, ctx = {}) {
  const baseAmount = Math.max(0, parseInt(valorBase, 10) || 0);
  const cfg = normalizeZonePricing(pricingRaw?.zonePricing || pricingRaw);
  if (!cfg.enabled || baseAmount <= 0) {
    return { valorBase: baseAmount, zone: null };
  }

  const lat = parseFloat(ctx.lat);
  const lng = parseFloat(ctx.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const communeCode = resolveCommuneCode(ctx);

  if (cfg.mode === 'commune') {
    if (!communeCode && !hasCoords) {
      return { valorBase: baseAmount, zone: null };
    }
    const code = communeCode || (hasCoords ? nearestRmCommuneSlug(lat, lng) : null);
    if (!code) return { valorBase: baseAmount, zone: null };

    const zonePct = communePercent(cfg, code);
    const techCount = ctx.supplyCount != null ? ctx.supplyCount : null;
    const supPct = techCount != null ? supplyPercent(cfg, techCount) : 0;
    let totalPct = zonePct + supPct;
    totalPct = Math.min(cfg.maxTotalPercent, Math.round(totalPct * 10) / 10);

    const adjusted = Math.round(baseAmount * (1 + totalPct / 100));
    const amount = adjusted - baseAmount;
    const distanceKm = hasCoords
      ? effectiveDistanceKm(cfg.origin, lat, lng, cfg.distance.roadFactor)
      : null;

    return {
      valorBase: adjusted,
      zone: {
        mode: 'commune',
        originLabel: cfg.origin.label,
        communeCode: code,
        communeName: communeLabel(cfg, code),
        distanceKm,
        distancePercent: zonePct,
        communePercent: zonePct,
        supplyCount: techCount,
        supplyPercent: supPct,
        totalPercent: totalPct,
        adjustmentAmount: amount,
        baseBeforeZone: baseAmount
      }
    };
  }

  if (!hasCoords) {
    return { valorBase: baseAmount, zone: null };
  }

  const distanceKm = effectiveDistanceKm(cfg.origin, lat, lng, cfg.distance.roadFactor);
  const distPct = distancePercent(cfg, distanceKm);
  const techCount = ctx.supplyCount != null ? ctx.supplyCount : null;
  const supPct = techCount != null ? supplyPercent(cfg, techCount) : 0;
  let totalPct = distPct + supPct;
  totalPct = Math.min(cfg.maxTotalPercent, Math.round(totalPct * 10) / 10);

  const adjusted = Math.round(baseAmount * (1 + totalPct / 100));
  const amount = adjusted - baseAmount;

  return {
    valorBase: adjusted,
    zone: {
      mode: cfg.mode,
      originLabel: cfg.origin.label,
      communeCode: communeCode || null,
      communeName: communeCode ? communeLabel(cfg, communeCode) : null,
      distanceKm,
      distancePercent: distPct,
      supplyCount: techCount,
      supplyPercent: supPct,
      totalPercent: totalPct,
      adjustmentAmount: amount,
      baseBeforeZone: baseAmount
    }
  };
}

module.exports = {
  DEFAULT_ZONE_PRICING,
  DEFAULT_ORIGIN,
  DEFAULT_COMMUNE_SURCHARGES,
  normalizeZonePricing,
  normalizeCommunes,
  applyZonePricing,
  effectiveDistanceKm,
  distancePercent,
  supplyPercent,
  communePercent,
  resolveCommuneCode
};

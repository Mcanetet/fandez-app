const { haversineKm, staticCommuneCenter } = require('./geocode');

const DEFAULT_ORIGIN = {
  regionCode: 'region-metropolitana',
  communeCode: 'nunoa',
  label: 'Ñuñoa',
  lat: -33.456,
  lng: -70.598
};

const DEFAULT_ZONE_PRICING = {
  enabled: true,
  origin: { ...DEFAULT_ORIGIN },
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
    enabled: true,
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

  const mode = distSrc.mode === 'per_km' ? 'per_km' : 'bands';

  return {
    enabled: src.enabled !== false,
    origin,
    distance: {
      mode,
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
      enabled: supplySrc.enabled !== false,
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
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
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
      originLabel: cfg.origin.label,
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
  normalizeZonePricing,
  applyZonePricing,
  effectiveDistanceKm,
  distancePercent,
  supplyPercent
};

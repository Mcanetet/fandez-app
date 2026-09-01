const { normalizeText } = require('./chile-geo');

const SANTIAGO_CENTER = { lat: -33.4489, lng: -70.6693 };
const communeCenterCache = new Map();

const SANTIAGO_BOUNDS = {
  latMin: -33.52, latMax: -33.38,
  lngMin: -70.72, lngMax: -70.58
};

const NOMINATIM_HEADERS = { 'User-Agent': 'FandezApp/1.0 (servicios-domicilio; contacto@soporte@fandez.cl)' };
const NOMINATIM_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS) || 8000;
let lastNominatimAt = 0;

/** Centros aproximados RM — evita esperar Nominatim al elegir comuna. */
const RM_COMMUNE_CENTERS = {
  cerrillos: { lat: -33.495, lng: -70.712 },
  'cerro-navia': { lat: -33.425, lng: -70.735 },
  conchali: { lat: -33.385, lng: -70.675 },
  'el-bosque': { lat: -33.562, lng: -70.676 },
  'estacion-central': { lat: -33.451, lng: -70.679 },
  huechuraba: { lat: -33.368, lng: -70.647 },
  independencia: { lat: -33.415, lng: -70.665 },
  'la-cisterna': { lat: -33.528, lng: -70.663 },
  'la-florida': { lat: -33.522, lng: -70.598 },
  'la-granja': { lat: -33.542, lng: -70.622 },
  'la-pintana': { lat: -33.583, lng: -70.634 },
  'la-reina': { lat: -33.450, lng: -70.536 },
  'las-condes': { lat: -33.408, lng: -70.550 },
  'lo-barnechea': { lat: -33.353, lng: -70.516 },
  'lo-espejo': { lat: -33.522, lng: -70.695 },
  'lo-prado': { lat: -33.444, lng: -70.726 },
  macul: { lat: -33.487, lng: -70.599 },
  maipu: { lat: -33.511, lng: -70.758 },
  nunoa: { lat: -33.456, lng: -70.598 },
  'pedro-aguirre-cerda': { lat: -33.493, lng: -70.676 },
  penalolen: { lat: -33.486, lng: -70.545 },
  providencia: { lat: -33.426, lng: -70.616 },
  pudahuel: { lat: -33.444, lng: -70.766 },
  quilicura: { lat: -33.361, lng: -70.729 },
  'quinta-normal': { lat: -33.429, lng: -70.698 },
  recoleta: { lat: -33.406, lng: -70.641 },
  renca: { lat: -33.404, lng: -70.723 },
  'san-joaquin': { lat: -33.496, lng: -70.628 },
  'san-miguel': { lat: -33.499, lng: -70.651 },
  'san-ramon': { lat: -33.541, lng: -70.648 },
  santiago: { lat: -33.437, lng: -70.650 },
  vitacura: { lat: -33.390, lng: -70.572 },
  'puente-alto': { lat: -33.611, lng: -70.576 },
  'san-bernardo': { lat: -33.592, lng: -70.705 },
  colina: { lat: -33.202, lng: -70.670 },
  lampa: { lat: -33.286, lng: -70.879 },
  tiltil: { lat: -33.085, lng: -70.898 },
  buin: { lat: -33.732, lng: -70.739 },
  paine: { lat: -33.808, lng: -70.741 },
  'calera-de-tango': { lat: -33.628, lng: -70.782 },
  melipilla: { lat: -33.689, lng: -71.215 },
  talagante: { lat: -33.664, lng: -70.929 },
  penaflor: { lat: -33.606, lng: -70.876 },
  'el-monte': { lat: -33.680, lng: -70.984 },
  'isla-de-maipo': { lat: -33.754, lng: -70.904 },
  'padre-hurtado': { lat: -33.568, lng: -70.832 },
  pirque: { lat: -33.635, lng: -70.555 },
  'san-jose-de-maipo': { lat: -33.640, lng: -70.353 },
  curacavi: { lat: -33.401, lng: -71.133 },
  'maria-pinto': { lat: -33.515, lng: -71.119 },
  alhue: { lat: -34.029, lng: -71.087 },
  'san-pedro': { lat: -33.895, lng: -71.456 }
};

function randomSantiagoCoords() {
  const lat = SANTIAGO_BOUNDS.latMin + Math.random() * (SANTIAGO_BOUNDS.latMax - SANTIAGO_BOUNDS.latMin);
  const lng = SANTIAGO_BOUNDS.lngMin + Math.random() * (SANTIAGO_BOUNDS.lngMax - SANTIAGO_BOUNDS.lngMin);
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

async function nominatimFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastNominatimAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: NOMINATIM_HEADERS,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Nominatim timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function formatShortLabel(item) {
  const a = item.address || {};
  const street = a.road || a.pedestrian || a.footway || a.residential || a.street;
  const number = a.house_number;
  const line1 = street ? (number ? `${street} ${number}` : street) : null;
  const commune = a.suburb || a.city_district || a.city || a.town || a.municipality || a.village;
  const parts = [line1, commune, a.state?.replace('Región Metropolitana de ', 'RM ') || a.state]
    .filter(Boolean);
  return parts.join(', ') || item.display_name;
}

function hasStreetNumber(item) {
  const a = item?.address || {};
  if (a.house_number) return true;
  const label = item?.label || item?.display_name || '';
  // Número de calle (1–5 dígitos). No toma códigos postales chilenos de 7 dígitos.
  return /\b\d{1,5}[A-Za-z]?(?:-\d{1,3}[A-Za-z]?)?\b/.test(label);
}

function parseStreetAndNumber(query) {
  let trimmed = String(query || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  // Quitar comuna/país pegados: "Av. Providencia 2650, Providencia, Chile"
  trimmed = trimmed.split(',')[0].trim();
  const match = trimmed.match(/^(.+?)\s+(?:n[°ºo.]?\s*|nro\.?\s*|no\.?\s*|#\s*)?(\d{1,5}[A-Za-z]?(?:-\d{1,3}[A-Za-z]?)?)$/i);
  if (!match) return null;
  const street = match[1].trim().replace(/[,\s]+$/g, '');
  if (street.length < 2) return null;
  return { street, number: match[2] };
}

function queryDeclaresStreetNumber(query) {
  return Boolean(parseStreetAndNumber(query));
}

function roadsMatch(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function mapNominatimItem(item) {
  return {
    placeId: String(item.place_id),
    label: formatShortLabel(item),
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    address: item.address || null,
    type: item.type || null,
    hasStreetNumber: Boolean(item.address?.house_number) || hasStreetNumber({
      address: item.address,
      label: formatShortLabel(item),
      display_name: item.display_name
    }),
    found: true
  };
}

function synthesizeNumberedSuggestion(item, parsed, communeName) {
  if (!parsed) return item;
  const road = item.address?.road
    || item.address?.pedestrian
    || item.address?.residential
    || parsed.street;
  const commune = item.address?.suburb
    || item.address?.city_district
    || item.address?.city
    || item.address?.town
    || communeName;
  const label = [road ? `${road} ${parsed.number}` : `${parsed.street} ${parsed.number}`, commune]
    .filter(Boolean)
    .join(', ');
  return {
    ...item,
    label,
    displayName: item.displayName || label,
    hasStreetNumber: true,
    approximate: !item.address?.house_number
  };
}

function scoreStreetMatch(item, streetQuery) {
  const needle = normalizeText(streetQuery);
  if (!needle) return 0;
  const road = normalizeText(
    item.address?.road || item.address?.pedestrian || item.address?.residential || ''
  );
  const label = normalizeText(item.label || '');
  if (road && (road === needle || road.includes(needle) || needle.includes(road))) return 100;
  if (label.includes(needle)) return 60;
  const tokens = needle.split(' ').filter((t) => t.length > 2);
  const hits = tokens.filter((t) => road.includes(t) || label.includes(t)).length;
  return hits * 15;
}

function dedupeSuggestions(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.label}|${Number(item.lat).toFixed(4)}|${Number(item.lng).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function reverseGeocode(lat, lng) {
  try {
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`
    );
    if (!data || !data.address) return { found: false };
    return {
      found: true,
      displayName: data.display_name,
      address: data.address,
      road: data.address.road || data.address.pedestrian || data.address.residential || null,
      commune: data.address.suburb || data.address.city_district || data.address.city || data.address.town || null
    };
  } catch (_) {
    return { found: false };
  }
}

async function searchStructuredAddress({ street, number, communeName }) {
  if (!street || !number || !communeName) return [];
  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: '6',
      countrycodes: 'cl',
      addressdetails: '1',
      street: `${number} ${street}`,
      city: communeName,
      country: 'Chile'
    });
    const data = await nominatimFetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item.lat && item.lon)
      .map(mapNominatimItem);
  } catch (_) {
    return [];
  }
}

async function lookupPlaceById(placeId) {
  if (!placeId) return null;
  try {
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=N${placeId}&format=json&addressdetails=1`
    );
    if (!Array.isArray(data) || !data[0]) return null;
    return mapNominatimItem(data[0]);
  } catch (_) {
    return null;
  }
}

async function coordsMatchAddress({ lat, lng, geo, communeName, maxDistanceKm = 2.5 }) {
  if (!geo?.found || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) {
    return { ok: false, distKm: Infinity };
  }
  const distKm = haversineKm(lat, lng, geo.lat, geo.lng);
  if (distKm <= maxDistanceKm) return { ok: true, distKm };

  const reverse = await reverseGeocode(lat, lng);
  if (!reverse.found) return { ok: distKm <= 4, distKm };

  const sameRoad = roadsMatch(reverse.road, geo.address?.road || geo.label);
  const sameCommune = !communeName || roadsMatch(reverse.commune, communeName);
  if (sameRoad && sameCommune && distKm <= 4) return { ok: true, distKm, adjusted: true };
  if (sameCommune && distKm <= 3.5) return { ok: true, distKm, adjusted: true };

  return { ok: false, distKm };
}

function buildSearchQuery(query, { communeName, regionName } = {}) {
  const parts = [(query || '').trim()];
  if (communeName) parts.push(communeName);
  if (regionName) parts.push(regionName);
  parts.push('Chile');
  return parts.filter(Boolean).join(', ');
}

function withCommuneContext(address, communeName) {
  const addr = (address || '').trim();
  if (!addr || !communeName) return addr;
  const normalizedAddr = normalizeText(addr);
  const normalizedCommune = normalizeText(communeName);
  if (normalizedAddr.includes(normalizedCommune)) return addr;
  return `${addr}, ${communeName}`;
}

function staticCommuneCenter(communeName, regionName) {
  const slug = normalizeText(communeName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const isRm = !regionName || /metropolitana|santiago/i.test(regionName);
  if (isRm && RM_COMMUNE_CENTERS[slug]) {
    return { ...RM_COMMUNE_CENTERS[slug], found: true, label: communeName, static: true };
  }
  return null;
}

async function geocodeCommuneCenter(communeName, regionName = 'Región Metropolitana de Santiago') {
  const cacheKey = normalizeText(`${communeName}|${regionName}`);
  if (communeCenterCache.has(cacheKey)) return communeCenterCache.get(cacheKey);

  const staticHit = staticCommuneCenter(communeName, regionName);
  if (staticHit) {
    communeCenterCache.set(cacheKey, staticHit);
    return staticHit;
  }

  const fallback = { ...SANTIAGO_CENTER, found: false, label: communeName };
  try {
    const encoded = encodeURIComponent(buildSearchQuery(communeName, { regionName }));
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=cl`
    );
    if (data && data[0]) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        found: true,
        label: communeName
      };
      communeCenterCache.set(cacheKey, result);
      return result;
    }
  } catch (_) { /* fallback */ }

  communeCenterCache.set(cacheKey, fallback);
  return fallback;
}

async function searchAddressSuggestions(query, { limit = 6, communeName, regionName } = {}) {
  const q = (query || '').trim();
  if (q.length < 3 || !communeName) return [];

  try {
    const parsed = parseStreetAndNumber(q);
    let results = [];

    if (parsed) {
      results = await searchStructuredAddress({
        street: parsed.street,
        number: parsed.number,
        communeName
      });
    }

    if (!results.length) {
      const searchQ = parsed ? `${parsed.street} ${parsed.number}` : q;
      const encoded = encodeURIComponent(buildSearchQuery(searchQ, {
        communeName,
        regionName: regionName || 'Región Metropolitana de Santiago'
      }));
      const data = await nominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&countrycodes=cl&addressdetails=1`
      );
      if (Array.isArray(data)) {
        results = data.filter((item) => item.lat && item.lon).map(mapNominatimItem);
      }
    }

    // Si OSM solo encuentra la calle (sin número), buscar calle sola y sintetizar.
    if (!results.length && parsed) {
      const encoded = encodeURIComponent(buildSearchQuery(parsed.street, {
        communeName,
        regionName: regionName || 'Región Metropolitana de Santiago'
      }));
      const data = await nominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&countrycodes=cl&addressdetails=1`
      );
      if (Array.isArray(data)) {
        results = data.filter((item) => item.lat && item.lon).map(mapNominatimItem);
      }
    }

    const streetNeedle = parsed?.street || q;
    results = results
      .map((item) => (parsed ? synthesizeNumberedSuggestion(item, parsed, communeName) : item))
      .filter((item) => item.label && item.label.length >= 4)
      .filter((item) => {
        if (parsed) return scoreStreetMatch(item, streetNeedle) >= 15 || item.address?.road;
        return true;
      })
      .sort((a, b) => scoreStreetMatch(b, streetNeedle) - scoreStreetMatch(a, streetNeedle));

    // Si el usuario escribió calle+número y hay al menos un match de calle, forzar sugerencia usable.
    if (parsed && results.length) {
      results = [
        synthesizeNumberedSuggestion(results[0], parsed, communeName),
        ...results.slice(1)
      ];
    }

    // Último recurso: centro de comuna + dirección escrita por el usuario.
    if (!results.length && parsed) {
      const center = await geocodeCommuneCenter(communeName, regionName);
      results = [{
        placeId: `manual:${normalizeText(parsed.street)}:${parsed.number}`,
        label: `${parsed.street} ${parsed.number}, ${communeName}`,
        displayName: `${parsed.street} ${parsed.number}, ${communeName}, Chile`,
        lat: center.lat,
        lng: center.lng,
        address: { road: parsed.street, house_number: parsed.number, city: communeName },
        type: 'manual',
        hasStreetNumber: true,
        approximate: true,
        found: true
      }];
    }

    return dedupeSuggestions(results).slice(0, limit);
  } catch (_) {
    return [];
  }
}

async function geocodeAddress(address, { strict = false, communeName } = {}) {
  const notFound = {
    lat: null,
    lng: null,
    displayName: address,
    address: null,
    found: false,
    placeId: null,
    hasStreetNumber: false
  };
  const searchAddress = withCommuneContext(address, communeName);
  const parsed = parseStreetAndNumber(address) || parseStreetAndNumber(searchAddress);

  try {
    const query = encodeURIComponent(`${searchAddress}, Chile`);
    const data = await nominatimFetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=3&countrycodes=cl&addressdetails=1`
    );
    if (Array.isArray(data) && data[0]) {
      let best = mapNominatimItem(data[0]);
      if (parsed) {
        const ranked = data
          .filter((item) => item.lat && item.lon)
          .map(mapNominatimItem)
          .map((item) => synthesizeNumberedSuggestion(item, parsed, communeName))
          .sort((a, b) => scoreStreetMatch(b, parsed.street) - scoreStreetMatch(a, parsed.street));
        if (ranked[0]) best = ranked[0];
        else best = synthesizeNumberedSuggestion(best, parsed, communeName);
      }
      return {
        lat: best.lat,
        lng: best.lng,
        displayName: best.displayName,
        label: best.label,
        address: best.address,
        placeId: best.placeId,
        hasStreetNumber: Boolean(parsed) || best.hasStreetNumber,
        approximate: best.approximate === true,
        found: true
      };
    }
  } catch (_) { /* continue */ }

  if (parsed && communeName) {
    try {
      const streetQuery = encodeURIComponent(buildSearchQuery(parsed.street, { communeName }));
      const data = await nominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${streetQuery}&format=json&limit=1&countrycodes=cl&addressdetails=1`
      );
      if (Array.isArray(data) && data[0]) {
        const mapped = synthesizeNumberedSuggestion(mapNominatimItem(data[0]), parsed, communeName);
        return {
          lat: mapped.lat,
          lng: mapped.lng,
          displayName: mapped.displayName,
          label: mapped.label,
          address: mapped.address,
          placeId: mapped.placeId,
          hasStreetNumber: true,
          approximate: true,
          found: true
        };
      }
    } catch (_) { /* continue */ }

    if (strict) {
      const center = await geocodeCommuneCenter(communeName);
      return {
        lat: center.lat,
        lng: center.lng,
        displayName: `${parsed.street} ${parsed.number}, ${communeName}`,
        label: `${parsed.street} ${parsed.number}, ${communeName}`,
        address: { road: parsed.street, house_number: parsed.number, city: communeName },
        placeId: null,
        hasStreetNumber: true,
        approximate: true,
        found: true
      };
    }
  }

  if (strict) return notFound;
  return {
    ...randomSantiagoCoords(),
    displayName: address,
    address: null,
    found: false,
    placeId: null,
    label: address,
    hasStreetNumber: Boolean(parsed)
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  SANTIAGO_CENTER,
  geocodeAddress,
  geocodeCommuneCenter,
  searchAddressSuggestions,
  reverseGeocode,
  coordsMatchAddress,
  lookupPlaceById,
  randomSantiagoCoords,
  haversineKm,
  formatShortLabel,
  hasStreetNumber,
  withCommuneContext,
  parseStreetAndNumber,
  queryDeclaresStreetNumber,
  roadsMatch
};

/**
 * Índice cliente: texto libre → servicio de la app.
 * Usa nombre, problemas típicos, actividades del catálogo y alias locales.
 */

'use strict';

const { SERVICE_CATALOG, SERVICE_TO_SPECIALTY } = require('./serviceCatalogData');
const { OVERVIEWS } = require('./serviceOverviews');
const { getHomeGroup } = require('./homeServicePaths');

const SPECIALTY_TO_SERVICE = Object.fromEntries(
  Object.entries(SERVICE_TO_SPECIALTY).map(([serviceId, specialtyId]) => [specialtyId, serviceId])
);
// Preferencias cuando varias claves apuntan a la misma especialidad
SPECIALTY_TO_SERVICE.gasfiteria = 'gasfiter';
SPECIALTY_TO_SERVICE.otros = 'otros';

/** Alias coloquiales (Chile) por serviceId */
const SERVICE_ALIASES = {
  gasfiter: [
    'fuga', 'filtración', 'filtracion', 'cañería', 'caneria', 'caño', 'cano',
    'destape', 'destapar', 'wc', 'baño', 'bano', 'inodoro', 'sanitario',
    'grifo', 'grifería', 'griferia', 'llave', 'ducha', 'lavamanos', 'sifón', 'sifon',
    'lavadora', 'lavavajillas', 'lavaplatos', 'desagüe', 'desague', 'alcantarillado',
    'calefont', 'agua caliente', 'estanque'
  ],
  electrico: [
    'luz', 'enchufe', 'tomacorriente', 'corto', 'cortocircuito', 'automático', 'automatico',
    'tablero', 'interruptor', 'timbre', 'ventilador', 'cable', 'eléctrico', 'electrico',
    'diferencial', 'alumbrado'
  ],
  aires: [
    'aire', 'aire acondicionado', 'split', 'climatización', 'climatizacion',
    'no enfría', 'no enfria', 'refrigerante', 'gas freón', 'gas freon', 'anwo', 'midea'
  ],
  cerrajero: [
    'cerradura', 'llave perdida', 'puerta', 'cerrojo', 'chapa', 'yale', 'abrir puerta',
    'cerradura digital', 'picaporte'
  ],
  termos: ['termo', 'terma', 'calentador eléctrico', 'calentador electrico', 'acumulador'],
  calderas: ['caldera', 'calefacción', 'calefaccion', 'radiador', 'piso radiante'],
  generadores: ['generador', 'grupo electrógeno', 'grupo electrogeno', 'corte de luz'],
  pintura: ['pintar', 'pintura', 'muro', 'humedad mancha', 'látex', 'latex'],
  jardineria: [
    'jardín', 'jardin', 'pasto', 'césped', 'cesped', 'poda', 'maleza', 'riego',
    'árbol', 'arbol', 'arbusto', 'pasto alto'
  ],
  paisajismo: ['paisajismo', 'diseño de jardín', 'diseno de jardin', 'proyecto jardín', 'proyecto jardin'],
  fotovoltaico: [
    'solar', 'paneles', 'fotovoltaico', 'netbilling', 'boleta de luz', 'autoconsumo', 'batería solar', 'bateria solar'
  ],
  piscinas: ['piscina', 'agua verde', 'filtro piscina', 'bomba piscina', 'cloro'],
  escombros: ['escombros', 'escombro', 'retiro escombros', 'desalojo', 'escombros obra'],
  limpieza: ['limpieza', 'aseo', 'deep clean', 'limpieza profunda'],
  grua: ['grúa', 'grua', 'remolque', 'auxilio', 'auto no parte', 'remolcar'],
  otros: [
    'lavadora no centrifuga', 'tarjeta electrónica', 'tarjeta electronica',
    'electrodoméstico', 'electrodomestico', 'código de error', 'codigo de error'
  ]
};

function pickLocale(value, lang) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (lang === 'en' && value.en != null) return value.en;
  return value.es != null ? value.es : value.en;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const key = normalize(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function caminoForService(serviceId) {
  const group = getHomeGroup(serviceId);
  if (group === 'project') return 'proyecto';
  return 'ahora';
}

function tasksForSpecialty(specialtyId) {
  const specialty = SERVICE_CATALOG.find((s) => s.id === specialtyId);
  if (!specialty) return [];
  return (specialty.activities || [])
    .filter((a) => a && a.name && !a.hideFromClient)
    .map((a) => a.name);
}

function tasksHiddenButSearchable(specialtyId) {
  // Incluye actividades hideFromClient para que "destape" / "fuga lavadora" sigan matcheando
  const specialty = SERVICE_CATALOG.find((s) => s.id === specialtyId);
  if (!specialty) return [];
  return (specialty.activities || [])
    .filter((a) => a && a.name)
    .map((a) => a.name);
}

/**
 * @param {Array<{ id: string, name: string, icon?: string, enabled?: boolean }>} services
 * @param {{ lang?: string }} [opts]
 */
function buildTaskSearchIndex(services, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'es';
  const list = Array.isArray(services) ? services : [];
  const byId = new Map(list.map((s) => [s.id, s]));

  return list
    .filter((s) => s && s.id)
    .map((service) => {
      const overview = OVERVIEWS[service.id] || null;
      const problems = overview ? (pickLocale(overview.problems, lang) || []) : [];
      const specialtyId = SERVICE_TO_SPECIALTY[service.id] || null;
      const visibleTasks = specialtyId ? tasksForSpecialty(specialtyId) : [];
      const allCatalogTasks = specialtyId ? tasksHiddenButSearchable(specialtyId) : [];
      const aliases = SERVICE_ALIASES[service.id] || [];
      const keywords = uniqueStrings([
        service.name,
        service.id,
        ...problems,
        ...allCatalogTasks,
        ...aliases
      ]);
      const haystack = normalize(keywords.join(' '));
      const sampleTasks = uniqueStrings([
        ...problems.slice(0, 4),
        ...visibleTasks.filter((n) => !/^No estoy seguro/i.test(n)).slice(0, 4)
      ]).slice(0, 6);

      return {
        id: service.id,
        name: service.name,
        icon: service.icon || null,
        camino: caminoForService(service.id),
        sampleTasks,
        keywords,
        haystack
      };
    })
    .filter((entry) => byId.has(entry.id));
}

/**
 * Búsqueda en Node (tests / API). El cliente usa la misma lógica en public/js.
 * @param {string} query
 * @param {ReturnType<typeof buildTaskSearchIndex>} index
 * @param {{ limit?: number }} [opts]
 */
function searchTasks(query, index, opts = {}) {
  const limit = Math.max(1, Math.min(20, opts.limit || 8));
  const q = normalize(query);
  if (!q || q.length < 2) return [];
  const tokens = q.split(' ').filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  const scored = (index || []).map((entry) => {
    let score = 0;
    const nameN = normalize(entry.name);
    if (nameN === q) score += 100;
    else if (nameN.includes(q)) score += 60;
    if (entry.haystack.includes(q)) score += 40;
    for (const token of tokens) {
      if (nameN.includes(token)) score += 18;
      if (entry.haystack.includes(token)) score += 10;
      for (const kw of entry.keywords || []) {
        const kn = normalize(kw);
        if (kn === token) score += 14;
        else if (kn.includes(token)) score += 6;
      }
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'es'))
    .slice(0, limit)
    .map((s) => ({
      id: s.entry.id,
      name: s.entry.name,
      icon: s.entry.icon,
      camino: s.entry.camino,
      sampleTasks: s.entry.sampleTasks,
      score: s.score
    }));
}

module.exports = {
  buildTaskSearchIndex,
  searchTasks,
  normalize,
  SPECIALTY_TO_SERVICE,
  SERVICE_ALIASES
};

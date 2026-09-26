/**
 * Home cliente: dos caminos distintos.
 * - now / urgencia: spot del día (descripción del caso → técnico va a resolver).
 * - project: programable (levantamiento → propuesta de proyecto).
 */
'use strict';

/** @typedef {'now'|'project'|'both'|'hidden'} HomeGroup */

/**
 * Metadata de home (no vive en BD; se fusiona al decorar).
 * Orden = orden de aparición en cada bloque.
 */
const HOME_SERVICE_META = {
  jardineria: { homeGroup: 'now', sortNow: 10 },
  electrico: { homeGroup: 'now', sortNow: 20 },
  gasfiter: { homeGroup: 'now', sortNow: 30 },
  cerrajero: { homeGroup: 'now', sortNow: 40 },
  aires: { homeGroup: 'both', sortNow: 50, sortProject: 30 },
  calderas: { homeGroup: 'now', sortNow: 60 },
  generadores: { homeGroup: 'now', sortNow: 70 },
  pintura: { homeGroup: 'now', sortNow: 80 },
  termos: { homeGroup: 'now', sortNow: 90 },
  piscinas: { homeGroup: 'both', sortNow: 100, sortProject: 40 },
  grua: { homeGroup: 'now', sortNow: 105 },
  paisajismo: { homeGroup: 'project', sortProject: 10 },
  fotovoltaico: { homeGroup: 'project', sortProject: 20 },
  limpieza: { homeGroup: 'hidden' },
  otros: { homeGroup: 'hidden' },
  lavadora: { homeGroup: 'hidden' },
  lavavajillas: { homeGroup: 'hidden' }
};

function getHomeMeta(serviceId) {
  return HOME_SERVICE_META[String(serviceId || '')] || { homeGroup: 'hidden' };
}

function getHomeGroup(serviceId) {
  return getHomeMeta(serviceId).homeGroup || 'hidden';
}

/**
 * @param {'ahora'|'proyecto'|string|null} caminoQuery
 * @param {string} serviceId
 * @returns {'now'|'project'}
 */
function resolveServicePath(caminoQuery, serviceId) {
  const group = getHomeGroup(serviceId);
  if (group === 'project') return 'project';
  if (group === 'now') return 'now';
  const raw = String(caminoQuery || '').toLowerCase().trim();
  if (raw === 'proyecto' || raw === 'project') return 'project';
  if (raw === 'ahora' || raw === 'now' || raw === 'urgencia') return 'now';
  // dual sin query: default urgencia
  return 'now';
}

function isProjectServiceId(serviceId) {
  const g = getHomeGroup(serviceId);
  return g === 'project';
}

function isGardenProjectService(serviceId) {
  return String(serviceId || '') === 'paisajismo';
}

function isFvProjectService(serviceId) {
  return String(serviceId || '') === 'fotovoltaico';
}

/**
 * @param {object[]} services
 * @param {'now'|'project'} group
 */
function filterServicesForHome(services, group) {
  const list = Array.isArray(services) ? services : [];
  return list
    .filter((s) => {
      const g = s.homeGroup || getHomeGroup(s.id);
      if (g === 'hidden') return false;
      if (group === 'now') return g === 'now' || g === 'both';
      if (group === 'project') return g === 'project' || g === 'both';
      return false;
    })
    .map((s) => {
      const meta = getHomeMeta(s.id);
      return {
        ...s,
        homeGroup: meta.homeGroup,
        _homeSort: group === 'project' ? (meta.sortProject || 99) : (meta.sortNow || 99)
      };
    })
    .sort((a, b) => (a._homeSort - b._homeSort) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

function decorateHomeFields(service) {
  if (!service) return service;
  const meta = getHomeMeta(service.id);
  return {
    ...service,
    homeGroup: meta.homeGroup,
    sortNow: meta.sortNow,
    sortProject: meta.sortProject
  };
}

module.exports = {
  HOME_SERVICE_META,
  getHomeMeta,
  getHomeGroup,
  resolveServicePath,
  isProjectServiceId,
  isGardenProjectService,
  isFvProjectService,
  filterServicesForHome,
  decorateHomeFields
};

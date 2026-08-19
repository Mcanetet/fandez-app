const store = require('../models/store');
const { toServingUrl } = require('./uploads');

/**
 * Serializa un pedido para la vista de terreno (técnico o socio observador).
 */
function serializeFieldJob(storeRef, request) {
  const svcStore = storeRef || store;
  const service = svcStore.getServiceById(request.serviceId);
  const live = svcStore.getLiveTrackingLocation(request);
  return {
    id: request.id,
    serviceId: request.serviceId,
    serviceName: request.serviceName || (service ? service.name : request.serviceId),
    activityId: request.activityId || null,
    activityName: request.activityName || null,
    clientName: request.clientName || '—',
    address: request.address || '',
    notes: request.notes || '',
    clientPhotoUrl: toServingUrl(request.clientPhotoUrl) || null,
    clientBrandPhotoUrl: toServingUrl(request.clientBrandPhotoUrl) || null,
    brandNotVisible: Boolean(request.brandNotVisible),
    status: request.status,
    techStatus: request.techStatus || 'asignado',
    technicianId: request.technicianId || null,
    technicianName: request.technicianName || null,
    siteReport: request.siteReport
      ? {
          ...request.siteReport,
          photoStart: toServingUrl(request.siteReport.photoStart) || request.siteReport.photoStart || null,
          photoEnd: toServingUrl(request.siteReport.photoEnd) || request.siteReport.photoEnd || null
        }
      : null,
    coords: request.coords || null,
    isGift: !!request.isGift,
    beneficiaryName: request.beneficiaryName || null,
    liveLocation: live,
    searchingAt: request.searchingAt || null,
    createdAt: request.createdAt || null,
    assignedAt: request.assignedAt || null
  };
}

module.exports = { serializeFieldJob };

const store = require('../models/store');
const { toServingUrl, stableRequestPhotoUrl } = require('./uploads');
const { withAgendaDay } = require('./jobAgenda');
const {
  formatCleaningSummary,
  formatLandscapeSummary
} = require('./serviceCatalogData');
const { formatGardenIntakeSummary } = require('./gardenIntake');
const {
  ensureGardenDeliverables,
  gardenDeliverablesProgress
} = require('./gardenDeliverables');

/**
 * Serializa un pedido para la vista de terreno (técnico o socio observador).
 */
function serializeFieldJob(storeRef, request) {
  const svcStore = storeRef || store;
  const service = svcStore.getServiceById(request.serviceId);
  const live = svcStore.getLiveTrackingLocation(request);
  const formatCLP = typeof svcStore.formatCLP === 'function'
    ? svcStore.formatCLP
    : (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

  const factorSummary = request.serviceId === 'limpieza'
    ? formatCleaningSummary(request.cleaningFactors, request.squareMeters)
    : (request.serviceId === 'jardineria'
      ? (formatGardenIntakeSummary(request.gardenIntake)
        || formatLandscapeSummary(request.landscapeProject || request.landscapeFactors))
      : '');

  const paid = request.visitPricePaid || request.visitTotal || request.amountDue || request.basePrice || null;
  const summaryLines = [];
  if (request.activityName) summaryLines.push(request.activityName);
  else if (service?.name) summaryLines.push(service.name);
  if (factorSummary) summaryLines.push(factorSummary);
  else if (request.squareMeters) summaryLines.push(`${Math.round(request.squareMeters)} m²`);
  if (request.urgencyTierLabel) summaryLines.push(request.urgencyTierLabel);
  if (request.notes) summaryLines.push(request.notes);

  return withAgendaDay({
    id: request.id,
    serviceId: request.serviceId,
    serviceName: request.serviceName || (service ? service.name : request.serviceId),
    activityId: request.activityId || null,
    activityName: request.activityName || null,
    clientName: request.clientName || '—',
    address: request.address || '',
    communeName: request.communeName || '',
    notes: request.notes || '',
    squareMeters: request.squareMeters || null,
    cleaningFactors: request.cleaningFactors || null,
    landscapeProject: request.landscapeProject || null,
    gardenIntake: request.gardenIntake || null,
    gardenDeliverables: request.gardenIntake
      ? (ensureGardenDeliverables(request) || []).map((d) => ({
          ...d,
          fileUrl: d.fileUrl ? (toServingUrl(d.fileUrl) || d.fileUrl) : null,
          files: Array.isArray(d.files)
            ? d.files.map((f) => ({
              ...f,
              url: f.url ? (toServingUrl(f.url) || f.url) : null
            }))
            : []
        }))
      : null,
    gardenDeliverablesProgress: request.gardenIntake
      ? gardenDeliverablesProgress(ensureGardenDeliverables(request))
      : null,
    gardenPaymentUnlocks: Array.isArray(request.gardenPaymentUnlocks)
      ? request.gardenPaymentUnlocks
      : [],
    factorSummary: factorSummary || '',
    visitPricePaid: paid,
    visitPriceLabel: paid != null ? formatCLP(paid) : null,
    summaryLines,
    workSummaryText: summaryLines.filter(Boolean).join(' · '),
    clientPhotoUrl: request.clientPhotoUrl
      ? (stableRequestPhotoUrl(request.id, 'problem') || toServingUrl(request.clientPhotoUrl) || null)
      : null,
    clientBrandPhotoUrl: request.clientBrandPhotoUrl
      ? (stableRequestPhotoUrl(request.id, 'brand') || toServingUrl(request.clientBrandPhotoUrl) || null)
      : null,
    brandNotVisible: Boolean(request.brandNotVisible),
    status: request.status,
    techStatus: request.techStatus || 'asignado',
    technicianId: request.technicianId || null,
    technicianName: request.technicianName || null,
    urgencyTier: request.urgencyTier || null,
    urgencyTierLabel: request.urgencyTierLabel || null,
    scheduledSearchAt: request.scheduledSearchAt || null,
    paidAt: request.paidAt || null,
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
    assignedAt: request.assignedAt || null,
    technicianAssignedAt: request.technicianAssignedAt || null,
    serviceConfirmStatus: request.serviceConfirmStatus || null,
    arrivalCodeRequired: Boolean(request.arrivalCode && !request.arrivalCodeVerifiedAt),
    arrivalCodeVerified: Boolean(request.arrivalCodeVerifiedAt)
  });
}

module.exports = { serializeFieldJob };

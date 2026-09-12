const {
  calculateDynamicTariff,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP,
  getServiceCatalog,
  flattenServiceCatalog,
  normalizeCatalogPrices,
  getActivitiesForService,
  findCatalogActivity,
  specialtyIdForService
} = require('./dynamicTariffs');
const {
  isPerM2Service,
  isPerM2Activity,
  isLandscapeActivity,
  resolveM2QuoteBase,
  normalizeLandscapeFactors,
  resolveLandscapeQuoteBase,
  formatLandscapeSummary,
  GARDEN_OTHER_RATE_M2,
  GARDEN_MIN_JOB_CLP,
  LANDSCAPE_MIN_M2,
  LANDSCAPE_MIN_JOB_CLP,
  LANDSCAPE_STANDARDS,
  LANDSCAPE_TERRAIN,
  LANDSCAPE_SPECIES
} = require('./serviceCatalogData');
const {
  DEFAULT_MATERIALS_CATALOG,
  normalizeMaterialsCatalog,
  getEnabledMaterialsCatalog,
  findMaterialInCatalog
} = require('./materials/catalog');
const {
  DEFAULT_MP_ONLINE_RATE,
  DEFAULT_PRESENT_VALUE_EXTRA,
  DEFAULT_MAX_CARD_INSTALLMENTS,
  normalizeMpFees,
  normalizeMaxCardInstallments,
  mercadoPagoPresentValueCost,
  effectiveCardFeePercent
} = require('./mercadopagoFees');

const DEFAULT_PRICING = {
  visitPrice: MIN_DIAGNOSTIC_VISIT_CLP,
  servicePrice: 160000,
  /** Overrides de precio base del catálogo: { [activityId]: CLP } */
  catalogPrices: {},
  /** Materiales recurrentes con precio de mercado (cobro al cliente a costo). */
  materialsCatalog: DEFAULT_MATERIALS_CATALOG,
  /**
   * Política de cancelación (CLP retenidos; el resto se devoluciona).
   * - beforeAccepted: sin socio/técnico que haya aceptado (búsqueda o asignado pendiente)
   * - afterTechAccepted: técnico aceptó el pedido (aún no en camino)
   * - enRouteOrOnSite: en camino o ya en el domicilio
   */
  cancellations: {
    beforeAccepted: 0,
    afterTechAccepted: 15000,
    enRouteOrOnSite: 30000
  },
  /** @deprecated Usar cancellations.enRouteOrOnSite — se migra en normalizePricing */
  cancellationFee: 30000,
  /** Comisión Fandez sobre mano de obra, IVA incluido. No se suma al cliente. */
  laborCommissionRate: 0.15,
  /** La comisión ya trae IVA: no se vuelve a aplicar 19% encima. */
  commissionIvaIncluded: true,
  materialsCommissionRate: 0,
  /** Tasa Mercado Pago cobros online, sin IVA (1 cuota / al contado). */
  mpOnlineRatePercent: DEFAULT_MP_ONLINE_RATE * 100,
  mpPresentValueExtra: DEFAULT_PRESENT_VALUE_EXTRA,
  /** Efectivo IVA incluido 1 cuota (~3,80%). Se deriva de MP. */
  merchantCardFeePercent: Math.round(DEFAULT_MP_ONLINE_RATE * 1.19 * 10000) / 100,
  /** Máximo de cuotas en crédito (Mercado Pago). Débito / 1 cuota siguen. */
  maxCardInstallments: DEFAULT_MAX_CARD_INSTALLMENTS,
  /** IVA Chile: desglose contable + para gross-up del fee MP. */
  ivaRate: 0.19,
  /** No recargar tarjeta al cliente (precio único). */
  cardSurchargePercent: 0,
  cardEnabled: true,
  transferEnabled: true,
  bankTransfer: {
    bankName: 'Banco de Chile',
    accountType: 'Cuenta corriente',
    accountNumber: '1234567890',
    holderName: 'Fandez SpA',
    holderRut: '77.777.777-7',
    email: 'pagos@fandez.cl'
  },
  paymentGateways: {
    transbank: { enabled: true, sortOrder: 1 },
    mercadopago: { enabled: true, sortOrder: 2 },
    paypal: { enabled: false, sortOrder: 3 }
  },
  /** Recargos de horario configurables en Admin (% sobre tarifa base). */
  scheduleSurcharges: {
    normalPercent: 0,
    tardePercent: 25,
    nocturnoPercent: 50
  },
  // Opciones de llegada del cliente. surchargePercent se multiplica después del horario.
  urgencyTiers: [
    {
      id: 'immediate',
      label: 'Inmediato (1-3 h)',
      description: 'Un técnico puede llegar entre 1 y 3 horas',
      responseMinutes: 45,
      surchargePercent: 25,
      enabled: true,
      sortOrder: 1
    },
    {
      id: 'today',
      label: 'Hoy (4-8 h)',
      description: 'Servicio para hoy — sin recargo',
      responseMinutes: 90,
      surchargePercent: 0,
      enabled: true,
      sortOrder: 2
    },
    {
      id: 'tomorrow',
      label: 'Mañana',
      description: 'Al día siguiente — 10% de descuento',
      responseMinutes: 180,
      surchargePercent: -10,
      enabled: true,
      sortOrder: 3
    },
    {
      id: 'two_days',
      label: 'En 2 días',
      description: 'Programado con anticipación — 10% de descuento',
      responseMinutes: 180,
      surchargePercent: -10,
      enabled: true,
      sortOrder: 4
    }
  ]
};

const DEFAULT_RESPONSE_BY_ID = {
  immediate: 45,
  today: 90,
  tomorrow: 180,
  two_days: 180,
  // Compat con tiers antiguos
  critical: 45,
  medium: 90,
  scheduled: 180
};

const DEFAULT_SURCHARGE_BY_ID = {
  immediate: 25,
  today: 0,
  tomorrow: -10,
  two_days: -10,
  critical: 25,
  medium: 0,
  scheduled: -10
};

function clampSurchargePercent(val, fallback = 0) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(-50, n));
}

function normalizeScheduleSurcharges(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    normalPercent: clampSurchargePercent(source.normalPercent, DEFAULT_PRICING.scheduleSurcharges.normalPercent),
    tardePercent: clampSurchargePercent(source.tardePercent, DEFAULT_PRICING.scheduleSurcharges.tardePercent),
    nocturnoPercent: clampSurchargePercent(source.nocturnoPercent, DEFAULT_PRICING.scheduleSurcharges.nocturnoPercent)
  };
}

function normalizePricing(raw) {
  const base = { ...DEFAULT_PRICING, ...(raw || {}) };
  base.visitPrice = Math.max(
    MIN_DIAGNOSTIC_VISIT_CLP,
    parseInt(base.visitPrice, 10) || DEFAULT_PRICING.visitPrice
  );
  base.servicePrice = Math.max(
    MIN_WORK_BASE_CLP,
    parseInt(base.servicePrice, 10) || DEFAULT_PRICING.servicePrice
  );

  const cancelSrc = (raw && raw.cancellations && typeof raw.cancellations === 'object')
    ? raw.cancellations
    : (base.cancellations && typeof base.cancellations === 'object' ? base.cancellations : {});
  const legacyCancel = Math.max(0, parseInt(base.cancellationFee, 10) || 0);
  const parseCancel = (val, fallback) => {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  base.cancellations = {
    beforeAccepted: parseCancel(cancelSrc.beforeAccepted, DEFAULT_PRICING.cancellations.beforeAccepted),
    afterTechAccepted: parseCancel(
      cancelSrc.afterTechAccepted,
      DEFAULT_PRICING.cancellations.afterTechAccepted
    ),
    enRouteOrOnSite: parseCancel(
      cancelSrc.enRouteOrOnSite != null ? cancelSrc.enRouteOrOnSite : (legacyCancel || null),
      DEFAULT_PRICING.cancellations.enRouteOrOnSite
    )
  };
  // Alias legacy: el monto más alto de la escalera (en ruta / domicilio)
  base.cancellationFee = base.cancellations.enRouteOrOnSite;

  // Soft launch: subir default 12% → 15% y limpiar defaults viejos (20%).
  const laborRate = Number(base.laborCommissionRate);
  if (Math.abs(laborRate - 0.2) < 0.0001 || Math.abs(laborRate - 0.12) < 0.0001) {
    base.laborCommissionRate = DEFAULT_PRICING.laborCommissionRate;
  }
  base.laborCommissionRate = clampRate(base.laborCommissionRate, DEFAULT_PRICING.laborCommissionRate);
  base.commissionIvaIncluded = base.commissionIvaIncluded !== false;
  base.materialsCommissionRate = clampRate(base.materialsCommissionRate, DEFAULT_PRICING.materialsCommissionRate);
  const ivaRaw = parseFloat(base.ivaRate);
  base.ivaRate = Number.isFinite(ivaRaw)
    ? Math.min(1, Math.max(0, ivaRaw > 1 ? ivaRaw / 100 : ivaRaw))
    : DEFAULT_PRICING.ivaRate;
  const oldFlatCard = parseInt(raw?.merchantCardFeePercent, 10);
  if (oldFlatCard === 4 || oldFlatCard === 5) {
    base.mpOnlineRatePercent = DEFAULT_MP_ONLINE_RATE * 100;
  }
  const mpFees = normalizeMpFees({
    mpOnlineRatePercent: base.mpOnlineRatePercent,
    mpPresentValueExtra: base.mpPresentValueExtra || raw?.mpPresentValueExtra
  }, base.ivaRate);
  base.mpOnlineRatePercent = Math.round(mpFees.onlineRate * 10000) / 100;
  base.mpPresentValueExtra = mpFees.presentValueExtra;
  base.merchantCardFeePercent = Math.round(mpFees.cashRateIvaIncluded * 10000) / 100;
  base.maxCardInstallments = normalizeMaxCardInstallments(
    raw?.maxCardInstallments != null ? raw.maxCardInstallments : base.maxCardInstallments
  );
  base.cardSurchargePercent = 0;
  base.cardEnabled = base.cardEnabled !== false;
  base.transferEnabled = base.transferEnabled !== false;
  base.bankTransfer = {
    ...DEFAULT_PRICING.bankTransfer,
    ...(raw?.bankTransfer || {})
  };
  base.paymentGateways = normalizePaymentGateways(raw?.paymentGateways);
  base.catalogPrices = normalizeCatalogPrices(raw?.catalogPrices || base.catalogPrices);
  if (raw?.commercialPlanId) base.commercialPlanId = String(raw.commercialPlanId).slice(0, 64);
  else if (base.commercialPlanId) base.commercialPlanId = String(base.commercialPlanId).slice(0, 64);
  if (raw?.commercialPlanAppliedAt) base.commercialPlanAppliedAt = String(raw.commercialPlanAppliedAt);
  else if (base.commercialPlanAppliedAt) base.commercialPlanAppliedAt = String(base.commercialPlanAppliedAt);
  const priceMode = raw?.clientPriceMode != null ? raw.clientPriceMode : base.clientPriceMode;
  base.clientPriceMode = priceMode === 'net_plus_iva' ? 'net_plus_iva' : 'included';
  base.materialsCatalog = normalizeMaterialsCatalog(
    raw?.materialsCatalog != null ? raw.materialsCatalog : base.materialsCatalog
  );
  base.scheduleSurcharges = normalizeScheduleSurcharges(raw?.scheduleSurcharges || base.scheduleSurcharges);

  const tiersRaw = Array.isArray(raw?.urgencyTiers) && raw.urgencyTiers.length
    ? raw.urgencyTiers
    : DEFAULT_PRICING.urgencyTiers;
  const tierIds = new Set(tiersRaw.map((t) => t.id));
  const looksLikeLegacyThree =
    tierIds.has('critical') &&
    tierIds.has('medium') &&
    tierIds.has('scheduled') &&
    !tierIds.has('immediate') &&
    !tierIds.has('today');
  const tiers = looksLikeLegacyThree ? DEFAULT_PRICING.urgencyTiers : tiersRaw;

  base.urgencyTiers = tiers.map((t, i) => {
    const id = t.id || `tier-${i}`;
    const responseMinutes = Math.max(
      0,
      parseInt(t.responseMinutes, 10)
        || DEFAULT_RESPONSE_BY_ID[id]
        || DEFAULT_PRICING.urgencyTiers[i]?.responseMinutes
        || 180
    );
    const surchargeFallback = DEFAULT_SURCHARGE_BY_ID[id]
      ?? DEFAULT_PRICING.urgencyTiers[i]?.surchargePercent
      ?? 0;
    // Política soft launch: Hoy 0%, Mañana/2 días −10% (código manda sobre valores viejos en BD).
    const surchargePercent = Object.prototype.hasOwnProperty.call(DEFAULT_SURCHARGE_BY_ID, id)
      ? clampSurchargePercent(DEFAULT_SURCHARGE_BY_ID[id], 0)
      : clampSurchargePercent(
        t.surchargePercent != null ? t.surchargePercent : t.adjustmentPercent,
        surchargeFallback
      );
    const defaultTier = DEFAULT_PRICING.urgencyTiers.find((tier) => tier.id === id);
    return {
      id,
      label: t.label || defaultTier?.label || `Opción ${i + 1}`,
      description: defaultTier?.description || t.description || '',
      responseMinutes,
      surchargePercent,
      // Compat UI antigua
      adjustmentPercent: surchargePercent,
      enabled: t.enabled !== false,
      sortOrder: parseInt(t.sortOrder, 10) || i + 1
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return base;
}

function clampRate(val, fallback) {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizePaymentGateways(raw) {
  const defaults = DEFAULT_PRICING.paymentGateways;
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  ['transbank', 'mercadopago', 'paypal'].forEach((id, i) => {
    const def = defaults[id] || { enabled: true, sortOrder: i + 1 };
    const item = source[id];
    result[id] = {
      enabled: item != null ? item.enabled !== false : def.enabled !== false,
      sortOrder: parseInt(item?.sortOrder, 10) || def.sortOrder || i + 1
    };
  });
  return result;
}

function getActiveUrgencyTiers(pricing) {
  return (pricing.urgencyTiers || []).filter(t => t.enabled !== false).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getUrgencyTier(pricing, tierId) {
  const tiers = getActiveUrgencyTiers(pricing);
  if (tierId) {
    const found = tiers.find(t => t.id === tierId);
    if (found) return found;
  }
  return tiers.find(t => t.id === 'today')
    || tiers.find(t => t.id === 'immediate')
    || tiers.find(t => t.id === 'tomorrow' || t.id === 'scheduled' || t.id === 'two_days')
    || tiers[0]
    || null;
}

/**
 * Cotiza el trabajo con tarifas dinámicas (horario × urgencia) sobre servicePrice.
 * Compat: visitTotal = total dinámico (lo que paga el cliente al solicitar).
 *
 * Visitas “Hoy” / diferidas (mañana / en 2 días / programado): no aplican
 * recargo de “tarde/madrugada” de la hora actual.
 */
function calculateVisitPricing(pricing, tierId, { horaSolicitud = new Date(), valorBase, timeZone, skipWorkFloor = false } = {}) {
  const cfg = normalizePricing(pricing);
  const tier = getUrgencyTier(cfg, tierId);
  if (!tier) return null;

  const urgenciaMultiplier = 1 + (Number(tier.surchargePercent) || 0) / 100;
  const noScheduleSurcharge = ['today', 'tomorrow', 'two_days', 'scheduled'].includes(String(tier.id || ''));
  const tariff = calculateDynamicTariff({
    valorBase: valorBase != null ? valorBase : cfg.servicePrice,
    horaSolicitud,
    tiempoRespuestaMinutos: tier.responseMinutes,
    urgenciaMultiplier,
    urgenciaBand: tier.id,
    scheduleSurcharges: cfg.scheduleSurcharges,
    timeZone,
    forceHorarioBand: noScheduleSurcharge ? 'normal' : undefined,
    skipWorkFloor
  });

  const adjustmentAmount = tariff.total - tariff.valorBaseAplicado;
  const adjustmentPercent = tariff.valorBaseAplicado > 0
    ? Math.round((adjustmentAmount / tariff.valorBaseAplicado) * 100)
    : 0;

  // Desglose: horario (tarde/madrugada) y urgencia van por separado en el resumen.
  const scheduleAdjustmentAmount = Math.round((tariff.afterSchedule || tariff.valorBaseAplicado) - tariff.valorBaseAplicado);
  const urgencyOnlyAdjustmentAmount = Math.round(tariff.total - (tariff.afterSchedule || tariff.valorBaseAplicado));
  const schedulePercent = Number(tariff.horarioPercent) || 0;
  const urgencyOnlyPercent = Number(tier.surchargePercent) || 0;

  const enrichedTier = {
    ...tier,
    adjustmentPercent,
    horarioBand: tariff.horarioBand,
    urgenciaBand: tariff.urgenciaBand
  };

  return {
    tier: enrichedTier,
    baseVisit: tariff.valorBaseAplicado,
    adjustmentPercent,
    adjustmentAmount,
    scheduleBand: tariff.horarioBand,
    schedulePercent,
    scheduleAdjustmentAmount,
    urgencyOnlyPercent,
    urgencyOnlyAdjustmentAmount,
    visitTotal: tariff.total,
    servicePrice: 0,
    estimatedTotal: tariff.total,
    diagnosticVisitMin: Math.max(MIN_DIAGNOSTIC_VISIT_CLP, cfg.visitPrice),
    tariff
  };
}

function formatAdjustmentLabel(percent) {
  if (percent > 0) return `+${percent}%`;
  if (percent < 0) return `${percent}%`;
  return 'Precio normal';
}

function calculatePaymentSurcharge(pricing, visitSubtotal, paymentMethod) {
  const cfg = normalizePricing(pricing);
  const method = paymentMethod === 'transfer' ? 'transfer' : 'card';
  if (method === 'transfer' || !cfg.cardEnabled) {
    return { method: 'transfer', percent: 0, amount: 0, subtotal: visitSubtotal };
  }
  // El cliente paga el precio publicado. Comisión y fee MP se descuentan al socio.
  return {
    method: 'card',
    percent: 0,
    amount: 0,
    subtotal: visitSubtotal
  };
}

function computeRequestFinancials(request, pricing) {
  const cfg = normalizePricing(pricing);
  const visitPaid = request.visitPricePaid ?? request.visitTotal ?? request.basePrice ?? cfg.visitPrice;
  let serviceAmount = request.additionalPaymentsTotal ?? request.approvedServicePrice ?? 0;

  const sr = request.siteReport;
  // Compatibilidad con solicitudes antiguas, anteriores al cobro de ajustes.
  if (sr?.budgetStatus === 'approved' && sr.budgetAmount && request.additionalPaymentsTotal == null) {
    serviceAmount = Math.max(serviceAmount, sr.budgetAmount - visitPaid);
  }

  const materialsTotal = (sr?.materials || []).reduce((s, m) => s + (parseInt(m.amount, 10) || 0), 0);
  const laborTotal = visitPaid + serviceAmount;
  const grandTotal = laborTotal + materialsTotal;

  const laborCommission = Math.round(laborTotal * cfg.laborCommissionRate);
  const materialsCommission = 0;

  const paidByCard = request.paymentMethod === 'card'
    || request.paymentMethod === 'transbank'
    || request.paymentMethod === 'mercadopago'
    || request.paymentMethod === 'paypal';
  const applyCardFee = paidByCard || !request.paymentMethod;
  const mpCost = applyCardFee
    ? mercadoPagoPresentValueCost(laborTotal, {
      installments: request.cardInstallments || request.installments || 1,
      mpOnlineRatePercent: cfg.mpOnlineRatePercent,
      mpPresentValueExtra: cfg.mpPresentValueExtra,
      ivaRate: cfg.ivaRate
    })
    : { amount: 0, rateIvaIncluded: 0, installments: 1 };
  const cardFee = mpCost.amount;

  const ivaFactor = cfg.ivaRate / (1 + cfg.ivaRate);
  const ivaOnCommission = cfg.commissionIvaIncluded
    ? Math.round(laborCommission * ivaFactor)
    : Math.round(laborCommission * cfg.ivaRate);
  const ivaOnCard = Math.round(cardFee * ivaFactor);
  const ivaOnFees = ivaOnCommission + ivaOnCard;
  const feesBeforeIva = cfg.commissionIvaIncluded
    ? (laborCommission - ivaOnCommission) + (cardFee - ivaOnCard)
    : laborCommission + materialsCommission + cardFee;
  const appTotal = cfg.commissionIvaIncluded
    ? laborCommission + cardFee
    : feesBeforeIva + ivaOnFees;
  const providerTotal = Math.max(0, grandTotal - appTotal);

  return {
    visitPaid,
    serviceAmount,
    materialsTotal,
    laborTotal,
    laborCommission,
    laborProvider: laborTotal - laborCommission,
    materialsCommission,
    materialsProvider: materialsTotal - materialsCommission,
    cardFee,
    cardFeeApplied: applyCardFee,
    cardInstallments: mpCost.installments || 1,
    merchantCardFeePercent: Math.round((mpCost.rateIvaIncluded || cfg.merchantCardFeePercent / 100) * 10000) / 100,
    mpOnlineRatePercent: cfg.mpOnlineRatePercent,
    ivaOnFees,
    ivaOnFeesIncluded: Boolean(cfg.commissionIvaIncluded),
    ivaRate: cfg.ivaRate,
    feesBeforeIva,
    appTotal,
    providerTotal,
    grandTotal,
    laborCommissionRate: cfg.laborCommissionRate,
    materialsCommissionRate: cfg.materialsCommissionRate,
    paymentMethod: request.paymentMethod || null
  };
}

/**
 * Vista para socios/técnicos: solo ven su pago hasta completar el servicio.
 */
function getProviderVisibleFinancials(request, pricing) {
  const fin = computeRequestFinancials(request, pricing);
  const completed = request.status === 'completed' || request.techStatus === 'completado';
  if (!completed) {
    return {
      completed: false,
      providerPayout: fin.providerTotal,
      // No exponer totales del cliente ni cortes de la app
      grandTotal: null,
      appTotal: null,
      laborCommission: null,
      cardFee: null,
      ivaOnFees: null
    };
  }
  return {
    completed: true,
    providerPayout: fin.providerTotal,
    grandTotal: fin.grandTotal,
    laborTotal: fin.laborTotal,
    materialsTotal: fin.materialsTotal,
    materialsProvider: fin.materialsProvider,
    appTotal: fin.appTotal,
    laborCommission: fin.laborCommission,
    materialsCommission: fin.materialsCommission,
    cardFee: fin.cardFee,
    ivaOnFees: fin.ivaOnFees,
    ivaOnFeesIncluded: fin.ivaOnFeesIncluded,
    feesBeforeIva: fin.feesBeforeIva,
    laborCommissionRate: fin.laborCommissionRate,
    materialsCommissionRate: 0,
    merchantCardFeePercent: fin.merchantCardFeePercent,
    ivaRate: fin.ivaRate,
    paymentMethod: fin.paymentMethod
  };
}

/**
 * Resumen final que puede ver el cliente. No expone comisiones internas.
 */
function getClientVisibleFinancials(request, pricing) {
  const fin = computeRequestFinancials(request, pricing);
  const completed = request.status === 'completed' || request.techStatus === 'completado';
  const materials = (request.siteReport?.materials || []).map((material) => ({
    description: material.description,
    amount: parseInt(material.amount, 10) || 0
  }));
  return {
    completed,
    visitPaid: fin.visitPaid,
    serviceAmount: fin.serviceAmount,
    laborTotal: fin.laborTotal,
    materialsTotal: fin.materialsTotal,
    materials,
    grandTotal: fin.grandTotal,
    materialsAtCost: true
  };
}

/**
 * Sanitiza una solicitud para el muro / socket del socio o técnico.
 */
function sanitizeRequestForWorker(request, pricing) {
  if (!request) return null;
  const visible = getProviderVisibleFinancials(request, pricing);
  const {
    amountDue,
    visitTotal,
    visitBasePrice,
    basePrice,
    estimatedVisit,
    servicePriceBase,
    urgencyAdjustmentAmount,
    paymentSurchargeAmount,
    paymentSurchargePercent,
    financials,
    chatMessages,
    arrivalCode,
    ...safe
  } = request;

  return {
    ...safe,
    arrivalCodeRequired: Boolean(arrivalCode && !request.arrivalCodeVerifiedAt),
    arrivalCodeVerified: Boolean(request.arrivalCodeVerifiedAt),
    providerPayout: visible.providerPayout,
    financialsVisible: visible,
    // Compat UI antigua: solo muestra lo que gana el socio
    estimatedVisit: visible.providerPayout,
    amountDue: undefined,
    visitTotal: undefined,
    basePrice: undefined
  };
}

function getPricingServiceCatalog(pricing) {
  const cfg = normalizePricing(pricing);
  return getServiceCatalog(cfg.catalogPrices);
}

function getPricingCatalogRows(pricing) {
  const cfg = normalizePricing(pricing);
  return flattenServiceCatalog(cfg.catalogPrices);
}

function getActivitiesForAppService(pricing, serviceId) {
  const cfg = normalizePricing(pricing);
  return getActivitiesForService(serviceId, cfg.catalogPrices);
}

/** Precio promedio de los subservicios de una especialidad para la grilla del cliente. */
function getServiceAveragePrice(pricing, serviceId) {
  const activities = getActivitiesForAppService(pricing, serviceId);
  if (!activities.length) return MIN_WORK_BASE_CLP;
  const total = activities.reduce(
    (sum, activity) => sum + (Number(activity.basePrice) || MIN_WORK_BASE_CLP),
    0
  );
  return Math.round(total / activities.length);
}

/** Precio “desde” = mínimo del catálogo de la especialidad (grilla y ficha deben coincidir). */
function getServiceFromPrice(pricing, serviceId) {
  const activities = getActivitiesForAppService(pricing, serviceId);
  if (!activities.length) {
    const cfg = normalizePricing(pricing);
    return Math.max(MIN_WORK_BASE_CLP, Number(cfg.servicePrice) || MIN_WORK_BASE_CLP);
  }
  if (isPerM2Service(serviceId) || activities.every(isPerM2Activity)) {
    const rates = activities
      .map((activity) => Number(activity.pricePerM2 || activity.basePrice) || 0)
      .filter((n) => n > 0);
    return rates.length ? Math.min(...rates) : GARDEN_OTHER_RATE_M2;
  }
  const prices = activities
    .map((activity) => Number(activity.basePrice) || 0)
    .filter((n) => n > 0);
  if (!prices.length) return MIN_WORK_BASE_CLP;
  return Math.min(...prices);
}

function getServicePriceSummary(pricing, serviceId) {
  const activities = getActivitiesForAppService(pricing, serviceId);
  const fromPrice = getServiceFromPrice(pricing, serviceId);
  const averagePrice = getServiceAveragePrice(pricing, serviceId);
  const perM2 = isPerM2Service(serviceId) || activities.some(isPerM2Activity);
  const prices = activities
    .map((activity) => Number(perM2 ? (activity.pricePerM2 || activity.basePrice) : activity.basePrice) || 0)
    .filter((n) => n > 0);
  return {
    fromPrice,
    averagePrice: perM2 ? fromPrice : averagePrice,
    maxPrice: prices.length ? Math.max(...prices) : fromPrice,
    activityCount: activities.length,
    pricingUnit: perM2 ? 'm2' : 'job'
  };
}

function quoteActivityForRequest(pricing, activityId, { horaSolicitud, tierId, timeZone, squareMeters } = {}) {
  const cfg = normalizePricing(pricing);
  const found = findCatalogActivity(activityId, cfg.catalogPrices);
  if (!found) return null;
  const tier = getUrgencyTier(cfg, tierId);
  if (!tier) return null;
  const perM2 = isPerM2Activity(found.activity);
  const valorBase = perM2
    ? resolveM2QuoteBase(found.activity, squareMeters)
    : found.activity.basePrice;
  return calculateVisitPricing(cfg, tier.id, {
    horaSolicitud: horaSolicitud || new Date(),
    valorBase,
    timeZone,
    skipWorkFloor: perM2
  });
}

/** Razones de cancelación (estándar marketplace de servicios a domicilio). */
const CANCELLATION_REASONS = [
  { id: 'changed_plans', label: 'Cambié de planes / ya no lo necesito' },
  { id: 'found_another', label: 'Encontré otra solución u otro técnico' },
  { id: 'wrong_service', label: 'Pedí el servicio equivocado' },
  { id: 'wait_too_long', label: 'La espera es demasiado larga' },
  { id: 'price_concern', label: 'El precio o presupuesto no me convence' },
  { id: 'emergency_resolved', label: 'Se resolvió solo / la emergencia pasó' },
  { id: 'scheduling_conflict', label: 'Conflicto de horario / no puedo recibir' },
  { id: 'tech_issue', label: 'Problema con el técnico o la comunicación' },
  { id: 'safety_concern', label: 'Preferencia de seguridad / comodidad' },
  { id: 'other', label: 'Otro motivo (prefiero no especificar)' }
];

const ON_ROUTE_OR_SITE_STATUSES = new Set([
  'en_camino',
  'en_sitio',
  'diagnostico',
  'reparando',
  'comprando',
  'presupuesto_pendiente',
  'presupuesto_aprobado'
]);

/**
 * Escalón de cancelación según el estado del pedido.
 * @returns {'beforeAccepted'|'afterTechAccepted'|'enRouteOrOnSite'}
 */
function resolveCancellationTier(request) {
  const ts = String(request?.techStatus || '');
  if (ON_ROUTE_OR_SITE_STATUSES.has(ts)) return 'enRouteOrOnSite';
  if (ts === 'aceptado') return 'afterTechAccepted';
  return 'beforeAccepted';
}

function getCancellationFeeClp(pricing, request) {
  const cfg = normalizePricing(pricing);
  const tier = resolveCancellationTier(request);
  return Math.max(0, parseInt(cfg.cancellations?.[tier], 10) || 0);
}

function getCancellationReasonLabel(reasonId) {
  const found = CANCELLATION_REASONS.find((r) => r.id === reasonId);
  return found ? found.label : (reasonId || '');
}

module.exports = {
  DEFAULT_PRICING,
  normalizePricing,
  normalizeScheduleSurcharges,
  normalizePaymentGateways,
  getActiveUrgencyTiers,
  getUrgencyTier,
  calculateVisitPricing,
  calculatePaymentSurcharge,
  formatAdjustmentLabel,
  computeRequestFinancials,
  getProviderVisibleFinancials,
  getClientVisibleFinancials,
  sanitizeRequestForWorker,
  getPricingServiceCatalog,
  getPricingCatalogRows,
  getActivitiesForAppService,
  getServiceAveragePrice,
  getServiceFromPrice,
  getServicePriceSummary,
  quoteActivityForRequest,
  specialtyIdForService,
  findCatalogActivity,
  isPerM2Service,
  isPerM2Activity,
  isLandscapeActivity,
  resolveM2QuoteBase,
  normalizeLandscapeFactors,
  resolveLandscapeQuoteBase,
  formatLandscapeSummary,
  GARDEN_OTHER_RATE_M2,
  GARDEN_MIN_JOB_CLP,
  LANDSCAPE_MIN_M2,
  LANDSCAPE_MIN_JOB_CLP,
  LANDSCAPE_STANDARDS,
  LANDSCAPE_TERRAIN,
  LANDSCAPE_SPECIES,
  MIN_WORK_BASE_CLP,
  MIN_DIAGNOSTIC_VISIT_CLP,
  CANCELLATION_REASONS,
  resolveCancellationTier,
  getCancellationFeeClp,
  getCancellationReasonLabel,
  getEnabledMaterialsCatalog,
  findMaterialInCatalog,
  normalizeMaterialsCatalog,
  mercadoPagoPresentValueCost,
  effectiveCardFeePercent,
  normalizeMaxCardInstallments,
  DEFAULT_MAX_CARD_INSTALLMENTS
};

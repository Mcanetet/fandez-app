/**
 * Intake de Jardinería y paisajismo — Valle Parraguez Paisajismo.
 * Captura de requerimientos; el cobro inicial es la evaluación técnica en terreno.
 */
'use strict';

const GARDEN_INTAKE_MIN_M2 = 100;
const GARDEN_EVAL_VISIT_CLP = 40000;
const GARDEN_INTAKE_VERSION = 'valle-parraguez-v1';
const GARDEN_PARTNER_NAME = 'Valle Parraguez Paisajismo';

const SERVICE_TYPES = {
  diseno: {
    id: 'diseno',
    activityId: 'jard-diseno',
    label: 'Diseño de Jardines',
    hint: 'Proyectos nuevos o remodelación desde 100 m²',
    paymentScheme: '50% anticipo + 50% contra entrega de planimetría'
  },
  construccion: {
    id: 'construccion',
    activityId: 'jard-construccion',
    label: 'Construcción de Jardines',
    hint: 'Ejecución, nuevas obras o remodelaciones desde 100 m²',
    paymentScheme: 'Esquema de 3 abonos (Anticipo / Plantación / Saldo contra entrega)'
  },
  mantencion: {
    id: 'mantencion',
    activityId: 'jard-mantencion',
    label: 'Mantención de Jardines',
    hint: 'Condominios, edificios o espacios comunes desde 100 m²',
    paymentScheme: 'Facturación a 30 días'
  }
};

const PROPERTY_TYPES = {
  residencial: { id: 'residencial', label: 'Residencial particular' },
  condominio: { id: 'condominio', label: 'Condominio' },
  comercial: { id: 'comercial', label: 'Edificio comercial o corporativo' }
};

const FREQUENCIES = {
  semanal: { id: 'semanal', label: 'Semanal' },
  quincenal: { id: 'quincenal', label: 'Quincenal' },
  mensual: { id: 'mensual', label: 'Mensual' }
};

const CONSTRUCTION_SCOPES = {
  con_diseno: {
    id: 'con_diseno',
    label: 'Ya cuento con propuesta / diseño previo aprobado'
  },
  desde_cero: {
    id: 'desde_cero',
    label: 'Requiero evaluación técnica desde cero'
  }
};

const DESIGN_ADDONS = {
  riego: { id: 'riego', label: 'Proyecto de Riego' },
  iluminacion: { id: 'iluminacion', label: 'Proyecto de Iluminación' },
  renders: { id: 'renders', label: 'Renders e imágenes 3D' }
};

function isGardenIntakeService(serviceId) {
  return String(serviceId || '') === 'jardineria';
}

function isGardenIntakeActivity(activity) {
  if (!activity) return false;
  return activity.quoteMode === 'garden_intake'
    || String(activity.id || '').startsWith('jard-diseno')
    || String(activity.id || '').startsWith('jard-construccion')
    || String(activity.id || '') === 'jard-mantencion';
}

function parseServiceTypeKeys(raw) {
  const list = Array.isArray(raw)
    ? raw
    : (Array.isArray(raw?.serviceTypes) ? raw.serviceTypes : []);
  const keys = [];
  list.forEach((item) => {
    const key = String(item || '').trim().toLowerCase()
      .replace(/^jard-/, '')
      .replace('diseño', 'diseno')
      .replace('diseo', 'diseno');
    const mapped = key === 'diseno' || key === 'construccion' || key === 'mantencion'
      ? key
      : (SERVICE_TYPES[key] ? key : null);
    if (mapped && !keys.includes(mapped)) keys.push(mapped);
  });
  return keys;
}

/**
 * @returns {{ ok: true, intake: object } | { ok: false, error: string }}
 */
function normalizeGardenIntake(raw, { squareMeters, planFileUrl } = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const serviceTypes = parseServiceTypeKeys(input.serviceTypes || input.types || input);
  if (!serviceTypes.length) {
    return { ok: false, error: 'Selecciona al menos un tipo de servicio (Diseño, Construcción o Mantención).' };
  }

  const m2 = Number(squareMeters != null ? squareMeters : input.squareMeters);
  if (!Number.isFinite(m2) || m2 < GARDEN_INTAKE_MIN_M2) {
    return {
      ok: false,
      error: `Indica la superficie estimada del jardín (mínimo ${GARDEN_INTAKE_MIN_M2} m²).`
    };
  }

  const locationSector = String(input.locationSector || input.sector || input.comuna || '').trim();
  if (locationSector.length < 2) {
    return { ok: false, error: 'Indica la comuna o sector del terreno (ej: Chicureo, Vitacura).' };
  }

  const propertyKey = String(input.propertyType || '').trim();
  const propertyMeta = PROPERTY_TYPES[propertyKey];
  if (!propertyMeta) {
    return { ok: false, error: 'Selecciona el tipo de propiedad.' };
  }

  const hasPlanRaw = input.hasDigitalPlan ?? input.hasPlan;
  const hasDigitalPlan = hasPlanRaw === true || hasPlanRaw === 'true' || hasPlanRaw === 'si' || hasPlanRaw === 'sí' || hasPlanRaw === 'yes';
  const hasPlanNo = hasPlanRaw === false || hasPlanRaw === 'false' || hasPlanRaw === 'no';
  if (!hasDigitalPlan && !hasPlanNo) {
    return { ok: false, error: 'Indica si cuentas con plano digital base del terreno.' };
  }

  let planUrl = planFileUrl || input.planFileUrl || null;
  let siteVisitOk = Boolean(input.siteVisitOk || input.confirmSiteVisit);
  if (hasDigitalPlan) {
    if (!planUrl) {
      return { ok: false, error: 'Adjunta el plano digital (PDF). También puedes compartir DWG/CAD con el socio tras la evaluación.' };
    }
  } else if (!siteVisitOk) {
    return {
      ok: false,
      error: 'Sin plano digital, confirma disponibilidad para coordinar visita técnica de levantamiento.'
    };
  }

  let maintenanceFrequency = null;
  let maintenanceFrequencyLabel = null;
  if (serviceTypes.includes('mantencion')) {
    const freqKey = String(input.maintenanceFrequency || input.frequency || '').trim();
    const freqMeta = FREQUENCIES[freqKey];
    if (!freqMeta) {
      return { ok: false, error: 'En Mantención, indica la frecuencia deseada (Semanal / Quincenal / Mensual).' };
    }
    maintenanceFrequency = freqMeta.id;
    maintenanceFrequencyLabel = freqMeta.label;
  }

  const designAddons = [];
  const designAddonLabels = [];
  if (serviceTypes.includes('diseno')) {
    const rawAddons = Array.isArray(input.designAddons) ? input.designAddons : [];
    rawAddons.forEach((a) => {
      const key = String(a || '').trim();
      const meta = DESIGN_ADDONS[key];
      if (meta && !designAddons.includes(meta.id)) {
        designAddons.push(meta.id);
        designAddonLabels.push(meta.label);
      }
    });
  }

  let constructionScope = null;
  let constructionScopeLabel = null;
  if (serviceTypes.includes('construccion')) {
    const scopeKey = String(input.constructionScope || '').trim();
    const scopeMeta = CONSTRUCTION_SCOPES[scopeKey];
    if (!scopeMeta) {
      return {
        ok: false,
        error: 'En Construcción, indica si ya tienes diseño aprobado o necesitas evaluación desde cero.'
      };
    }
    constructionScope = scopeMeta.id;
    constructionScopeLabel = scopeMeta.label;
  }

  const acceptEval = Boolean(input.acceptTechnicalVisit || input.acceptEval);
  const acceptPayment = Boolean(input.acceptPaymentTerms || input.acceptPayments);
  if (!acceptEval) {
    return { ok: false, error: 'Debes aceptar la evaluación técnica en terreno post-solicitud.' };
  }
  if (!acceptPayment) {
    return { ok: false, error: 'Debes aceptar las modalidades de pago según el servicio solicitado.' };
  }

  const typesMeta = serviceTypes.map((k) => SERVICE_TYPES[k]).filter(Boolean);
  const paymentSchemes = typesMeta.map((t) => ({
    serviceType: t.id,
    label: t.label,
    scheme: t.paymentScheme
  }));

  const intake = {
    version: GARDEN_INTAKE_VERSION,
    partnerName: GARDEN_PARTNER_NAME,
    serviceTypes,
    serviceTypeLabels: typesMeta.map((t) => t.label),
    activityIds: typesMeta.map((t) => t.activityId),
    locationSector,
    squareMeters: Math.round(m2),
    propertyType: propertyMeta.id,
    propertyTypeLabel: propertyMeta.label,
    hasDigitalPlan,
    planFileUrl: hasDigitalPlan ? planUrl : null,
    siteVisitOk: hasDigitalPlan ? false : true,
    maintenanceFrequency,
    maintenanceFrequencyLabel,
    designAddons,
    designAddonLabels,
    constructionScope,
    constructionScopeLabel,
    acceptTechnicalVisit: true,
    acceptPaymentTerms: true,
    paymentSchemes,
    evalVisitPrice: GARDEN_EVAL_VISIT_CLP
  };

  return { ok: true, intake };
}

function primaryActivityFromIntake(intake) {
  const first = intake?.serviceTypes?.[0];
  const meta = first ? SERVICE_TYPES[first] : null;
  return {
    id: meta?.activityId || 'jard-diseno',
    name: (intake?.serviceTypeLabels || []).join(' + ') || meta?.label || 'Jardinería y paisajismo',
    kind: first === 'mantencion' ? 'preventiva' : 'correctiva',
    basePrice: GARDEN_EVAL_VISIT_CLP,
    pricePerM2: null,
    pricingUnit: 'job',
    minM2: GARDEN_INTAKE_MIN_M2,
    quoteMode: 'garden_intake'
  };
}

function formatGardenIntakeSummary(intake) {
  if (!intake || !intake.serviceTypeLabels?.length) return '';
  const parts = [
    `Valle Parraguez · ${intake.serviceTypeLabels.join(', ')}`,
    `${intake.squareMeters} m²`,
    intake.locationSector,
    intake.propertyTypeLabel
  ];
  if (intake.hasDigitalPlan) parts.push('con plano digital');
  else parts.push('sin plano · visita de levantamiento');
  if (intake.maintenanceFrequencyLabel) parts.push(`frecuencia ${intake.maintenanceFrequencyLabel}`);
  if (intake.designAddonLabels?.length) parts.push(`diseño: ${intake.designAddonLabels.join(', ')}`);
  if (intake.constructionScopeLabel) parts.push(intake.constructionScopeLabel);
  return `Requerimiento jardinería: ${parts.filter(Boolean).join(' · ')}.`;
}

function gardenIntakePaymentHint(intake) {
  if (!intake?.paymentSchemes?.length) return '';
  return intake.paymentSchemes
    .map((p) => `${p.label}: ${p.scheme}`)
    .join(' · ');
}

module.exports = {
  GARDEN_INTAKE_MIN_M2,
  GARDEN_EVAL_VISIT_CLP,
  GARDEN_INTAKE_VERSION,
  GARDEN_PARTNER_NAME,
  SERVICE_TYPES,
  PROPERTY_TYPES,
  FREQUENCIES,
  CONSTRUCTION_SCOPES,
  DESIGN_ADDONS,
  isGardenIntakeService,
  isGardenIntakeActivity,
  parseServiceTypeKeys,
  normalizeGardenIntake,
  primaryActivityFromIntake,
  formatGardenIntakeSummary,
  gardenIntakePaymentHint
};

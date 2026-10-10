/**
 * Intake proyecto fotovoltaico / paneles solares (Netbilling Chile).
 * Cobro inicial = evaluación técnica en terreno; el kit/proyecto se cotiza después.
 */
'use strict';

const FV_EVAL_VISIT_CLP = 80000;
const FV_INTAKE_VERSION = 'fv-netbilling-v1';

const SYSTEM_TYPES = {
  autoconsumo: {
    id: 'autoconsumo',
    activityId: 'fv-eval-autoconsumo',
    label: 'Autoconsumo',
    hint: 'Bajar la boleta con lo que generas en el día'
  },
  netbilling: {
    id: 'netbilling',
    activityId: 'fv-eval-netbilling',
    label: 'Netbilling (inyección a la red)',
    hint: 'Excedentes a la distribuidora · Ley 21.118'
  },
  hibrido: {
    id: 'hibrido',
    activityId: 'fv-eval-hibrido',
    label: 'Híbrido + batería',
    hint: 'Respaldo nocturno o cortes de luz'
  }
};

const ROOF_TYPES = {
  teja: { id: 'teja', label: 'Teja' },
  zinc: { id: 'zinc', label: 'Zinc / metal' },
  concreto: { id: 'concreto', label: 'Losa / concreto' },
  otro: { id: 'otro', label: 'Otro / no sé' }
};

const KIT_PRESETS = {
  '3': { id: '3', label: 'Kit ~3 kWp', kwp: 3, priceFrom: 3900000 },
  '5': { id: '5', label: 'Kit ~5 kWp', kwp: 5, priceFrom: 5950000 },
  '8': { id: '8', label: 'Kit ~8 kWp', kwp: 8, priceFrom: 7600000 },
  custom: { id: 'custom', label: 'Que el técnico me recomiende', kwp: null, priceFrom: null }
};

function isFvIntakeService(serviceId) {
  return String(serviceId || '') === 'fotovoltaico';
}

function parseBillClp(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * @returns {{ ok: true, intake: object } | { ok: false, error: string }}
 */
function normalizeFvIntake(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const typeKey = String(input.systemType || input.type || '').trim().toLowerCase();
  const typeMeta = SYSTEM_TYPES[typeKey];
  if (!typeMeta) {
    return { ok: false, error: 'Elige el tipo de sistema (autoconsumo, netbilling o híbrido).' };
  }

  const billClp = parseBillClp(input.monthlyBillClp ?? input.boleta ?? input.bill);
  if (!billClp || billClp < 15000) {
    return { ok: false, error: 'Indica el monto aproximado de tu boleta de luz (mín. $15.000).' };
  }

  let savingsPct = Number(input.savingsPct ?? input.ahorroPct ?? 70);
  if (!Number.isFinite(savingsPct)) savingsPct = 70;
  savingsPct = Math.min(90, Math.max(40, Math.round(savingsPct)));

  const kitKey = String(input.kitPreset || input.kit || 'custom').trim();
  const kitMeta = KIT_PRESETS[kitKey] || KIT_PRESETS.custom;

  const roofKey = String(input.roofType || '').trim();
  const roofMeta = ROOF_TYPES[roofKey] || null;

  const commune = String(input.commune || input.comuna || input.locationSector || '').trim();
  if (commune.length < 2) {
    return { ok: false, error: 'Indica la comuna donde está el techo.' };
  }

  const notes = String(input.notes || input.goal || '').trim();

  const intake = {
    version: FV_INTAKE_VERSION,
    systemType: typeMeta.id,
    systemTypeLabel: typeMeta.label,
    activityId: typeMeta.activityId,
    monthlyBillClp: billClp,
    savingsPct,
    estimatedNewBillClp: Math.round(billClp * (1 - savingsPct / 100)),
    estimatedSavingsClp: Math.round(billClp * (savingsPct / 100)),
    kitPreset: kitMeta.id,
    kitLabel: kitMeta.label,
    kitKwp: kitMeta.kwp,
    kitPriceFrom: kitMeta.priceFrom,
    roofType: roofMeta ? roofMeta.id : null,
    roofTypeLabel: roofMeta ? roofMeta.label : null,
    commune,
    notes: notes || null,
    evalVisitPrice: FV_EVAL_VISIT_CLP,
    createdAt: new Date().toISOString()
  };

  return { ok: true, intake };
}

function primaryActivityFromFvIntake(intake) {
  const type = SYSTEM_TYPES[intake?.systemType] || SYSTEM_TYPES.netbilling;
  return {
    id: type.activityId,
    name: `Evaluación FV · ${type.label}`,
    kind: 'correctiva',
    basePrice: FV_EVAL_VISIT_CLP,
    quoteMode: 'fv_intake',
    pricingUnit: 'job'
  };
}

function formatFvIntakeSummary(intake) {
  if (!intake) return '';
  const parts = [
    intake.systemTypeLabel,
    intake.monthlyBillClp ? `Boleta ~$${Number(intake.monthlyBillClp).toLocaleString('es-CL')}` : null,
    intake.savingsPct ? `Meta ahorro ${intake.savingsPct}%` : null,
    intake.kitLabel,
    intake.commune
  ].filter(Boolean);
  return parts.join(' · ');
}

module.exports = {
  FV_EVAL_VISIT_CLP,
  FV_INTAKE_VERSION,
  SYSTEM_TYPES,
  ROOF_TYPES,
  KIT_PRESETS,
  isFvIntakeService,
  normalizeFvIntake,
  primaryActivityFromFvIntake,
  formatFvIntakeSummary,
  parseBillClp
};

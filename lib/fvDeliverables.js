/**
 * Bitácora de hitos proyecto fotovoltaico (espejo liviano de gardenDeliverables).
 */
'use strict';

const CLIENT_STATUS = {
  none: 'none',
  awaiting: 'awaiting_client',
  accepted: 'accepted',
  correction: 'needs_correction'
};

const PARTNER_STATUS = {
  none: 'none',
  awaiting: 'awaiting_partner',
  approved: 'approved_for_client',
  rejected: 'rejected_by_partner'
};

const FV_DELIVERABLE_DEFS = [
  {
    id: 'fv_levantamiento',
    sortOrder: 10,
    label: 'Levantamiento / visita técnica',
    hint: 'Fotos techo (varios ángulos) + tablero + medidor + notas de sombra.',
    clientLabel: 'Levantamiento',
    accept: 'image/*,application/pdf',
    kind: 'media',
    required: true,
    minFiles: 3,
    paymentPhase: null
  },
  {
    id: 'fv_anteproyecto',
    sortOrder: 20,
    label: 'Anteproyecto / layout',
    hint: 'PDF layout + potencia kWp + estimación de ahorro.',
    clientLabel: 'Anteproyecto',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: 'fv_anticipo_diseno',
    unlockAfter: 'fv_levantamiento'
  },
  {
    id: 'fv_propuesta',
    sortOrder: 30,
    label: 'Propuesta comercial + equipos SEC',
    hint: 'Cotización, modelos autorizados y garantías.',
    clientLabel: 'Propuesta',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: null,
    unlockAfter: 'fv_anteproyecto'
  },
  {
    id: 'fv_tramites',
    sortOrder: 40,
    label: 'Factibilidad / respuesta distribuidora',
    hint: 'Comprobante SCR + F4 (CIP/IEP) o rechazo documentado.',
    clientLabel: 'Trámites',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: 'fv_tramites',
    unlockAfter: 'fv_propuesta'
  },
  {
    id: 'fv_obra',
    sortOrder: 50,
    label: 'Obra / montaje',
    hint: 'Fotos estructura, paneles, cableado, inversor y etiquetas.',
    clientLabel: 'Obra',
    accept: 'image/*,application/pdf',
    kind: 'media',
    required: true,
    minFiles: 4,
    paymentPhase: 'fv_obra',
    unlockAfter: 'fv_tramites'
  },
  {
    id: 'fv_te4',
    sortOrder: 60,
    label: 'Declaración TE-4 / conexión',
    hint: 'TE-4 y notificación de conexión / medidor bidireccional.',
    clientLabel: 'TE-4',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: null,
    unlockAfter: 'fv_obra'
  },
  {
    id: 'fv_puesta_marcha',
    sortOrder: 70,
    label: 'Puesta en marcha + monitoreo',
    hint: 'Pruebas, app de monitoreo y capacitación al cliente.',
    clientLabel: 'Puesta en marcha',
    accept: 'image/*,application/pdf',
    kind: 'media',
    required: true,
    minFiles: 2,
    paymentPhase: 'fv_saldo',
    unlockAfter: 'fv_te4'
  }
];

function emptyItem(def) {
  return {
    ...def,
    files: [],
    clientStatus: CLIENT_STATUS.none,
    partnerStatus: PARTNER_STATUS.none,
    clientNote: null,
    partnerNote: null,
    uploadedAt: null,
    acceptedAt: null
  };
}

function buildFvDeliverablesChecklist() {
  return FV_DELIVERABLE_DEFS.map(emptyItem);
}

function ensureFvDeliverables(request) {
  if (!request?.fvIntake) return null;
  if (!Array.isArray(request.fvDeliverables) || !request.fvDeliverables.length) {
    request.fvDeliverables = buildFvDeliverablesChecklist();
  }
  return request.fvDeliverables;
}

function fvDeliverablesProgress(list) {
  const items = Array.isArray(list) ? list : [];
  const required = items.filter((d) => d.required);
  const done = required.filter((d) => d.clientStatus === CLIENT_STATUS.accepted);
  return {
    done: done.length,
    total: required.length,
    complete: required.length > 0 && done.length === required.length
  };
}

module.exports = {
  CLIENT_STATUS,
  PARTNER_STATUS,
  FV_DELIVERABLE_DEFS,
  buildFvDeliverablesChecklist,
  ensureFvDeliverables,
  fvDeliverablesProgress
};

/**
 * Entregables de jardinería (Valle Parraguez) — checklist articulado
 * según lo que el cliente pidió en el intake.
 */
'use strict';

const { DESIGN_ADDONS, SERVICE_TYPES } = require('./gardenIntake');

/**
 * Plantillas de entregables por tipo de servicio / complemento.
 * required = obligatorio para cerrar la visita.
 */
const DELIVERABLE_DEFS = {
  diseno_planimetria: {
    id: 'diseno_planimetria',
    serviceType: 'diseno',
    label: 'Planimetría / plano de diseño',
    hint: 'PDF o imagen del proyecto de diseño entregado al cliente.',
    clientLabel: 'Plano de diseño',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true
  },
  diseno_riego: {
    id: 'diseno_riego',
    serviceType: 'diseno',
    addon: 'riego',
    label: 'Proyecto de riego',
    hint: 'Plano o memoria del sistema de riego.',
    clientLabel: 'Proyecto de riego',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true
  },
  diseno_iluminacion: {
    id: 'diseno_iluminacion',
    serviceType: 'diseno',
    addon: 'iluminacion',
    label: 'Proyecto de iluminación',
    hint: 'Plano o memoria de iluminación exterior.',
    clientLabel: 'Proyecto de iluminación',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true
  },
  diseno_renders: {
    id: 'diseno_renders',
    serviceType: 'diseno',
    addon: 'renders',
    label: 'Renders e imágenes 3D',
    hint: 'Imágenes o PDF con visualizaciones 3D.',
    clientLabel: 'Renders 3D',
    accept: 'application/pdf,image/*',
    kind: 'media',
    required: true
  },
  construccion_avance: {
    id: 'construccion_avance',
    serviceType: 'construccion',
    label: 'Evidencia de ejecución / plantación',
    hint: 'Foto del avance en obra o etapa de plantación.',
    clientLabel: 'Avance de obra',
    accept: 'image/*',
    kind: 'photo',
    required: true
  },
  construccion_entrega: {
    id: 'construccion_entrega',
    serviceType: 'construccion',
    label: 'Entrega final de obra',
    hint: 'Foto clara del jardín terminado al momento de la entrega.',
    clientLabel: 'Obra entregada',
    accept: 'image/*',
    kind: 'photo',
    required: true
  },
  mantencion_informe: {
    id: 'mantencion_informe',
    serviceType: 'mantencion',
    label: 'Informe de mantención',
    hint: 'PDF o foto del checklist / informe de la visita de mantención.',
    clientLabel: 'Informe de mantención',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true
  },
  mantencion_evidencia: {
    id: 'mantencion_evidencia',
    serviceType: 'mantencion',
    label: 'Fotos del área mantenida',
    hint: 'Al menos una foto del espacio después de la mantención.',
    clientLabel: 'Evidencia de mantención',
    accept: 'image/*',
    kind: 'photo',
    required: true
  }
};

function buildGardenDeliverablesChecklist(intake) {
  if (!intake || !Array.isArray(intake.serviceTypes) || !intake.serviceTypes.length) {
    return [];
  }
  const types = new Set(intake.serviceTypes);
  const addons = new Set(Array.isArray(intake.designAddons) ? intake.designAddons : []);
  const list = [];

  Object.values(DELIVERABLE_DEFS).forEach((def) => {
    if (!types.has(def.serviceType)) return;
    if (def.addon && !addons.has(def.addon)) return;
    list.push({
      id: def.id,
      serviceType: def.serviceType,
      serviceTypeLabel: SERVICE_TYPES[def.serviceType]?.label || def.serviceType,
      addon: def.addon || null,
      addonLabel: def.addon ? (DESIGN_ADDONS[def.addon]?.label || def.addon) : null,
      label: def.label,
      hint: def.hint,
      clientLabel: def.clientLabel,
      accept: def.accept,
      kind: def.kind,
      required: Boolean(def.required),
      status: 'pending',
      fileUrl: null,
      fileName: null,
      mimeType: null,
      uploadedAt: null,
      uploadedBy: null
    });
  });

  return list;
}

function mergeDeliverablesState(expected, existing) {
  const byId = new Map();
  (Array.isArray(existing) ? existing : []).forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return (Array.isArray(expected) ? expected : []).map((slot) => {
    const prev = byId.get(slot.id);
    if (!prev || prev.status !== 'uploaded' || !prev.fileUrl) return { ...slot };
    return {
      ...slot,
      status: 'uploaded',
      fileUrl: prev.fileUrl,
      fileName: prev.fileName || null,
      mimeType: prev.mimeType || null,
      uploadedAt: prev.uploadedAt || null,
      uploadedBy: prev.uploadedBy || null,
      note: prev.note || null
    };
  });
}

function ensureGardenDeliverables(request) {
  if (!request?.gardenIntake) return null;
  const expected = buildGardenDeliverablesChecklist(request.gardenIntake);
  if (!expected.length) {
    request.gardenDeliverables = [];
    return request.gardenDeliverables;
  }
  request.gardenDeliverables = mergeDeliverablesState(expected, request.gardenDeliverables);
  return request.gardenDeliverables;
}

function gardenDeliverablesProgress(list) {
  const items = Array.isArray(list) ? list : [];
  const required = items.filter((d) => d.required);
  const done = required.filter((d) => d.status === 'uploaded' && d.fileUrl);
  return {
    total: required.length,
    done: done.length,
    complete: required.length > 0 && done.length === required.length,
    missing: required.filter((d) => d.status !== 'uploaded' || !d.fileUrl).map((d) => d.label)
  };
}

function applyGardenDeliverableUpload(request, {
  deliverableId,
  fileUrl,
  fileName,
  mimeType,
  note,
  uploadedBy
} = {}) {
  const list = ensureGardenDeliverables(request);
  if (!list || !list.length) {
    return { error: 'Este pedido no tiene entregables de jardinería.' };
  }
  const item = list.find((d) => d.id === deliverableId);
  if (!item) {
    return { error: 'Entregable no corresponde a este servicio.' };
  }
  if (!fileUrl) {
    return { error: 'Sube el archivo del entregable.' };
  }
  item.status = 'uploaded';
  item.fileUrl = fileUrl;
  item.fileName = String(fileName || '').slice(0, 160) || null;
  item.mimeType = String(mimeType || '').slice(0, 120) || null;
  item.note = String(note || '').trim().slice(0, 280) || null;
  item.uploadedAt = new Date().toISOString();
  item.uploadedBy = uploadedBy || null;
  return { success: true, deliverable: item, progress: gardenDeliverablesProgress(list) };
}

function assertGardenDeliverablesReady(request) {
  if (!request?.gardenIntake) return { ok: true };
  const list = ensureGardenDeliverables(request);
  const progress = gardenDeliverablesProgress(list);
  if (!progress.total) return { ok: true, progress };
  if (!progress.complete) {
    return {
      ok: false,
      error: `Faltan entregables: ${progress.missing.join(', ')}.`,
      progress
    };
  }
  return { ok: true, progress };
}

function serializeGardenDeliverablesForClient(list) {
  return (Array.isArray(list) ? list : [])
    .filter((d) => d.status === 'uploaded' && d.fileUrl)
    .map((d) => ({
      id: d.id,
      label: d.clientLabel || d.label,
      serviceTypeLabel: d.serviceTypeLabel || null,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
      kind: d.kind
    }));
}

module.exports = {
  DELIVERABLE_DEFS,
  buildGardenDeliverablesChecklist,
  mergeDeliverablesState,
  ensureGardenDeliverables,
  gardenDeliverablesProgress,
  applyGardenDeliverableUpload,
  assertGardenDeliverablesReady,
  serializeGardenDeliverablesForClient
};

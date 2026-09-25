/**
 * Entregables de jardinería / paisajismo (Valle Parraguez).
 * Bitácora de hitos: subida → (opcional revisión socio) → validación cliente.
 */
'use strict';

const { DESIGN_ADDONS, SERVICE_TYPES } = require('./gardenIntake');

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

/**
 * Plantillas de hitos.
 * minFiles: mínimo de archivos para considerar el hito subido.
 * paymentPhase: abono sugerido al aceptar el cliente.
 * unlockAfter: id de hito previo (opcional).
 */
const DELIVERABLE_DEFS = {
  diseno_levantamiento: {
    id: 'diseno_levantamiento',
    serviceType: 'diseno',
    sortOrder: 10,
    label: 'Levantamiento / croquis en terreno',
    hint: 'Fotos del sitio + croquis o notas del levantamiento (mín. 2 fotos).',
    clientLabel: 'Levantamiento',
    accept: 'image/*,application/pdf',
    kind: 'media',
    required: true,
    minFiles: 2,
    paymentPhase: null
  },
  diseno_anteproyecto: {
    id: 'diseno_anteproyecto',
    serviceType: 'diseno',
    sortOrder: 20,
    label: 'Anteproyecto / planimetría borrador',
    hint: 'PDF o imagen del anteproyecto para que el cliente revise.',
    clientLabel: 'Anteproyecto',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: 'diseno_anticipo',
    unlockAfter: 'diseno_levantamiento'
  },
  diseno_planimetria: {
    id: 'diseno_planimetria',
    serviceType: 'diseno',
    sortOrder: 30,
    label: 'Planimetría final de diseño',
    hint: 'PDF o imagen del proyecto de diseño entregado al cliente.',
    clientLabel: 'Plano de diseño final',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: 'diseno_entrega',
    unlockAfter: 'diseno_anteproyecto'
  },
  diseno_riego: {
    id: 'diseno_riego',
    serviceType: 'diseno',
    addon: 'riego',
    sortOrder: 40,
    label: 'Proyecto de riego',
    hint: 'Plano o memoria del sistema de riego.',
    clientLabel: 'Proyecto de riego',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: null
  },
  diseno_iluminacion: {
    id: 'diseno_iluminacion',
    serviceType: 'diseno',
    addon: 'iluminacion',
    sortOrder: 41,
    label: 'Proyecto de iluminación',
    hint: 'Plano o memoria de iluminación exterior.',
    clientLabel: 'Proyecto de iluminación',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: null
  },
  diseno_renders: {
    id: 'diseno_renders',
    serviceType: 'diseno',
    addon: 'renders',
    sortOrder: 42,
    label: 'Renders e imágenes 3D',
    hint: 'Imágenes o PDF con visualizaciones 3D.',
    clientLabel: 'Renders 3D',
    accept: 'application/pdf,image/*',
    kind: 'media',
    required: true,
    minFiles: 1,
    paymentPhase: null
  },
  construccion_inicio: {
    id: 'construccion_inicio',
    serviceType: 'construccion',
    sortOrder: 10,
    label: 'Inicio / preparación de terreno',
    hint: 'Fotos del antes y de la preparación (mín. 2).',
    clientLabel: 'Inicio de obra',
    accept: 'image/*',
    kind: 'photo',
    required: true,
    minFiles: 2,
    paymentPhase: 'anticipo'
  },
  construccion_avance: {
    id: 'construccion_avance',
    serviceType: 'construccion',
    sortOrder: 20,
    label: 'Avance de plantación / obra',
    hint: 'Fotos del avance por zonas (mín. 2).',
    clientLabel: 'Avance de obra',
    accept: 'image/*',
    kind: 'photo',
    required: true,
    minFiles: 2,
    paymentPhase: 'plantacion',
    unlockAfter: 'construccion_inicio'
  },
  construccion_instalaciones: {
    id: 'construccion_instalaciones',
    serviceType: 'construccion',
    sortOrder: 30,
    label: 'Instalaciones (riego / iluminación)',
    hint: 'Fotos de instalaciones y, si hay, plano as-built.',
    clientLabel: 'Instalaciones',
    accept: 'image/*,application/pdf',
    kind: 'media',
    required: false,
    minFiles: 1,
    paymentPhase: null,
    unlockAfter: 'construccion_avance'
  },
  construccion_entrega: {
    id: 'construccion_entrega',
    serviceType: 'construccion',
    sortOrder: 40,
    label: 'Entrega final de obra',
    hint: 'Fotos claras del jardín terminado (mín. 3 frentes / zonas).',
    clientLabel: 'Obra entregada',
    accept: 'image/*',
    kind: 'photo',
    required: true,
    minFiles: 3,
    paymentPhase: 'saldo',
    unlockAfter: 'construccion_avance'
  },
  mantencion_informe: {
    id: 'mantencion_informe',
    serviceType: 'mantencion',
    sortOrder: 10,
    label: 'Informe de mantención',
    hint: 'PDF o foto del checklist / informe de la visita.',
    clientLabel: 'Informe de mantención',
    accept: 'application/pdf,image/*',
    kind: 'document',
    required: true,
    minFiles: 1,
    paymentPhase: 'mantencion'
  },
  mantencion_evidencia: {
    id: 'mantencion_evidencia',
    serviceType: 'mantencion',
    sortOrder: 20,
    label: 'Fotos del área mantenida',
    hint: 'Al menos 2 fotos del espacio después de la mantención.',
    clientLabel: 'Evidencia de mantención',
    accept: 'image/*',
    kind: 'photo',
    required: true,
    minFiles: 2,
    paymentPhase: null,
    unlockAfter: 'mantencion_informe'
  }
};

function buildStampLabel({ capturedAt, lat, lng } = {}) {
  const parts = [];
  const when = capturedAt || new Date().toISOString();
  try {
    parts.push(new Date(when).toLocaleString('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short'
    }));
  } catch (_) {
    parts.push(String(when).slice(0, 16));
  }
  const la = Number(lat);
  const ln = Number(lng);
  if (Number.isFinite(la) && Number.isFinite(ln)) {
    parts.push(`${la.toFixed(5)}, ${ln.toFixed(5)}`);
  }
  parts.push('Fandez');
  return parts.join(' · ');
}

function normalizeFileEntry(raw = {}) {
  const url = raw.url || raw.fileUrl || null;
  if (!url) return null;
  return {
    url: String(url).slice(0, 500),
    fileName: String(raw.fileName || '').slice(0, 160) || null,
    mimeType: String(raw.mimeType || '').slice(0, 120) || null,
    uploadedAt: raw.uploadedAt || null,
    capturedAt: raw.capturedAt || raw.uploadedAt || null,
    lat: Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : null,
    lng: Number.isFinite(Number(raw.lng)) ? Number(raw.lng) : null,
    stampLabel: raw.stampLabel || buildStampLabel(raw)
  };
}

function filesFromLegacyItem(item) {
  if (Array.isArray(item?.files) && item.files.length) {
    return item.files.map(normalizeFileEntry).filter(Boolean);
  }
  if (item?.fileUrl) {
    return [normalizeFileEntry({
      url: item.fileUrl,
      fileName: item.fileName,
      mimeType: item.mimeType,
      uploadedAt: item.uploadedAt,
      capturedAt: item.capturedAt,
      lat: item.lat,
      lng: item.lng,
      stampLabel: item.stampLabel
    })].filter(Boolean);
  }
  return [];
}

function itemHasEnoughFiles(item) {
  const min = Math.max(1, Number(item.minFiles) || 1);
  return filesFromLegacyItem(item).length >= min;
}

function buildSlotFromDef(def) {
  return {
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
    minFiles: Math.max(1, Number(def.minFiles) || 1),
    paymentPhase: def.paymentPhase || null,
    unlockAfter: def.unlockAfter || null,
    sortOrder: def.sortOrder || 100,
    status: 'pending',
    partnerStatus: PARTNER_STATUS.none,
    clientStatus: CLIENT_STATUS.none,
    files: [],
    fileUrl: null,
    fileName: null,
    mimeType: null,
    uploadedAt: null,
    uploadedBy: null,
    note: null,
    partnerReviewedAt: null,
    partnerReviewedBy: null,
    partnerNote: null,
    clientReviewedAt: null,
    clientNote: null,
    paymentUnlockedAt: null,
    correctionRound: 0
  };
}

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
    list.push(buildSlotFromDef(def));
  });

  return list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function mergeDeliverablesState(expected, existing) {
  const byId = new Map();
  (Array.isArray(existing) ? existing : []).forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return (Array.isArray(expected) ? expected : []).map((slot) => {
    const prev = byId.get(slot.id);
    if (!prev) return { ...slot };
    const files = filesFromLegacyItem(prev);
    const primary = files[0] || null;
    const hasUpload = files.length > 0;
    let status = prev.status || slot.status;
    if (hasUpload && status === 'pending') status = 'uploaded';
    let clientStatus = prev.clientStatus || CLIENT_STATUS.none;
    let partnerStatus = prev.partnerStatus || PARTNER_STATUS.none;
    if (hasUpload && clientStatus === CLIENT_STATUS.none && status === 'uploaded') {
      clientStatus = CLIENT_STATUS.awaiting;
    }
    return {
      ...slot,
      ...prev,
      id: slot.id,
      label: slot.label,
      hint: slot.hint,
      clientLabel: slot.clientLabel,
      accept: slot.accept,
      kind: slot.kind,
      required: slot.required,
      minFiles: slot.minFiles,
      paymentPhase: slot.paymentPhase,
      unlockAfter: slot.unlockAfter,
      sortOrder: slot.sortOrder,
      serviceTypeLabel: slot.serviceTypeLabel,
      addonLabel: slot.addonLabel,
      status,
      partnerStatus,
      clientStatus,
      files,
      fileUrl: primary?.url || null,
      fileName: primary?.fileName || null,
      mimeType: primary?.mimeType || null,
      uploadedAt: prev.uploadedAt || primary?.uploadedAt || null,
      note: prev.note || null,
      correctionRound: Number(prev.correctionRound) || 0,
      paymentUnlockedAt: prev.paymentUnlockedAt || null
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

function isMilestoneUnlocked(list, item) {
  if (!item.unlockAfter) return true;
  const prev = (list || []).find((d) => d.id === item.unlockAfter);
  if (!prev) return true;
  if (!prev.required) return true;
  return prev.clientStatus === CLIENT_STATUS.accepted;
}

function gardenDeliverablesProgress(list) {
  const items = Array.isArray(list) ? list : [];
  const required = items.filter((d) => d.required);
  const uploaded = required.filter((d) => itemHasEnoughFiles(d));
  const accepted = required.filter((d) => d.clientStatus === CLIENT_STATUS.accepted);
  const awaitingClient = items.filter((d) => d.clientStatus === CLIENT_STATUS.awaiting);
  const needsCorrection = items.filter((d) => d.clientStatus === CLIENT_STATUS.correction);
  const awaitingPartner = items.filter((d) => d.partnerStatus === PARTNER_STATUS.awaiting);
  return {
    total: required.length,
    done: accepted.length,
    uploaded: uploaded.length,
    complete: required.length > 0 && accepted.length === required.length,
    uploadsComplete: required.length > 0 && uploaded.length === required.length,
    missing: required
      .filter((d) => d.clientStatus !== CLIENT_STATUS.accepted)
      .map((d) => d.label),
    missingUploads: required.filter((d) => !itemHasEnoughFiles(d)).map((d) => d.label),
    awaitingClient: awaitingClient.length,
    needsCorrection: needsCorrection.length,
    awaitingPartner: awaitingPartner.length
  };
}

function applyGardenDeliverableUpload(request, {
  deliverableId,
  fileUrl,
  fileName,
  mimeType,
  note,
  uploadedBy,
  lat,
  lng,
  capturedAt,
  requirePartnerReview = false
} = {}) {
  const list = ensureGardenDeliverables(request);
  if (!list || !list.length) {
    return { error: 'Este pedido no tiene entregables de jardinería.' };
  }
  const item = list.find((d) => d.id === deliverableId);
  if (!item) {
    return { error: 'Entregable no corresponde a este servicio.' };
  }
  if (!isMilestoneUnlocked(list, item)) {
    const prev = list.find((d) => d.id === item.unlockAfter);
    return {
      error: `Primero el cliente debe aceptar: ${prev?.label || 'el hito anterior'}.`
    };
  }
  if (!fileUrl) {
    return { error: 'Sube el archivo del entregable.' };
  }

  const now = new Date().toISOString();
  const entry = normalizeFileEntry({
    url: fileUrl,
    fileName,
    mimeType,
    uploadedAt: now,
    capturedAt: capturedAt || now,
    lat,
    lng
  });
  const files = filesFromLegacyItem(item);
  files.push(entry);
  item.files = files;
  item.fileUrl = files[0].url;
  item.fileName = files[0].fileName;
  item.mimeType = files[0].mimeType;
  item.note = note != null ? String(note).trim().slice(0, 280) || null : item.note;
  item.uploadedAt = now;
  item.uploadedBy = uploadedBy || item.uploadedBy || null;
  item.status = 'uploaded';

  const enough = itemHasEnoughFiles(item);
  if (enough) {
    if (requirePartnerReview || item.partnerStatus === PARTNER_STATUS.awaiting) {
      item.partnerStatus = PARTNER_STATUS.awaiting;
      item.clientStatus = CLIENT_STATUS.none;
    } else {
      item.partnerStatus = PARTNER_STATUS.none;
      item.clientStatus = CLIENT_STATUS.awaiting;
    }
  } else if (item.clientStatus !== CLIENT_STATUS.correction) {
    item.clientStatus = CLIENT_STATUS.none;
    item.partnerStatus = PARTNER_STATUS.none;
  }

  return {
    success: true,
    deliverable: item,
    progress: gardenDeliverablesProgress(list),
    awaitingMoreFiles: !enough
  };
}

function partnerReviewDeliverable(request, {
  deliverableId,
  approve,
  note,
  reviewedBy
} = {}) {
  const list = ensureGardenDeliverables(request);
  if (!list?.length) return { error: 'Sin entregables.' };
  const item = list.find((d) => d.id === deliverableId);
  if (!item) return { error: 'Entregable no encontrado.' };
  if (!itemHasEnoughFiles(item)) {
    return { error: 'Aún faltan archivos en este hito.' };
  }
  const now = new Date().toISOString();
  item.partnerReviewedAt = now;
  item.partnerReviewedBy = reviewedBy || null;
  item.partnerNote = String(note || '').trim().slice(0, 280) || null;
  if (approve) {
    item.partnerStatus = PARTNER_STATUS.approved;
    item.clientStatus = CLIENT_STATUS.awaiting;
  } else {
    item.partnerStatus = PARTNER_STATUS.rejected;
    item.clientStatus = CLIENT_STATUS.none;
    item.status = 'pending';
    item.correctionRound = (Number(item.correctionRound) || 0) + 1;
  }
  return { success: true, deliverable: item, progress: gardenDeliverablesProgress(list) };
}

function clientReviewDeliverable(request, {
  deliverableId,
  accept,
  note
} = {}) {
  const list = ensureGardenDeliverables(request);
  if (!list?.length) return { error: 'Sin entregables.' };
  const item = list.find((d) => d.id === deliverableId);
  if (!item) return { error: 'Entregable no encontrado.' };
  if (item.clientStatus === CLIENT_STATUS.accepted) {
    return { error: 'Este hito ya fue aceptado.' };
  }
  if (item.clientStatus === CLIENT_STATUS.correction) {
    return { error: 'Espera a que el técnico vuelva a subir el avance corregido.' };
  }
  if (item.clientStatus !== CLIENT_STATUS.awaiting) {
    return { error: 'Este hito no está pendiente de tu validación.' };
  }
  if (!accept && !String(note || '').trim()) {
    return { error: 'Indica qué debe corregirse.' };
  }
  const now = new Date().toISOString();
  item.clientReviewedAt = now;
  item.clientNote = String(note || '').trim().slice(0, 400) || null;
  if (accept) {
    item.clientStatus = CLIENT_STATUS.accepted;
    if (item.paymentPhase) {
      item.paymentUnlockedAt = now;
      if (!Array.isArray(request.gardenPaymentUnlocks)) request.gardenPaymentUnlocks = [];
      request.gardenPaymentUnlocks.push({
        deliverableId: item.id,
        phase: item.paymentPhase,
        label: item.clientLabel || item.label,
        unlockedAt: now
      });
    }
  } else {
    item.clientStatus = CLIENT_STATUS.correction;
    item.correctionRound = (Number(item.correctionRound) || 0) + 1;
    item.status = 'pending';
  }
  const escalate = !accept && (Number(item.correctionRound) || 0) >= 3;
  return {
    success: true,
    deliverable: item,
    progress: gardenDeliverablesProgress(list),
    paymentUnlocked: Boolean(accept && item.paymentPhase),
    escalate
  };
}

function assertGardenDeliverablesReady(request) {
  if (!request?.gardenIntake) return { ok: true };
  const list = ensureGardenDeliverables(request);
  const progress = gardenDeliverablesProgress(list);
  if (!progress.total) return { ok: true, progress };
  if (!progress.complete) {
    return {
      ok: false,
      error: `Faltan hitos aceptados por el cliente: ${progress.missing.join(', ')}.`,
      progress
    };
  }
  return { ok: true, progress };
}

function serializeGardenDeliverablesForClient(list) {
  return (Array.isArray(list) ? list : []).map((d) => {
    const files = filesFromLegacyItem(d).map((f) => ({
      url: f.url,
      fileName: f.fileName,
      mimeType: f.mimeType,
      stampLabel: f.stampLabel,
      uploadedAt: f.uploadedAt
    }));
    return {
      id: d.id,
      label: d.clientLabel || d.label,
      hint: d.hint,
      serviceTypeLabel: d.serviceTypeLabel || null,
      kind: d.kind,
      required: Boolean(d.required),
      minFiles: d.minFiles || 1,
      status: d.status,
      clientStatus: d.clientStatus || CLIENT_STATUS.none,
      partnerStatus: d.partnerStatus || PARTNER_STATUS.none,
      files,
      fileUrl: files[0]?.url || d.fileUrl || null,
      fileName: files[0]?.fileName || d.fileName || null,
      mimeType: files[0]?.mimeType || d.mimeType || null,
      uploadedAt: d.uploadedAt,
      note: d.note || null,
      clientNote: d.clientNote || null,
      paymentPhase: d.paymentPhase || null,
      paymentUnlockedAt: d.paymentUnlockedAt || null,
      canValidate: d.clientStatus === CLIENT_STATUS.awaiting && files.length > 0
    };
  });
}

function listDeliverablesNeedingClientNudge(request, { olderThanMs = 48 * 60 * 60 * 1000 } = {}) {
  const list = ensureGardenDeliverables(request) || [];
  const now = Date.now();
  return list.filter((d) => {
    if (d.clientStatus !== CLIENT_STATUS.awaiting) return false;
    const t = Date.parse(d.uploadedAt || '') || 0;
    return t && (now - t) >= olderThanMs;
  });
}

function listDeliverablesNeedingTechNudge(request, { olderThanMs = 48 * 60 * 60 * 1000 } = {}) {
  const list = ensureGardenDeliverables(request) || [];
  const now = Date.now();
  const started = Date.parse(request.inProgressAt || request.assignedAt || request.createdAt || '') || 0;
  return list.filter((d) => {
    if (!d.required) return false;
    if (itemHasEnoughFiles(d) && d.clientStatus !== CLIENT_STATUS.correction) return false;
    if (!isMilestoneUnlocked(list, d)) return false;
    if (d.clientStatus === CLIENT_STATUS.correction) {
      const t = Date.parse(d.clientReviewedAt || '') || 0;
      return t && (now - t) >= olderThanMs;
    }
    return started && (now - started) >= olderThanMs;
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildGardenBitacoraDocument(request, { companyName = 'Fandez' } = {}) {
  const list = ensureGardenDeliverables(request) || [];
  const progress = gardenDeliverablesProgress(list);
  const issuedAt = new Date().toLocaleString('es-CL');
  const rows = list.map((d, i) => {
    const files = filesFromLegacyItem(d);
    const st = d.clientStatus === CLIENT_STATUS.accepted
      ? 'Aceptado por cliente'
      : d.clientStatus === CLIENT_STATUS.awaiting
        ? 'Esperando cliente'
        : d.clientStatus === CLIENT_STATUS.correction
          ? 'Corrección pedida'
          : itemHasEnoughFiles(d) ? 'Subido' : 'Pendiente';
    const fileLinks = files.map((f) =>
      `${f.fileName || 'archivo'}${f.stampLabel ? ` (${f.stampLabel})` : ''}`
    ).join('; ') || '—';
    return {
      n: i + 1,
      label: d.label,
      status: st,
      note: d.note || d.clientNote || '',
      files: fileLinks,
      payment: d.paymentUnlockedAt
        ? `Abono ${d.paymentPhase} liberado ${new Date(d.paymentUnlockedAt).toLocaleDateString('es-CL')}`
        : (d.paymentPhase ? `Fase ${d.paymentPhase}` : '')
    };
  });

  const text = [
    `ACTA / BITÁCORA DE PAISAJISMO — ${companyName}`,
    `Pedido ${request.id || ''} · ${request.serviceName || 'Jardinería'}`,
    `Cliente: ${request.clientName || '—'} · Dirección: ${request.address || '—'}`,
    `Emitido: ${issuedAt}`,
    `Progreso: ${progress.done}/${progress.total} hitos aceptados`,
    '',
    ...rows.flatMap((r) => [
      `${r.n}. ${r.label} — ${r.status}`,
      `   Archivos: ${r.files}`,
      r.note ? `   Nota: ${r.note}` : '',
      r.payment ? `   ${r.payment}` : '',
      ''
    ])
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Bitácora paisajismo ${escapeHtml(request.id || '')}</title>
<style>
body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem 2rem;color:#1a1a1a;line-height:1.45;position:relative}
h1{font-size:1.35rem;margin:0 0 .4rem}
.meta{color:#555;font-size:.9rem;margin-bottom:1.2rem}
.item{border:1px solid #e6dfd4;border-radius:10px;padding:12px 14px;margin:0 0 .8rem}
.badge{display:inline-block;font-size:.72rem;font-weight:700;padding:2px 7px;border-radius:999px;background:#f7f3ee}
.stamp{margin-top:1.4rem;padding:10px 12px;border:1px dashed #c45c14;border-radius:8px;font-size:.82rem;color:#5c564c}
.stamp strong{color:#c45c14}
@media print{.noprint{display:none} body::after{content:"Fandez · ${escapeHtml(issuedAt)}";position:fixed;bottom:12px;right:16px;font-size:9pt;color:#999}}
</style></head><body>
<div class="noprint"><a href="#" onclick="window.print();return false;">Imprimir / Guardar PDF</a></div>
<h1>Acta / bitácora de paisajismo</h1>
<p class="meta">${escapeHtml(companyName)}<br>Pedido ${escapeHtml(request.id || '')} · ${escapeHtml(request.serviceName || 'Jardinería')}<br>
Cliente: ${escapeHtml(request.clientName || '—')}<br>${escapeHtml(request.address || '')}<br>
Emitido: ${escapeHtml(issuedAt)} · Hitos aceptados: ${progress.done}/${progress.total}</p>
${rows.map((r) => `<article class="item"><strong>${r.n}. ${escapeHtml(r.label)}</strong>
<span class="badge">${escapeHtml(r.status)}</span>
<p>Archivos: ${escapeHtml(r.files)}</p>
${r.note ? `<p>Nota: ${escapeHtml(r.note)}</p>` : ''}
${r.payment ? `<p>${escapeHtml(r.payment)}</p>` : ''}
</article>`).join('\n')}
<p>Al aceptar los hitos en la plataforma, el cliente declara conformidad con los avances documentados.</p>
<div class="stamp"><strong>Fandez</strong> — documento con marca de fecha/hora y georreferencia en metadatos de cada archivo subido. Emitido ${escapeHtml(issuedAt)}.</div>
</body></html>`;

  return { text, html, progress, rows };
}

module.exports = {
  DELIVERABLE_DEFS,
  CLIENT_STATUS,
  PARTNER_STATUS,
  buildGardenDeliverablesChecklist,
  mergeDeliverablesState,
  ensureGardenDeliverables,
  gardenDeliverablesProgress,
  applyGardenDeliverableUpload,
  partnerReviewDeliverable,
  clientReviewDeliverable,
  assertGardenDeliverablesReady,
  serializeGardenDeliverablesForClient,
  listDeliverablesNeedingClientNudge,
  listDeliverablesNeedingTechNudge,
  buildGardenBitacoraDocument,
  buildStampLabel,
  itemHasEnoughFiles,
  isMilestoneUnlocked,
  filesFromLegacyItem
};

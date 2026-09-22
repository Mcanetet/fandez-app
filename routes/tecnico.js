const express = require('express');
const { dispatchPendingToTechnician, broadcastRequestTaken, buildWorkWallPayload } = require('../lib/dispatch');
const router = express.Router();
const store = require('../models/store');
const { requireRole, requireVerifiedEmail } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { saveRequestFile } = require('../lib/uploads');
const { getTechnicianOnboardingSteps, ATTENTION_CHECKLIST } = require('../lib/onboarding');
const { getDiagnosisChips } = require('../lib/diagnosisChips');
const { serializeFieldJob } = require('../lib/fieldJob');
const { emitRequestUpdateToParties } = require('../lib/realtime');

router.use(requireRole('tecnico'), requireVerifiedEmail);

function getTechLabels(t) {
  return {
    asignado: t('status.tech.asignado'),
    aceptado: t('status.tech.aceptado'),
    en_camino: t('status.tech.en_camino'),
    en_sitio: t('status.tech.en_sitio'),
    diagnostico: t('status.tech.diagnostico_label'),
    reparando: t('status.tech.reparando'),
    comprando: t('status.tech.comprando'),
    materiales_pendiente: t('status.tech.materiales_pendiente'),
    presupuesto_pendiente: t('status.tech.presupuesto_pendiente'),
    presupuesto_aprobado: t('status.tech.presupuesto_aprobado'),
    completado: t('status.tech.completado')
  };
}

function serializeJob(request) {
  return serializeFieldJob(store, request);
}

/** Evita filtrar el código de seguridad al técnico por socket. */
function requestUpdatePayload(request) {
  if (!request) return { request: null };
  const { arrivalCode, ...rest } = request;
  return {
    request: {
      ...rest,
      arrivalCodeRequired: Boolean(arrivalCode && !request.arrivalCodeVerifiedAt),
      arrivalCodeVerified: Boolean(request.arrivalCodeVerifiedAt)
    }
  };
}

function emitRequestUpdate(io, request, extra = {}) {
  if (!io || !request) return;
  const payload = { ...requestUpdatePayload(request), ...extra };
  emitRequestUpdateToParties(io, store, request, payload);
  if (request.clientId && request.arrivalCode) {
    io.to(`aland_client_${request.clientId}`).emit('client_arrival_code', {
      requestId: request.id,
      arrivalCode: request.arrivalCode,
      arrivalCodeVerified: Boolean(request.arrivalCodeVerifiedAt),
      techStatus: request.techStatus
    });
  }
}

router.post('/volver-socio', requireRole('tecnico'), (req, res) => {
  const linked = req.session.linkedProvider;
  if (!linked?.id) {
    return res.status(400).json({ success: false, error: 'No hay panel de socio vinculado.' });
  }
  const provider = store.getUserById(linked.id);
  if (!provider || provider.role !== 'provider') {
    delete req.session.linkedProvider;
    return res.status(400).json({ success: false, error: 'Socio no encontrado.' });
  }
  const self = store.getSelfOperator(provider.id);
  if (!self || self.id !== req.session.user.id) {
    delete req.session.linkedProvider;
    return res.status(403).json({ success: false, error: 'Sesión no válida.' });
  }
  delete req.session.linkedProvider;
  req.session.user = {
    id: provider.id,
    email: provider.email,
    name: provider.name,
    role: 'provider',
    primaryRole: 'provider',
    clientEnabled: Boolean(provider.clientEnabled)
  };
  res.json({ success: true, redirect: '/proveedor' });
});

router.get('/', requireRole('tecnico'), (req, res) => {
  const tecnico = store.getUserById(req.session.user.id);
  if (!tecnico || tecnico.role !== 'tecnico') {
    return res.redirect('/login');
  }
  const socio = tecnico.parentId ? store.getUserById(tecnico.parentId) : null;
  const allJobs = store.getRequestsByTechnician(tecnico.id).filter(Boolean);
  const jobs = allJobs
    .filter(r => r.techStatus !== 'completado' && r.status !== 'completed' && r.status !== 'cancelled')
    .map(serializeJob);
  const { groupRequestsByAgendaDay } = require('../lib/jobAgenda');
  const agenda = groupRequestsByAgendaDay(jobs);
  const completedJobs = allJobs
    .filter(r => r.techStatus === 'completado' || r.status === 'completed')
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0))
    .slice(0, 40)
    .map((r) => {
      const rawSummary = (r.siteReport && r.siteReport.workNotes)
        || (r.siteReport && r.siteReport.diagnosis)
        || r.notes
        || '';
      const summary = String(rawSummary).trim().replace(/\s+/g, ' ').slice(0, 140);
      const completedAt = r.completedAt || r.updatedAt || null;
      let completedAtLabel = '';
      try {
        if (completedAt) {
          completedAtLabel = new Date(completedAt).toLocaleDateString(req.locale === 'en' ? 'en-US' : 'es-CL', {
            day: '2-digit', month: 'short'
          });
        }
      } catch (_) { /* noop */ }
      return {
        id: r.id,
        serviceName: r.serviceName,
        activityName: r.activityName || null,
        address: r.address || '',
        communeName: r.communeName || '',
        summary: summary || null,
        completedAt,
        completedAtLabel
      };
    });

  res.render('tecnico/dashboard', {
    title: 'Fandez — Panel Técnico',
    user: req.session.user,
    tecnico,
    socio,
    dossierCheck: store.canTechnicianOperate(tecnico),
    jobs,
    agenda,
    completedJobs,
    canClaimWall: store.technicianCanClaimAnyWall(tecnico),
    linkedProvider: req.session.linkedProvider || null,
    techLabels: getTechLabels(req.t),
    services: store.SERVICES,
    formatCLP: store.formatCLP,
    showOnboarding: store.needsOnboarding(tecnico),
    onboardingSteps: getTechnicianOnboardingSteps(),
    onboardingCompleteUrl: '/tecnico/onboarding/complete'
  });
});
router.post('/onboarding/complete', requireRole('tecnico'), (req, res) => {
  const user = store.completeOnboarding(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  store.logSecurityEvent('onboarding_complete', req.body?.skipped ? 'skipped' : 'finished', req);
  res.json({ success: true });
});

router.get('/trabajo/:requestId', requireRole('tecnico'), (req, res) => {
  const tecnico = store.getUserById(req.session.user.id);
  const request = store.getRequestForTechnician(req.params.requestId, tecnico.id);
  if (!request || request.techStatus === 'completado' || request.status === 'completed') {
    return res.redirect(req.session.user.role === 'provider' ? '/proveedor/mando' : '/tecnico');
  }

  res.render('tecnico/trabajo', {
    title: 'Visita en terreno — Fandez',
    user: req.session.user,
    tecnico,
    request: serializeJob(request),
    returnUrl: '/tecnico',
    observerMode: false,
    chatApiBase: '/tecnico',
    techLabels: getTechLabels(req.t),
    formatCLP: store.formatCLP,
    attentionChecklist: ATTENTION_CHECKLIST,
    diagnosisChips: getDiagnosisChips(request.serviceId),
    materialsCatalog: store.getMaterialsCatalogForService(request.serviceId),
    materialsIncludedThreshold: store.getMaterialsIncludedThreshold()
  });
});

router.get('/chat/:requestId', requireRole('tecnico'), (req, res) => {
  const result = store.getRequestChat(req.params.requestId, req.session.user);
  if (result.error) return res.status(result.error === 'No autorizado' ? 403 : 404).json(result);
  res.json(result);
});

router.post('/chat/:requestId', requireRole('tecnico'), (req, res) => {
  let photoUrl = null;
  const photoData = req.body?.photo || req.body?.image || null;
  if (photoData) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'chat', photoData);
    } catch (_) {
      return res.status(400).json({ error: 'No se pudo guardar la foto.' });
    }
  }
  const result = store.postRequestChatMessage(
    req.params.requestId,
    req.session.user,
    req.body?.body || req.body?.message,
    { photoUrl }
  );
  if (result.error) return res.status(400).json(result);
  const io = req.app.get('io');
  io.emit(`request_chat_${result.requestId}`, { message: result.message });
  emitRequestUpdateToParties(io, store, store.requests.find((r) => r.id === result.requestId), {
    request: store.requests.find((r) => r.id === result.requestId),
    chatMessage: result.message
  });
  res.json(result);
});

router.get('/muro', requireRole('tecnico'), (req, res) => {
  res.json({ success: true, items: buildWorkWallPayload(req.session.user.id) });
});

router.post('/toggle-online', requireRole('tecnico'), (req, res) => {
  const online = req.body.online === 'true' || req.body.online === true;
  const tecnico = store.setTechnicianOnline(req.session.user.id, online);
  if (!tecnico) {
    const check = store.canTechnicianOperate(store.getUserById(req.session.user.id));
    return res.status(400).json({
      success: false,
      error: `Tu expediente está incompleto: ${check.missing.join(', ')}. Sube tu carnet aquí; el socio debe cargar el certificado de antecedentes.`
    });
  }

  let synced = 0;
  if (online) {
    synced = dispatchPendingToTechnician(req.app.get('io'), req.session.user.id);
  }

  res.json({ success: true, online, synced });
});

router.post('/documentos', requireRole('tecnico'), (req, res) => {
  const type = String(req.body.type || '');
  if (!['idCardFront', 'idCardBack'].includes(type) || !req.body.data) {
    return res.status(400).json({
      success: false,
      error: 'Solo puedes subir el carnet (frente y reverso).'
    });
  }
  try {
    const { saveTechnicianDocumentFile } = require('../lib/uploads');
    const url = saveTechnicianDocumentFile(req.session.user.id, type, req.body.data);
    const result = store.saveTechnicianOwnDocument(req.session.user.id, type, url);
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    store.logSecurityEvent('tecnico_carnet', `${req.session.user.id}:${type}`, req);
    res.json({ success: true, check: result.check });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'No se pudo guardar.' });
  }
});

router.post('/accept/:requestId', requireRole('tecnico'), (req, res) => {
  const result = store.tryAcceptRequest(req.params.requestId, req.session.user.id, {
    etaMinutesMin: req.body?.etaMinutesMin,
    etaMinutesMax: req.body?.etaMinutesMax,
    lat: req.body?.lat,
    lng: req.body?.lng
  });
  if (result.error) {
    return res.status(result.code === 'taken' ? 409 : 400).json({ success: false, error: result.error });
  }

  const request = result.request;
  const socio = store.getUserById(request.providerId);
  const io = req.app.get('io');
  broadcastRequestTaken(io, request.id, req.session.user.id);
  const payload = {
    request,
    provider: store.getPublicProviderProfile(socio),
    chatMessage: result.chatMessage || null
  };
  emitRequestUpdateToParties(io, store, request, payload);
  io.to(store.technicianSockets.get(req.session.user.id) || '').emit(`tecnico_assignment_${req.session.user.id}`, { request: serializeJob(request) });

  if (request.liveEtaMinutes != null && request.coords) {
    const loc = store.resolveActorCoords(req.session.user.id, req.body?.lat, req.body?.lng);
    if (loc) {
      io.to(`request_${request.id}`).emit(`provider_location_${request.id}`, {
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: new Date().toISOString(),
        etaMinutes: request.liveEtaMinutes,
        distanceKm: request.etaDistanceKm || null
      });
    }
  }

  res.json({ success: true, request: serializeJob(request), chatMessage: result.chatMessage || null });
});

router.post('/trabajo/:requestId/eta', requireRole('tecnico'), (req, res) => {
  const result = store.setTechnicianEta(req.params.requestId, req.session.user.id, {
    etaMinutesMin: req.body?.etaMinutesMin,
    etaMinutesMax: req.body?.etaMinutesMax,
    lat: req.body?.lat,
    lng: req.body?.lng
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  const payload = { request: result.request, chatMessage: result.chatMessage || null };
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, payload);
  if (result.request.liveEtaMinutes != null) {
    const loc = store.resolveActorCoords(req.session.user.id, req.body?.lat, req.body?.lng);
    if (loc) {
      req.app.get('io').to(`request_${result.request.id}`).emit(`provider_location_${result.request.id}`, {
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: new Date().toISOString(),
        etaMinutes: result.request.liveEtaMinutes,
        distanceKm: result.request.etaDistanceKm || null
      });
    }
  }
  res.json({ success: true, request: serializeJob(result.request), chatMessage: result.chatMessage || null });
});

router.post('/status/:requestId', requireRole('tecnico'), (req, res) => {
  const { techStatus, lat, lng } = req.body;
  const valid = ['aceptado', 'en_camino', 'en_sitio'];
  if (!valid.includes(techStatus)) return res.status(400).json({ success: false, error: 'Estado inválido' });

  const request = store.updateTechStatus(req.params.requestId, req.session.user.id, techStatus, { lat, lng });
  if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  if (request.error) return res.status(400).json({ success: false, error: request.error });

  const io = req.app.get('io');
  emitRequestUpdate(io, request);
  if (request.liveEtaMinutes != null) {
    const loc = store.resolveActorCoords(req.session.user.id, lat, lng);
    if (loc) {
      io.to(`request_${request.id}`).emit(`provider_location_${request.id}`, {
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: new Date().toISOString(),
        etaMinutes: request.liveEtaMinutes,
        distanceKm: request.etaDistanceKm || null
      });
    }
  }

  res.json({ success: true, request: { id: request.id, status: request.status, techStatus: request.techStatus, etaLabel: request.etaLabel, liveEtaMinutes: request.liveEtaMinutes || null } });
});

router.post('/trabajo/:requestId/confirmar-servicio', requireRole('tecnico'), (req, res) => {
  const result = store.confirmServiceSame(req.params.requestId, req.session.user.id);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.post('/trabajo/:requestId/codigo-llegada', requireRole('tecnico'), (req, res) => {
  const result = store.verifyArrivalCode(req.params.requestId, req.session.user.id, req.body.code || req.body.arrivalCode);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdate(req.app.get('io'), result.request);
  res.json({
    success: true,
    already: Boolean(result.already),
    request: serializeJob(result.request)
  });
});

router.post('/trabajo/:requestId/llegada', requireRole('tecnico'), (req, res) => {
  const { diagnosis, photoStart, arrivalCode, code } = req.body;
  let photoUrl = null;
  if (photoStart) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'inicio', photoStart);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto inicial' });
    }
  }
  const result = store.recordSiteArrival(req.params.requestId, req.session.user.id, {
    diagnosis,
    photoStart: photoUrl,
    arrivalCode: arrivalCode || code
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  emitRequestUpdate(req.app.get('io'), result.request);
  res.json({ success: true, request: serializeJob(result.request) });
});

router.post('/trabajo/:requestId/accion', requireRole('tecnico'), (req, res) => {
  const result = store.setSiteAction(req.params.requestId, req.session.user.id, req.body.action);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.post('/trabajo/:requestId/materiales-compra', requireRole('tecnico'), (req, res) => {
  const result = store.submitMaterialsPurchase(req.params.requestId, req.session.user.id, {
    estimatedAmount: req.body.estimatedAmount,
    description: req.body.description,
    catalogItems: req.body.catalogItems || req.body.materialsPreview
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({
    success: true,
    included: Boolean(result.included),
    materialsPurchase: result.materialsPurchase,
    request: serializeJob(result.request)
  });
});

router.post('/trabajo/:requestId/presupuesto', requireRole('tecnico'), (req, res) => {
  const result = store.submitSiteBudget(req.params.requestId, req.session.user.id, req.body);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request) });
});

router.get('/trabajo/:requestId/subservicios', requireRole('tecnico'), (req, res) => {
  const job = store.getRequestForTechnician(req.params.requestId, req.session.user.id);
  if (!job) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  const activities = store.getActivitiesForService(job.serviceId);
  const cleaning = job.serviceId === 'limpieza';
  res.json({
    success: true,
    currentActivityId: job.activityId || null,
    cleaning,
    squareMeters: job.squareMeters || null,
    cleaningFactors: job.cleaningFactors || null,
    activities: activities.map((a) => {
      const perM2 = Boolean(a.pricePerM2) || a.pricingUnit === 'm2' || cleaning;
      const rate = a.pricePerM2 || (perM2 ? a.basePrice : null);
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        basePrice: a.basePrice,
        pricePerM2: rate || null,
        pricingUnit: perM2 ? 'm2' : 'job',
        minM2: a.minM2 || (cleaning ? 20 : null),
        basePriceLabel: perM2
          ? `${store.formatCLP(rate || a.basePrice)} / m²`
          : store.formatCLP(a.basePrice)
      };
    })
  });
});

router.post('/trabajo/:requestId/cambio-servicio', requireRole('tecnico'), (req, res) => {
  let photoUrl = null;
  if (req.body.photo) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'cambio', req.body.photo);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto del cambio' });
    }
  }
  const result = store.proposeActivityChange(req.params.requestId, req.session.user.id, {
    activityId: req.body.activityId,
    photoUrl,
    notes: req.body.notes,
    customName: req.body.customName,
    customBasePrice: req.body.customBasePrice,
    lineItems: req.body.lineItems,
    materialsPreview: req.body.materialsPreview || req.body.catalogItems,
    squareMeters: req.body.squareMeters,
    cleaningFactors: req.body.cleaningFactors
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({ success: true, request: serializeJob(result.request), activityChange: result.activityChange });
});

router.get('/trabajo/:requestId/materiales-catalogo', requireRole('tecnico'), (req, res) => {
  const request = store.getRequestForTechnician(req.params.requestId, req.session.user.id);
  if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  res.json({
    success: true,
    materials: store.getMaterialsCatalogForService(request.serviceId),
    formatHint: 'Precios de mercado Fandez · se cobran al cliente a costo'
  });
});

router.post('/trabajo/:requestId/material', requireRole('tecnico'), async (req, res) => {
  const source = String(req.body.source || 'purchased').toLowerCase() === 'stock' ? 'stock' : 'purchased';
  const catalogId = req.body.catalogId || null;
  let receiptUrl = null;
  if (req.body.receipt) {
    try {
      receiptUrl = saveRequestFile(req.params.requestId, 'boleta', req.body.receipt);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la boleta' });
    }
  }

  const requestPreview = store.getRequestForTechnician(req.params.requestId, req.session.user.id);
  let review = null;
  if (source === 'purchased') {
    try {
      const { reviewMaterialReceipt } = require('../lib/materials/receiptReview');
      review = await reviewMaterialReceipt({
        description: req.body.description,
        amount: req.body.amount,
        receiptUrl,
        serviceName: requestPreview?.serviceName,
        activityName: requestPreview?.activityName,
        pricing: store.getPricingConfig()
      });
    } catch (err) {
      review = {
        status: 'pending_manual',
        approved: null,
        confidence: null,
        reason: err.message || 'No se pudo revisar la boleta',
        reviewedAt: new Date().toISOString()
      };
    }
  }

  const result = store.addSiteMaterial(req.params.requestId, req.session.user.id, {
    description: req.body.description,
    amount: req.body.amount,
    receiptUrl,
    review,
    catalogId,
    source,
    quantity: req.body.quantity
  });
  if (result.error) {
    return res.status(400).json({ success: false, error: result.error, review: result.review || review });
  }
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  res.json({
    success: true,
    material: result.material,
    materials: result.request.siteReport.materials,
    review: result.material?.reviewStatus ? {
      status: result.material.reviewStatus,
      reason: result.material.reviewReason
    } : review
  });
});

router.post('/trabajo/:requestId/entregables', requireRole('tecnico'), (req, res) => {
  let fileUrl = null;
  if (req.body.file) {
    try {
      fileUrl = saveRequestFile(req.params.requestId, 'entregable', req.body.file);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'No se pudo guardar el entregable'
      });
    }
  }
  const result = store.saveGardenDeliverable(req.params.requestId, req.session.user.id, {
    deliverableId: req.body.deliverableId,
    fileUrl,
    fileName: req.body.fileName,
    mimeType: req.body.mimeType,
    note: req.body.note
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  try {
    const progress = result.progress;
    const { notifyClientJourney } = require('../lib/aland/journey');
    notifyClientJourney(result.request, {
      type: 'garden_deliverable',
      force: true,
      label: result.deliverable?.label,
      progress: progress?.total
        ? `${progress.done}/${progress.total}`
        : undefined
    }).catch(() => {});
  } catch (_) { /* journey opcional */ }
  res.json({
    success: true,
    deliverable: result.deliverable,
    progress: result.progress,
    gardenDeliverables: result.gardenDeliverables,
    request: serializeJob(result.request)
  });
});

router.post('/trabajo/:requestId/completar', requireRole('tecnico'), (req, res) => {
  let photoUrl = null;
  if (req.body.photoEnd) {
    try {
      photoUrl = saveRequestFile(req.params.requestId, 'fin', req.body.photoEnd);
    } catch (err) {
      return res.status(400).json({ success: false, error: 'No se pudo guardar la foto final' });
    }
  }
  const result = store.completeSiteWork(req.params.requestId, req.session.user.id, {
    workNotes: req.body.workNotes,
    photoEnd: photoUrl,
    attentionChecklist: req.body.attentionChecklist
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  emitRequestUpdateToParties(req.app.get('io'), store, result.request, { request: result.request });
  const enriched = store.enrichRequestForProvider(result.request);
  res.json({
    success: true,
    request: serializeJob(result.request),
    settlement: enriched.financialsVisible,
    additionalCharge: result.additionalCharge || null
  });
});

router.post('/ubicacion', requireRole('tecnico'), requireModule('provider_ubicacion'), (req, res) => {
  const { lat, lng, requestId } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ success: false, error: 'Coordenadas requeridas' });

  const loc = store.updateTechnicianLocation(req.session.user.id, lat, lng);
  if (!loc) return res.status(403).json({ success: false, error: 'No se pudo actualizar la ubicación' });

  let eta = null;
  if (requestId) {
    const request = store.requests.find(r => r.id === requestId);
    if (request && request.technicianId === req.session.user.id) {
      if (request.coords) {
        eta = store.applyDrivingEtaToRequest(request, loc.lat, loc.lng);
        if (eta.error) {
          eta = store.computeEtaMinutes(loc.lat, loc.lng, request.coords.lat, request.coords.lng);
        } else {
          eta = eta.drive;
        }
      }
      const io = req.app.get('io');
      io.to(`request_${requestId}`).emit(`provider_location_${requestId}`, {
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: loc.updatedAt,
        etaMinutes: eta ? eta.etaMinutes : null,
        distanceKm: eta ? eta.distanceKm : null
      });
      if (eta?.etaMinutes != null) {
        emitRequestUpdateToParties(io, store, store.requests.find((r) => r.id === requestId), { request });
      }
    }
  }

  res.json({ success: true, location: loc, eta });
});

router.post('/trabajo/:requestId/seguridad', requireRole('tecnico'), (req, res) => {
  try {
    const company = require('../config/company');
    const notifications = require('../lib/notifications');
    const categoryId = req.body?.categoryId || 'unsafe_feeling';
    const channel = req.body?.channel === 'sos' ? 'sos' : 'report';
    const notes = req.body?.notes || '';
    const result = store.createSafetyIncident({
      requestId: req.params.requestId,
      reporterId: req.session.user.id,
      reporterRole: 'tecnico',
      categoryId,
      channel,
      notes,
      endVisit: Boolean(req.body?.endVisit)
    });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    const io = req.app.get('io');
    const c = result.complaint;
    if (io) {
      io.to('aland_admin').emit('aland_security_alert', {
        type: 'safety_incident',
        complaintId: c.id,
        requestId: c.requestId,
        categoryId: c.categoryId,
        severity: c.severity,
        channel: c.channel,
        subject: c.subject,
        reporterRole: 'tecnico',
        at: c.createdAt
      });
      if (result.request) {
        emitRequestUpdateToParties(io, store, result.request, {
          request: result.request,
          safetyAlert: true
        });
      }
    }
    notifications.notify({
      event: 'safety.incident',
      to: company.supportEmail,
      subject: `Alerta seguridad técnico — ${c.subject}`,
      text: c.description,
      requestId: c.requestId,
      userId: req.session.user.id
    }).catch(() => {});
    try {
      require('../lib/agents/founderAlerts').alertSafetyIncident(c).catch(() => {});
    } catch (_) { /* ignore */ }
    return res.json({
      success: true,
      complaintId: c.id,
      severity: result.category.severity,
      emergency: { carabineros: '133', bomberos: '132', samu: '131' },
      message: 'Alerta registrada. Si hay riesgo inmediato llama al 133. Puedes retirarte del domicilio.'
    });
  } catch (err) {
    console.error('[seguridad tecnico]', err.message);
    return res.status(500).json({ success: false, error: 'No se pudo registrar la alerta.' });
  }
});

module.exports = router;

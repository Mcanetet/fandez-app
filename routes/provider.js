const express = require('express');
const router = express.Router();
const store = require('../models/store');
const { emitRequestUpdateToParties } = require('../lib/realtime');
const { dispatchPendingToProvider, broadcastRequestTaken, buildWorkWallPayload } = require('../lib/dispatch');
const { requireRole, requireVerifiedEmail } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { saveProviderFile, saveProviderInvoice, saveTechnicianDocumentFile, toServingUrl } = require('../lib/uploads');
const { verifySelfie } = require('../lib/faceVerify');
const { getProviderOnboardingSteps, getProviderActivationSteps } = require('../lib/onboarding');
const { getClientIp } = require('../middleware/security');
const {
  ENTITY_TYPES,
  DOCUMENT_CATALOG,
  BANK_ACCOUNT_TYPES,
  LEGAL_DECLARATIONS,
  CONTRACT_CLAUSES,
  TEMPLATE_VERSION,
  getDocumentsForEntity,
  getContractSummary
} = require('../lib/contracts');
const company = require('../config/company');
const { reviewIdentityDocument } = require('../lib/documentReview');

async function runKycAi(providerId, type, url) {
  const ai = await reviewIdentityDocument({ url, docKey: type });
  store.setVerificationDocReview(providerId, type, { ai });
  if (type === 'idFront') {
    store.runRepresentativeMatchValidation(providerId).catch((err) => {
      console.error('Rep match KYC:', err.message);
    });
  }
  return ai;
}

async function runContractAi(providerId, docKey, url) {
  const ai = await reviewIdentityDocument({ url, docKey });
  store.setContractDocumentAiReview(providerId, docKey, ai);
  if (docKey === 'incorporation_deed' || docKey === 'rep_id_front') {
    store.runRepresentativeMatchValidation(providerId).catch((err) => {
      console.error('Rep match contrato:', err.message);
    });
  }
  if (docKey === 'company_rut') {
    store.runErutValidation(providerId).catch((err) => {
      console.error('e-RUT validation:', err.message);
    });
  }
  return ai;
}

async function ensureProviderAiReviews(providerId) {
  const provider = store.getUserById(providerId);
  if (!provider) return;
  const tasks = [];
  const v = provider.verification || {};
  if (v.idCardFront && v.idCardFront !== 'demo' && (!v.reviews?.idFront?.ai || v.reviews.idFront.ai.status === 'pending')) {
    tasks.push(runKycAi(providerId, 'idFront', v.idCardFront));
  }
  if (v.idCardBack && v.idCardBack !== 'demo' && (!v.reviews?.idBack?.ai || v.reviews.idBack.ai.status === 'pending')) {
    tasks.push(runKycAi(providerId, 'idBack', v.idCardBack));
  }
  if (v.selfie && v.selfie !== 'demo' && (!v.reviews?.selfie?.ai || v.reviews.selfie.ai.status === 'pending')) {
    tasks.push(runKycAi(providerId, 'selfie', v.selfie));
  }
  const contract = provider.providerContract || {};
  Object.entries(contract.documents || {}).forEach(([key, doc]) => {
    if (doc?.url && (!doc.ai || doc.ai.status === 'pending')) {
      tasks.push(runContractAi(providerId, key, doc.url));
    }
  });
  (contract.technicalCerts || []).forEach((cert, idx) => {
    if (cert?.url && (!cert.ai || cert.ai.status === 'pending')) {
      tasks.push(runContractAi(providerId, `technical_certs:${idx}`, cert.url));
    }
  });
  if (tasks.length) await Promise.all(tasks);
}

const { CONSENT_DEFINITIONS, POLICY_VERSION } = require('../lib/consent-policy');
const { serializeFieldJob } = require('../lib/fieldJob');
const { ATTENTION_CHECKLIST } = require('../lib/onboarding');
const { getDiagnosisChips } = require('../lib/diagnosisChips');

function equipoViewLocals(req, provider, extra = {}) {
  const onlineGate = store.canProviderGoOnline(provider);
  const hasServices = Array.isArray(provider.specialties) && provider.specialties.length > 0;
  return {
    title: 'Mi equipo — Fandez',
    user: req.session.user,
    provider,
    technicians: store.getTechniciansByProvider(provider.id).map((tecnico) => {
      const v = tecnico.verification || {};
      const hasDoc = (val) => Boolean(val && val !== 'self-operator-via-provider' && val !== 'self-operator');
      return {
        ...tecnico,
        displayEmail: tecnico.isSelfOperator ? provider.email : tecnico.email,
        emailVerified: tecnico.isSelfOperator
          ? store.isEmailVerified(provider)
          : store.isEmailVerified(tecnico),
        dossierCheck: store.canTechnicianOperate(tecnico),
        canClaimWall: store.technicianCanClaimWallForProvider(tecnico, provider.id),
        docs: {
          idCardFront: hasDoc(v.idCardFront),
          idCardBack: hasDoc(v.idCardBack),
          criminalRecord: hasDoc(v.criminalRecord)
        }
      };
    }),
    selfOperator: store.getSelfOperator(provider.id),
    // Se puede agregar como técnico con servicios activos; pedidos exigen KYC+contrato.
    canEnableSelf: hasServices,
    selfReady: onlineGate.ok,
    selfGateMissing: onlineGate.missing || [],
    services: store.SERVICES,
    serviceStatus: store.getProviderServicesStatus(provider.id),
    error: null,
    ok: null,
    ...extra
  };
}

router.use(requireRole('provider'), requireVerifiedEmail);

router.get('/mensajes', requireRole('provider'), requireModule('provider_mensajes'), (req, res) => {
  res.render('provider/mensajes', {
    title: 'Mensajes — Fandez',
    user: req.session.user,
    providerId: req.session.user.id
  });
});

router.get('/', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  store.getProviderServicesStatus(provider.id);
  const myRequests = store.getRequestsByProvider(req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(r => store.enrichRequestForProvider(r, req.locale));
  const activeJobs = store.getActiveRequestsForProvider(req.session.user.id, req.locale);
  const pending = store.getPendingRequestsForProvider(req.session.user.id);
  const verificationCheck = store.canProviderGoOnline(provider);
  const contractSummary = getContractSummary(provider.providerContract);
  const providerStats = store.getProviderDashboardStats(req.session.user.id);

  res.render('provider/dashboard', {
    title: 'Fandez — Panel Proveedor',
    user: req.session.user,
    provider,
    verificationCheck,
    contractSummary,
    showContractBanner: !contractSummary.canOperate,
    services: store.SERVICES,
    myRequests,
    activeJobs,
    providerStats,
    workflowStep: store.getProviderWorkflowStep(req.session.user.id),
    pendingCount: pending.length,
    formatCLP: store.formatCLP,
    showOnboarding: store.needsOnboarding(provider),
    onboardingSteps: getProviderOnboardingSteps({
      hasVerificationBanner: !verificationCheck.ok,
      t: req.t
    }),
    activationSteps: getProviderActivationSteps(provider, verificationCheck, contractSummary, store),
    canGoOnline: verificationCheck.ok && contractSummary.canOperate,
    onboardingCompleteUrl: '/proveedor/onboarding/complete'
  });
});

router.get('/finanzas', requireRole('provider'), (req, res) => {
  const finance = store.getProviderFinanceLedger(req.session.user.id, { limit: 80 });
  res.render('provider/finanzas', {
    title: 'Finanzas — Fandez',
    user: req.session.user,
    finance,
    formatCLP: store.formatCLP
  });
});

router.post('/onboarding/complete', requireRole('provider'), (req, res) => {
  const user = store.completeOnboarding(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  store.logSecurityEvent('onboarding_complete', req.body.skipped ? 'skipped' : 'finished', req);
  res.json({ success: true });
});

router.get('/pendientes', requireRole('provider'), (req, res) => {
  const items = buildWorkWallPayload(req.session.user.id);
  res.json({
    success: true,
    items,
    pending: items[0] || null
  });
});

router.get('/muro', requireRole('provider'), (req, res) => {
  if (typeof store.promoteDueScheduledSearches === 'function') {
    const promoted = store.promoteDueScheduledSearches();
    const io = req.app.get('io');
    if (io && promoted.length) {
      const { notifyProvidersForRequest } = require('../lib/dispatch');
      promoted.forEach((request) => notifyProvidersForRequest(io, request));
    }
  }
  res.json({ success: true, items: buildWorkWallPayload(req.session.user.id) });
});

router.post('/muro/dismiss/:requestId', requireRole('provider'), requireModule('provider_aceptar'), (req, res) => {
  const result = store.dismissWorkWallItem(req.session.user.id, req.params.requestId, req.body?.reason);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true });
});

router.post('/toggle-online', requireRole('provider'), requireModule('provider_online'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const online = req.body.online === 'true' || req.body.online === true;

  if (online) {
    const check = store.canProviderGoOnline(provider);
    if (!check.ok) {
      return res.status(400).json({
        success: false,
        error: 'Debes completar tu verificación antes de ponerte en línea',
        missing: check.missing,
        redirect: '/proveedor/perfil#verificacion'
      });
    }
  }

  store.setProviderOnline(provider.id, online);

  let dispatched = 0;
  if (online) {
    dispatched = dispatchPendingToProvider(req.app.get('io'), provider.id);
  }

  res.json({ success: true, online, dispatched });
});

router.post('/accept/:requestId', requireRole('provider'), requireModule('provider_aceptar'), (req, res) => {
  const result = store.tryAcceptRequest(req.params.requestId, req.session.user.id, {
    technicianId: req.body?.technicianId,
    lat: req.body?.lat,
    lng: req.body?.lng
  });
  if (result.error) {
    return res.status(result.code === 'taken' ? 409 : 400).json({ error: result.error, success: false });
  }

  const request = result.request;
  const provider = store.getUserById(req.session.user.id);
  const io = req.app.get('io');
  const publicProvider = store.getPublicProviderProfile(provider);

  broadcastRequestTaken(io, request.id, provider.id);
  const payload = {
    request: store.requests.find(r => r.id === request.id),
    provider: publicProvider,
    chatMessage: result.chatMessage || null
  };
  emitRequestUpdateToParties(io, store, request, payload);
  if (request.technicianId) {
    io.emit(`tecnico_assignment_${request.technicianId}`, { requestId: request.id, request: store.enrichRequestForProvider?.(request) || request });
  }
  const providerSocket = store.providerSockets.get(provider.id);
  if (providerSocket) {
    io.to(providerSocket).emit('provider_job_update', payload);
  }

  res.json({
    success: true,
    request: store.enrichRequestForProvider(request, req.locale),
    selfOperator: Boolean(result.selfOperator),
    technicianId: request.technicianId
  });
});

router.get('/tecnicos-elegibles', requireRole('provider'), (req, res) => {
  const serviceId = req.query.serviceId || null;
  const techs = store.getEligibleTechniciansForProvider(req.session.user.id, serviceId);
  res.json({ success: true, technicians: techs });
});

router.post('/desertar/:requestId', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
  const result = store.providerDesertRequest(req.params.requestId, req.session.user.id);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  const io = req.app.get('io');
  const enriched = store.enrichRequestForClient(result.request, req.locale || 'es');
  try {
    const { notifyProvidersForRequest } = require('../lib/dispatch');
    notifyProvidersForRequest(io, result.request);
  } catch (_) { /* ignore */ }

  emitRequestUpdateToParties(io, store, result.request, {
    request: enriched,
    providerReleased: true,
    searching: true
  });
  io.to(`aland_client_${result.request.clientId}`).emit('client_open_request_alert', {
    type: 'provider_deserted',
    urgency: 'high',
    title: 'Seguimos buscando un equipo',
    body: `El socio liberó tu pedido de ${result.request.serviceName}. La app continúa buscando.`,
    url: `/cliente/servicio/${result.request.serviceId}?tracking=${result.request.id}`,
    request: enriched
  });

  res.json({ success: true, request: enriched });
});

router.post('/status/:requestId', requireRole('provider'), (req, res) => {
  const { status } = req.body;
  const existing = store.requests.find(r => r.id === req.params.requestId);
  if (!existing || existing.providerId !== req.session.user.id) {
    return res.status(404).json({ error: 'Solicitud no encontrada' });
  }
  const allowed = ['in_progress'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'El cierre debe realizarse desde el flujo de trabajo con fotos y resumen.' });
  }
  const request = store.updateRequestStatus(req.params.requestId, status);
  if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const io = req.app.get('io');
  emitRequestUpdateToParties(io, store, request, { request });

  res.json({ success: true, request: store.enrichRequestForProvider(request, req.locale) });
});

router.get('/perfil', requireRole('provider'), requireModule('provider_perfil'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const verificationCheck = store.canProviderGoOnline(provider);
  const hasKycConsent = store.getUserConsentStatus(req.session.user.id).some(
    (c) => c.type === 'datos_sensibles_kyc' && c.granted
  );
  res.render('provider/profile', {
    title: 'Mi perfil — Fandez',
    user: req.session.user,
    provider,
    verificationCheck,
    hasKycConsent,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.post('/perfil', requireRole('provider'), requireModule('provider_perfil'), (req, res) => {
  const user = store.updateUserProfile(req.session.user.id, req.body);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  req.session.user.name = user.name;
  res.json({
    success: true,
    user: { name: user.name, phone: user.phone, email: user.email, bio: user.bio, avatar: user.avatar }
  });
});

router.post('/modo-cliente', requireRole('provider'), (req, res) => {
  const enabled = store.enableClientPortal(req.session.user.id);
  if (enabled.error) return res.status(400).json({ error: enabled.error });
  const user = enabled.user;
  if (user.online) store.setProviderOnline(user.id, false);
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'client',
    primaryRole: 'provider',
    clientEnabled: true
  };
  store.logSecurityEvent('provider_switch_client', user.email, req);
  res.json({ success: true, redirect: '/cliente' });
});

router.post('/verificacion/documento', requireRole('provider'), requireModule('provider_verificacion'), async (req, res) => {
  const { type, data, label, consent_kyc } = req.body;
  const valid = ['idFront', 'idBack', 'certificate'];
  if (!valid.includes(type) || !data) {
    return res.status(400).json({ error: 'Tipo de documento o archivo inválido' });
  }

  if (['idFront', 'idBack'].includes(type)) {
    const hasKyc = store.getUserConsentStatus(req.session.user.id).some(
      (c) => c.type === 'datos_sensibles_kyc' && c.granted
    );
    if (!hasKyc && consent_kyc !== true && consent_kyc !== 'true') {
      return res.status(400).json({
        error: 'Debes autorizar el tratamiento de datos sensibles (KYC) según la Ley 21.719.'
      });
    }
    if (!hasKyc) {
      store.recordConsent({
        userId: req.session.user.id,
        ip: getClientIp(req),
        type: 'datos_sensibles_kyc',
        granted: true,
        version: POLICY_VERSION,
        userAgent: req.get('user-agent'),
        source: 'verificacion_kyc'
      });
    }
  }

  try {
    const url = saveProviderFile(req.session.user.id, type, data);
    let verification = store.saveProviderDocument(req.session.user.id, type, url, label);
    const servingUrl = toServingUrl(url) || url;
    // Responder altiro; la IA corre en segundo plano (más expedito para el socio)
    if (type === 'idFront' || type === 'idBack') {
      setImmediate(() => {
        runKycAi(req.session.user.id, type, url).catch((err) => {
          console.error('IA KYC async:', err.message);
        });
      });
    }
    res.json({
      success: true,
      url: servingUrl,
      verification,
      ai: { status: 'pending', reason: 'Revisión IA en curso…' }
    });
  } catch (err) {
    console.error('Error subiendo documento:', err.message);
    res.status(400).json({ error: err.message || 'No se pudo guardar el documento' });
  }
});

router.post('/verificacion/selfie', requireRole('provider'), requireModule('provider_verificacion'), async (req, res) => {
  const { data, consent_kyc } = req.body;
  if (!data) return res.status(400).json({ error: 'Imagen requerida' });

  const hasKyc = store.getUserConsentStatus(req.session.user.id).some(
    (c) => c.type === 'datos_sensibles_kyc' && c.granted
  );
  if (!hasKyc && consent_kyc !== true && consent_kyc !== 'true') {
    return res.status(400).json({
      error: 'Debes autorizar el tratamiento de datos sensibles (KYC) según la Ley 21.719.'
    });
  }
  if (!hasKyc) {
    store.recordConsent({
      userId: req.session.user.id,
      ip: getClientIp(req),
      type: 'datos_sensibles_kyc',
      granted: true,
      version: POLICY_VERSION,
      userAgent: req.get('user-agent'),
      source: 'verificacion_kyc'
    });
  }

  const faceResult = verifySelfie(data);
  if (!faceResult.success) {
    return res.status(400).json(faceResult);
  }

  try {
    const url = saveProviderFile(req.session.user.id, 'selfie', data);
    let verification = store.saveProviderSelfie(req.session.user.id, url, faceResult);
    const servingUrl = toServingUrl(url) || url;
    setImmediate(() => {
      runKycAi(req.session.user.id, 'selfie', url).catch((err) => {
        console.error('IA selfie async:', err.message);
      });
    });
    res.json({
      success: true,
      url: servingUrl,
      verification,
      faceResult,
      ai: { status: 'pending', reason: 'Revisión IA en curso…' }
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar la selfie' });
  }
});

router.post('/verificacion/ubicacion', requireRole('provider'), requireModule('provider_verificacion'), (req, res) => {
  const consent = req.body.consent === true || req.body.consent === 'true';
  const locationShare = store.setLocationConsent(req.session.user.id, consent);

  if (consent) {
    store.recordConsent({
      userId: req.session.user.id,
      ip: getClientIp(req),
      type: 'geolocalizacion',
      granted: true,
      version: POLICY_VERSION,
      userAgent: req.get('user-agent'),
      source: 'verificacion_ubicacion'
    });
  } else {
    store.revokeUserConsent(req.session.user.id, 'geolocalizacion', req);
  }

  res.json({ success: true, locationShare, verification: store.getUserById(req.session.user.id).verification });
});

router.post('/ubicacion', requireRole('provider'), requireModule('provider_ubicacion'), (req, res) => {
  const { lat, lng, requestId } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'Coordenadas requeridas' });
  }

  const loc = store.updateProviderLocation(req.session.user.id, lat, lng);
  if (!loc) return res.status(403).json({ error: 'Ubicación no autorizada' });

  if (requestId) {
    const request = store.requests.find((r) => r.id === requestId);
    if (!request || request.providerId !== req.session.user.id) {
      return res.status(403).json({ error: 'Pedido no asignado a este socio' });
    }
    const io = req.app.get('io');
    io.to(`request_${requestId}`).emit(`provider_location_${requestId}`, {
      lat: loc.lat,
      lng: loc.lng,
      updatedAt: loc.updatedAt
    });
  }

  res.json({ success: true, location: loc });
});

router.get('/equipo', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  let okMsg = null;
  if (req.query.ok === 'self') okMsg = 'self';
  if (req.query.ok === 'linked') okMsg = 'linked';
  if (req.query.ok === 'invited') okMsg = 'invited';
  res.render('provider/equipo', equipoViewLocals(req, provider, {
    ok: okMsg,
    okDetail: typeof req.query.msg === 'string' ? req.query.msg : null,
    inviteWarn: typeof req.query.warn === 'string' ? req.query.warn : null
  }));
});

router.post('/equipo/yo-hago-servicio', requireRole('provider'), requireModule('provider_equipo'), async (req, res) => {
  const result = await store.enableSelfOperator(req.session.user.id);
  if (result.error) {
    const provider = store.getUserById(req.session.user.id);
    return res.status(400).render('provider/equipo', equipoViewLocals(req, provider, { error: result.error }));
  }
  store.logSecurityEvent('self_operator_enabled', result.tecnico.id, req);
  res.redirect('/proveedor/equipo?ok=self');
});

router.post('/entrar-terreno', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const self = store.getSelfOperator(provider.id);
  if (!self) {
    return res.status(400).json({ success: false, error: 'Activa «Yo hago el servicio» en Mi equipo.' });
  }
  req.session.linkedProvider = {
    id: provider.id,
    name: provider.name,
    email: provider.email,
    role: 'provider'
  };
  req.session.user = {
    id: self.id,
    name: self.name,
    email: self.email,
    role: 'tecnico',
    avatar: self.avatar
  };
  res.json({ success: true, technicianId: self.id });
});

router.get('/equipo/:id/expediente', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const tecnico = store.getTechnicianForProvider(req.session.user.id, req.params.id);
  if (!tecnico) return res.redirect('/proveedor/equipo');
  const provider = store.getUserById(req.session.user.id);
  const companyServiceIds = new Set(Array.isArray(provider.specialties) ? provider.specialties : []);
  res.render('provider/tecnico-expediente', {
    title: `Expediente — ${tecnico.name}`,
    user: req.session.user,
    tecnico,
    check: store.canTechnicianOperate(tecnico),
    services: store.SERVICES.filter((s) => s.enabled !== false && companyServiceIds.has(s.id)),
    providerSpecialties: provider.specialties || []
  });
});

router.post('/equipo/:id/expediente/documento', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const tecnico = store.getTechnicianForProvider(req.session.user.id, req.params.id);
  if (!tecnico) return res.status(404).json({ success: false, error: 'Técnico no encontrado.' });
  const valid = ['photo', 'idCardFront', 'idCardBack', 'criminalRecord', 'studyCertificate', 'otherCertificate'];
  if (!valid.includes(req.body.type) || !req.body.data) {
    return res.status(400).json({ success: false, error: 'Documento inválido.' });
  }
  try {
    const url = saveTechnicianDocumentFile(tecnico.id, req.body.type, req.body.data);
    const result = store.saveTechnicianDocument(
      req.session.user.id,
      tecnico.id,
      req.body.type,
      url,
      req.body.label
    );
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, check: result.check });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'No se pudo guardar el documento.' });
  }
});

router.post('/equipo/:id/especialidades', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const raw = req.body.specialties || [];
  const specialties = Array.isArray(raw) ? raw : [raw];
  const result = store.updateTechnicianSpecialties(req.session.user.id, req.params.id, specialties);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('tecnico_especialidades', `${req.params.id}`, req);
  res.json({
    success: true,
    specialties: result.specialties,
    providerSpecialties: result.providerSpecialties,
    services: result.services
  });
});

router.post('/servicios', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const raw = req.body.specialties || [];
  const specialties = Array.isArray(raw) ? raw : [raw];
  const result = store.updateProviderSpecialties(req.session.user.id, specialties);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('socio_servicios', specialties.join(','), req);
  res.json({ success: true, specialties: result.specialties, services: result.services });
});

router.post('/equipo/vincular', requireRole('provider'), requireModule('provider_equipo'), async (req, res) => {
  const result = store.linkTechnicianToProvider(req.session.user.id, {
    email: req.body.email,
    specialties: req.body.specialties
  });
  if (result.error) {
    const provider = store.getUserById(req.session.user.id);
    return res.status(400).render('provider/equipo', equipoViewLocals(req, provider, { error: result.error }));
  }
  store.logSecurityEvent('tecnico_vinculado', result.tecnico.email, req);
  const provider = store.getUserById(req.session.user.id);
  const invite = await require('../lib/technicianInvite').sendTechnicianInvite({
    store,
    tecnico: result.tecnico,
    provider,
    linked: true,
    locale: req.locale || 'es'
  });
  const baseMsg = result.message || 'Técnico enlazado';
  if (!invite.ok) {
    return res.redirect(
      `/proveedor/equipo?ok=linked&msg=${encodeURIComponent(baseMsg)}&warn=${encodeURIComponent('No pudimos enviar el correo de aviso al técnico. Revisa el correo o pide que revise spam.')}`
    );
  }
  res.redirect(
    `/proveedor/equipo?ok=linked&msg=${encodeURIComponent(`${baseMsg} Se envió un aviso a ${result.tecnico.email}.`)}`
  );
});

router.post('/equipo', requireRole('provider'), requireModule('provider_equipo'), async (req, res) => {
  const { name, email, password, phone } = req.body;
  const rawSpecs = req.body.specialties || [];
  const specialties = Array.isArray(rawSpecs) ? rawSpecs : [rawSpecs];
  const result = await store.createTechnician(req.session.user.id, {
    name, email, password, phone, specialties
  });

  if (result.error) {
    const isJson = req.xhr || (req.get('accept') || '').includes('application/json');
    if (isJson) return res.status(400).json({ success: false, error: result.error });
    const provider = store.getUserById(req.session.user.id);
    return res.status(400).render('provider/equipo', equipoViewLocals(req, provider, { error: result.error }));
  }

  if (result.selfOperator) {
    store.logSecurityEvent('self_operator_enabled', result.tecnico.id, req);
    const isJson = req.xhr || (req.get('accept') || '').includes('application/json');
    if (isJson) {
      return res.json({
        success: true,
        selfOperator: true,
        message: result.message || 'Te agregaste como técnico con tu cuenta de socio.'
      });
    }
    return res.redirect('/proveedor/equipo?ok=self');
  }

  store.logSecurityEvent(result.linked ? 'tecnico_vinculado' : 'tecnico_creado', result.tecnico.email, req);
  const provider = store.getUserById(req.session.user.id);
  const invite = await require('../lib/technicianInvite').sendTechnicianInvite({
    store,
    tecnico: result.tecnico,
    provider,
    linked: Boolean(result.linked),
    locale: req.locale || 'es'
  });

  const isJson = req.xhr || (req.get('accept') || '').includes('application/json');
  if (isJson) {
    return res.json({
      success: true,
      linked: Boolean(result.linked),
      message: result.message || null,
      inviteSent: Boolean(invite.ok),
      inviteError: invite.ok ? null : (invite.error || 'mail_failed'),
      tecnico: {
        id: result.tecnico.id,
        name: result.tecnico.name,
        email: result.tecnico.email,
        phone: result.tecnico.phone,
        specialties: result.tecnico.specialties,
        active: true,
        canClaimWall: false
      }
    });
  }

  if (result.linked) {
    const baseMsg = result.message || 'Técnico enlazado';
    if (!invite.ok) {
      return res.redirect(
        `/proveedor/equipo?ok=linked&msg=${encodeURIComponent(baseMsg)}&warn=${encodeURIComponent('No pudimos enviar el correo de aviso al técnico.')}`
      );
    }
    return res.redirect(
      `/proveedor/equipo?ok=linked&msg=${encodeURIComponent(`${baseMsg} Se envió un aviso a ${result.tecnico.email}.`)}`
    );
  }

  if (!invite.ok) {
    return res.redirect(
      `/proveedor/equipo?ok=invited&msg=${encodeURIComponent(`Técnico creado (${result.tecnico.email}), pero el correo de invitación no salió. Pídele que revise spam o vuelve a intentar.`)}&warn=${encodeURIComponent(invite.error || 'mail_failed')}`
    );
  }
  res.redirect(
    `/proveedor/equipo?ok=invited&msg=${encodeURIComponent(`Invitación enviada a ${result.tecnico.email}. Comparte también la contraseña que definiste.`)}`
  );
});

router.post('/equipo/:id/claim-wall', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const enabled = req.body.enabled === 'true' || req.body.enabled === true;
  const result = store.setTechnicianCanClaimWall(req.session.user.id, req.params.id, enabled);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('tecnico_claim_wall', `${req.params.id}:${enabled ? 'on' : 'off'}`, req);
  res.json({ success: true, ...result });
});

router.post('/equipo/:id/toggle', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const tecnico = store.getTechnicianForProvider(req.session.user.id, req.params.id);
  if (!tecnico) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

  const active = req.body.active === 'true' || req.body.active === true;
  store.setUserActive(tecnico.id, active);
  res.json({
    success: true,
    id: tecnico.id,
    active,
    services: store.getProviderServicesStatus(req.session.user.id)
  });
});

router.post('/equipo/:id/editar', requireRole('provider'), requireModule('provider_equipo'), async (req, res) => {
  const rawSpecs = req.body.specialties;
  const specialties = rawSpecs === undefined
    ? undefined
    : (Array.isArray(rawSpecs) ? rawSpecs : [rawSpecs]).filter(Boolean);
  const result = await store.updateTechnicianForProvider(req.session.user.id, req.params.id, {
    name: req.body.name,
    phone: req.body.phone,
    password: req.body.password,
    specialties
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('tecnico_editado', req.params.id, req);
  const specialtyNames = (result.tecnico.specialties || []).map((id) => {
    const svc = store.getServiceById?.(id) || (store.SERVICES || []).find((s) => s.id === id);
    return svc?.name || id;
  });
  res.json({
    success: true,
    tecnico: {
      id: result.tecnico.id,
      name: result.tecnico.name,
      phone: result.tecnico.phone || '',
      avatar: result.tecnico.avatar,
      email: result.tecnico.email,
      specialties: result.tecnico.specialties || [],
      specialtyNames
    }
  });
});

router.post('/equipo/:id/desvincular', requireRole('provider'), requireModule('provider_equipo'), (req, res) => {
  const result = store.unlinkTechnicianFromProvider(req.session.user.id, req.params.id);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('tecnico_desvinculado', req.params.id, req);
  res.json({ success: true });
});

router.get('/mando', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const technicians = store.getTechniciansByProvider(provider.id)
    .filter((t) => t.active !== false && store.canTechnicianOperate(t).ok);
  const active = store.getActiveRequestsForProvider(provider.id, req.locale);
  const { groupRequestsByAgendaDay } = require('../lib/jobAgenda');
  const agenda = groupRequestsByAgendaDay(active);

  const technicianMarkers = technicians.map((t) => ({
    id: t.id,
    name: t.name,
    lat: t.locationShare?.lat ?? provider.locationShare?.lat,
    lng: t.locationShare?.lng ?? provider.locationShare?.lng,
    online: Boolean(t.online)
  }));

  res.render('provider/mando', {
    title: req.t('provider.mando_page.title'),
    user: req.session.user,
    provider,
    technicians,
    requests: active,
    agenda,
    technicianMarkers,
    providerStats: store.getProviderDashboardStats(provider.id),
    workflowStep: 3,
    services: store.SERVICES,
    formatCLP: store.formatCLP
  });
});

router.get('/trabajo/:requestId', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
  const request = store.getRequestForProvider(req.params.requestId, req.session.user.id);
  if (!request) return res.redirect('/proveedor/mando');

  const techLabels = {
    asignado: req.t('status.tech.asignado'),
    aceptado: req.t('status.tech.aceptado'),
    en_camino: req.t('status.tech.en_camino'),
    en_sitio: req.t('status.tech.en_sitio'),
    diagnostico: req.t('status.tech.diagnostico_label'),
    reparando: req.t('status.tech.reparando'),
    comprando: req.t('status.tech.comprando'),
    materiales_pendiente: req.t('status.tech.materiales_pendiente'),
    presupuesto_pendiente: req.t('status.tech.presupuesto_pendiente'),
    presupuesto_aprobado: req.t('status.tech.presupuesto_aprobado'),
    completado: req.t('status.tech.completado')
  };

  res.render('tecnico/trabajo', {
    title: 'Pedido en terreno — Fandez',
    user: req.session.user,
    tecnico: request.technicianId ? store.getUserById(request.technicianId) : null,
    request: serializeFieldJob(store, request),
    returnUrl: '/proveedor/mando',
    observerMode: true,
    chatApiBase: '/proveedor',
    techLabels,
    formatCLP: store.formatCLP,
    attentionChecklist: ATTENTION_CHECKLIST,
    diagnosisChips: getDiagnosisChips(request.serviceId),
    materialsCatalog: store.getMaterialsCatalogForService(request.serviceId),
    materialsIncludedThreshold: store.getMaterialsIncludedThreshold()
  });
});

router.post('/asignar/:requestId', requireRole('provider'), requireModule('provider_mando'), (req, res) => {
  const { technicianId } = req.body;
  const result = store.assignTechnician(req.params.requestId, req.session.user.id, technicianId);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  const io = req.app.get('io');
  io.emit(`tecnico_assignment_${result.tecnico.id}`, { requestId: result.request.id });
  emitRequestUpdateToParties(io, store, result.request, { request: result.request });
  store.logSecurityEvent('tecnico_asignado', `${result.tecnico.email} -> ${result.request.id}`, req);

  res.json({
    success: true,
    request: { id: result.request.id, technicianId: result.tecnico.id, technicianName: result.tecnico.name, techStatus: result.request.techStatus }
  });
});

router.get('/chat/:requestId', requireRole('provider'), (req, res) => {
  const result = store.getRequestChat(req.params.requestId, req.session.user);
  if (result.error) return res.status(result.error === 'No autorizado' ? 403 : 404).json(result);
  res.json(result);
});

router.post('/chat/:requestId', requireRole('provider'), (req, res) => {
  const result = store.postRequestChatMessage(req.params.requestId, req.session.user, req.body?.body || req.body?.message);
  if (result.error) return res.status(400).json(result);
  const io = req.app.get('io');
  io.emit(`request_chat_${result.requestId}`, { message: result.message });
  emitRequestUpdateToParties(io, store, store.requests.find((r) => r.id === result.requestId), {
    request: store.requests.find((r) => r.id === result.requestId),
    chatMessage: result.message
  });
  res.json(result);
});

router.post('/factura/:requestId/registrar', requireRole('provider'), (req, res) => {
  const request = store.getAllRequests().find((item) => item.id === req.params.requestId);
  if (!request || request.providerId !== req.session.user.id) {
    return res.status(404).json({ success: false, error: 'Solicitud no encontrada.' });
  }
  if (request.status !== 'completed' || request.providerInvoicePlan?.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'La factura ya fue registrada o aún no corresponde emitirla.' });
  }
  if (!req.body.file) return res.status(400).json({ success: false, error: 'Adjunta la factura o boleta.' });
  let uploaded;
  try {
    uploaded = saveProviderInvoice(req.params.requestId, req.body.file);
  } catch (_) {
    return res.status(400).json({ success: false, error: 'No se pudo guardar el documento.' });
  }
  const result = store.registerProviderInvoice(req.params.requestId, req.session.user.id, {
    ...req.body,
    ...uploaded
  });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json(result);
});

router.get('/verificacion/estado', requireRole('provider'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  res.json({
    success: true,
    verification: provider.verification,
    locationShare: provider.locationShare,
    contract: getContractSummary(provider.providerContract),
    check: store.canProviderGoOnline(provider)
  });
});

router.get('/contrato', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const provider = store.getUserById(req.session.user.id);
  const contract = store.getProviderContract(provider.id);
  const summary = getContractSummary(contract);
  res.render('provider/contrato', {
    title: 'Contrato de socio — Fandez',
    user: req.session.user,
    provider,
    contract,
    summary,
    entityTypes: ENTITY_TYPES,
    documentCatalog: DOCUMENT_CATALOG,
    bankAccountTypes: BANK_ACCOUNT_TYPES,
    legalDeclarations: LEGAL_DECLARATIONS,
    contractClauses: CONTRACT_CLAUSES,
    templateVersion: TEMPLATE_VERSION,
    company,
    documentsForEntity: contract.entityType ? getDocumentsForEntity(contract.entityType) : []
  });
});

router.post('/contrato/draft', requireRole('provider'), requireModule('provider_contrato'), (req, res) => {
  const result = store.updateProviderContractDraft(req.session.user.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post('/contrato/documento', requireRole('provider'), requireModule('provider_contrato'), async (req, res) => {
  const { docKey, data, label } = req.body;
  if (!docKey || !data) return res.status(400).json({ error: 'Documento inválido.' });
  try {
    const url = saveProviderFile(req.session.user.id, `contract-${docKey}`, data);
    const contract = store.saveContractDocument(req.session.user.id, docKey, url, label);
    const reviewKey = docKey === 'technical_certs'
      ? `technical_certs:${Math.max(0, (contract.technicalCerts || []).length - 1)}`
      : docKey;
    const servingUrl = toServingUrl(url) || url;
    setImmediate(() => {
      runContractAi(req.session.user.id, reviewKey, url).catch((err) => {
        console.error('IA contrato async:', err.message);
      });
    });
    res.json({
      success: true,
      url: servingUrl,
      contract,
      ai: { status: 'pending', reason: 'Revisión IA en curso…' },
      summary: getContractSummary(contract)
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar el documento.' });
  }
});

router.post('/contrato/enviar', requireRole('provider'), requireModule('provider_contrato'), async (req, res) => {
  const draft = store.updateProviderContractDraft(req.session.user.id, req.body);
  if (draft.error) return res.status(400).json({ error: draft.error });
  try {
    await ensureProviderAiReviews(req.session.user.id);
  } catch (err) {
    console.error('IA antecedentes:', err.message);
  }
  const result = store.submitProviderContract(req.session.user.id, {
    signature: req.body.signature || {},
    ip: getClientIp(req),
    userAgent: req.get('user-agent')
  });
  if (result.error) return res.status(400).json({ error: result.error, errors: result.errors });
  store.logSecurityEvent('contrato_enviado', req.session.user.email, req);
  store.recordConsent({
    userId: req.session.user.id,
    type: 'contrato_socio',
    granted: true,
    version: TEMPLATE_VERSION,
    ip: getClientIp(req)
  });
  res.json(result);
});

module.exports = router;

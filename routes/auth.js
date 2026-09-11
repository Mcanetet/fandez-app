const express = require('express');
const router = express.Router();
const store = require('../models/store');
const company = require('../config/company');
const { rateLimitLogin } = require('../middleware/security');
const { validateRegistrationConsents } = require('../lib/consent-policy');
const emailVerification = require('../lib/emailVerification');
const passwordReset = require('../lib/passwordReset');
const mailer = require('../lib/mailer');
const { notifyProviderSignup } = require('../lib/sofiaProviderSignup');
const { localizeServices } = require('../lib/i18n-admin');

const PUBLIC_ROLES = ['client', 'provider', 'tecnico'];
const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;
/** Clientes/socios: sesión larga (solo se cierra con “Cerrar sesión”). */
const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'fandez.sid';

function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  };
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

function isAdminSessionUser(req) {
  return Boolean(
    req.session?.user?.role === 'admin'
    || req.session?.isAdminSession
    || req.session?.pendingAdminMfa
  );
}

/** Cierra sesión por completo (cookie + datos) y redirige. */
function logoutAndRedirect(req, res, redirectTo = '/') {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  // No usar Clear-Site-Data: en Chrome/Android/PWA congela la navegación
  // (borra storage + caches del SW) y el usuario siente que “no sale”.

  if (req.session) {
    req.session.user = null;
    delete req.session.isAdminSession;
    delete req.session.adminMfaVerified;
    delete req.session.pendingAdminMfa;
    delete req.session.adminAccess;
  }

  let finished = false;
  const finish = () => {
    if (finished || res.headersSent) return;
    finished = true;
    clearSessionCookie(res);
    res.redirect(303, redirectTo);
  };

  if (!req.session) return finish();

  // Si MySQL tarda, igual sacamos al usuario (cookie ya se limpia).
  const watchdog = setTimeout(() => {
    console.warn('[logout] session.destroy timeout — redirigiendo igual');
    finish();
  }, 2000);

  try {
    req.session.destroy((err) => {
      clearTimeout(watchdog);
      if (err) console.error('[logout]', err.message);
      finish();
    });
  } catch (err) {
    clearTimeout(watchdog);
    console.error('[logout]', err.message);
    finish();
  }
}

function setSessionUser(req, user, { admin = false, remember = true, activeRole = null } = {}) {
  const primaryRole = user.role;
  let role = activeRole || user.role;
  if (role === 'client' && primaryRole === 'provider' && !user.clientEnabled) {
    role = 'provider';
  }
  if (role === 'provider' && primaryRole !== 'provider') {
    role = primaryRole;
  }
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    primaryRole,
    clientEnabled: Boolean(user.clientEnabled)
  };
  req.session.isAdminSession = admin;
  if (req.session.cookie) {
    if (admin) req.session.cookie.maxAge = ADMIN_SESSION_MS;
    else req.session.cookie.maxAge = remember ? REMEMBER_SESSION_MS : DEFAULT_SESSION_MS;
  }
}

function getDashboardPath(role) {
  const { getAdminBasePath } = require('../lib/appMode');
  const paths = {
    client: '/cliente',
    provider: '/proveedor',
    tecnico: '/tecnico',
    admin: getAdminBasePath()
  };
  return paths[role] || '/';
}

async function redirectAfterAuth(req, res, user) {
  // Admin nunca usa verificación por correo: solo login admin + Google Authenticator
  if (user?.role === 'admin') {
    const { adminUrl } = require('../lib/appMode');
    return res.redirect(adminUrl('/login'));
  }
  if (!store.isEmailVerified(user)) {
    const qs = new URLSearchParams({ pending: '1' });
    try {
      const issue = await store.issueEmailVerification(user.id, {
        locale: req.locale || 'es',
        respectCooldown: true
      });
      if (issue?.authFailed) qs.set('mail', 'auth');
      else if (issue?.error && !issue?.skippedCooldown) qs.set('mail', 'error');
      else if (issue?.pending || issue?.skippedCooldown) qs.set('mail', 'pending');
      else if (issue?.demo) qs.set('mail', 'demo');
    } catch (err) {
      console.error('[login] verificación email:', err.message);
      qs.set('mail', 'error');
    }
    return res.redirect(`/verificar-email?${qs.toString()}`);
  }
  return res.redirect(getDashboardPath(user.role));
}

function loginRenderOptions(req, extra = {}) {
  return {
    title: 'Iniciar sesión',
    seo: buildPageMeta('login', req),
    demoAccounts: store.getDemoAccounts({ forLogin: true }),
    referralCode: req.session.pendingReferral || null,
    ...extra
  };
}

router.get('/login', (req, res) => {
  // Sesión admin no usa el login público
  if (isAdminSessionUser(req)) {
    const { adminUrl } = require('../lib/appMode');
    return res.redirect(adminUrl('/login'));
  }
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) {
      return res.redirect('/verificar-email?pending=1');
    }
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  let success = null;
  if (req.query.reset === '1') success = req.t('reset.success_login');
  res.render('login', loginRenderOptions(req, { error: null, success }));
});

router.post('/login', rateLimitLogin(12), async (req, res) => {
  const { email, password } = req.body;
  const result = await store.authenticateUser(email, password, { allowedRoles: PUBLIC_ROLES });

  if (result.error === 'wrong_portal') {
    store.logSecurityEvent('login_admin_blocked_public', email, req);
    const appMode = require('../lib/appMode');
    const adminLoginPath = appMode.adminUrl('/login');
    const adminHint = appMode.isDemoMode()
      ? ` Entra aquí: ${adminLoginPath}`
      : '';
    return res.render('login', loginRenderOptions(req, {
      error: 'Las cuentas de administración no usan este login público.' + adminHint
    }));
  }

  if (result.error === 'blocked') {
    store.logSecurityEvent('login_blocked', email, req);
    return res.render('login', loginRenderOptions(req, {
      error: 'Esta cuenta está desactivada. Escribe a soporte@fandez.cl para reactivarla.'
    }));
  }

  if (result.error) {
    store.logSecurityEvent('login_fail', email, req);
    return res.render('login', loginRenderOptions(req, {
      error: 'Credenciales incorrectas. Intenta nuevamente.'
    }));
  }

  const user = result.user;
  // En móvil/PWA la sesión debe permanecer hasta “Cerrar sesión”.
  const remember = true;
  setSessionUser(req, user, { remember });
  store.logSecurityEvent('login_ok', email, req);

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  await redirectAfterAuth(req, res, user);
});

const { buildPageMeta } = require('../lib/seo');
const { getCommune, getRegionCommunes, getRegionsCatalog } = require('../lib/chile-geo');
const { buildCoverageResult } = require('../lib/coverage');
const {
  searchAddressSuggestions,
  geocodeAddress,
  geocodeCommuneCenter,
  withCommuneContext,
  coordsMatchAddress,
  parseStreetAndNumber,
  haversineKm
} = require('../lib/geocode');

function wantsJson(req) {
  return req.is('application/json') || (req.get('Accept') || '').includes('application/json');
}

function registerRenderOptions(req, extra = {}) {
  const form = extra.form || {};
  const pageId = form.role === 'provider' || req.query.role === 'provider' ? 'register_provider' : 'register';
  const selectedRegion = form.addressRegion || '';
  return {
    services: localizeServices(store.getActiveServices(), req.t),
    referralCode: req.session.pendingReferral || null,
    useMap: true,
    pageScript: '/js/register-address.js',
    registrationRegions: getRegionsCatalog().map((r) => ({ code: r.code, name: r.name })),
    registrationCommunes: selectedRegion ? getRegionCommunes(selectedRegion) : [],
    seo: buildPageMeta(pageId, req),
    ...extra
  };
}

function resolveRegisterError(req, result) {
  if (result.errorKey) return req.t(result.errorKey);
  return result.error || req.t('register.error_generic');
}

function registerFormFromBody(body) {
  const rawSpecialties = body.specialties || [];
  return {
    name: body.name,
    email: body.email,
    password: body.password,
    phone: body.phone,
    role: body.role === 'provider' ? 'provider' : 'client',
    address: body.address,
    addressUnit: body.address_unit || body.addressUnit,
    addressLat: body.address_lat || body.addressLat,
    addressLng: body.address_lng || body.addressLng,
    addressPlaceId: body.address_place_id || body.addressPlaceId,
    addressRegion: body.address_region || body.addressRegion,
    addressCommune: body.address_commune || body.addressCommune,
    specialties: (Array.isArray(rawSpecialties) ? rawSpecialties : [rawSpecialties]).filter(Boolean),
    companyRut: body.company_rut || body.companyRut,
    companyLegalName: body.company_legal_name || body.companyLegalName,
    repRut: body.rep_rut || body.repRut,
    repName: body.rep_name || body.repName,
    otherServiceName: body.other_service_name || body.otherServiceName,
    otherServiceDescription: body.other_service_description || body.otherServiceDescription,
    clientBillingType: body.client_billing_type || body.clientBillingType || 'natural',
    clientRut: body.client_rut || body.clientRut,
    clientLegalName: body.client_legal_name || body.clientLegalName,
    clientGiro: body.client_giro || body.clientGiro
  };
}

function resolveRegistrationCommune(regionCode, communeCode) {
  if (!regionCode || !communeCode) return null;
  return getCommune(String(regionCode).trim(), String(communeCode).trim());
}

router.get('/registro/regiones/:regionCode/comunas', (req, res) => {
  const communes = getRegionCommunes(req.params.regionCode);
  if (!communes.length) return res.status(404).json({ error: 'region_not_found', communes: [] });
  res.json({
    regionCode: req.params.regionCode,
    communes: communes.map((c) => ({ code: c.code, name: c.name }))
  });
});

router.get('/registro/comunas/:regionCode/:communeCode', async (req, res) => {
  const commune = resolveRegistrationCommune(req.params.regionCode, req.params.communeCode);
  if (!commune) return res.status(404).json({ error: 'commune_not_found' });

  const center = await geocodeCommuneCenter(commune.name, commune.regionName);
  const coverage = buildCoverageResult(commune, store.getCoverageMap());

  res.json({
    code: commune.code,
    name: commune.name,
    regionCode: commune.regionCode,
    regionName: commune.regionName,
    lat: center.lat,
    lng: center.lng,
    coverage: {
      covered: coverage.covered,
      unknown: coverage.unknown,
      communeName: coverage.communeName,
      regionName: coverage.regionName,
      messageKey: coverage.messageKey || 'coverage.not_available',
      message: coverage.covered ? null : req.t(coverage.messageKey || 'coverage.not_available')
    }
  });
});

router.get('/registro/direcciones', async (req, res) => {
  const q = (req.query.q || '').trim();
  const communeCode = (req.query.commune || '').trim();
  const regionCode = (req.query.region || '').trim();
  if (q.length < 3 || !communeCode || !regionCode) return res.json({ suggestions: [] });

  const commune = resolveRegistrationCommune(regionCode, communeCode);
  if (!commune) return res.json({ suggestions: [] });

  const suggestions = await searchAddressSuggestions(q, {
    communeName: commune.name,
    regionName: commune.regionName
  });
  res.json({ suggestions });
});

router.post('/registro/direcciones/validar', async (req, res) => {
  const { address, lat, lng, communeCode, regionCode } = req.body || {};
  const addr = (address || '').trim();
  if (!addr) return res.status(400).json({ error: 'address_required' });

  const commune = resolveRegistrationCommune(regionCode, communeCode);
  if (!commune) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_commune_required')
    });
  }

  if (!parseStreetAndNumber(addr)) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_address_street_number')
    });
  }

  const fullAddress = withCommuneContext(addr, commune.name);
  const geo = await geocodeAddress(fullAddress, { strict: true, communeName: commune.name });
  if (!geo.found) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_address_street_number')
    });
  }

  const submittedLat = parseFloat(lat);
  const submittedLng = parseFloat(lng);
  let coordCheck = await coordsMatchAddress({
    lat: submittedLat,
    lng: submittedLng,
    geo,
    communeName: commune.name,
    maxDistanceKm: geo.approximate ? 4 : 2.5
  });
  if (!coordCheck.ok && Number.isFinite(submittedLat) && Number.isFinite(submittedLng)) {
    const center = await geocodeCommuneCenter(commune.name, commune.regionName);
    const distToCommune = haversineKm(submittedLat, submittedLng, center.lat, center.lng);
    if (distToCommune <= 8) {
      coordCheck = { ok: true, distKm: distToCommune, adjusted: true };
    }
  }
  if (!coordCheck.ok) {
    return res.status(400).json({
      success: false,
      error: req.t('register.error_address_mismatch')
    });
  }

  const coverage = buildCoverageResult(commune, store.getCoverageMap());

  res.json({
    success: true,
    coords: {
      lat: Number.isFinite(submittedLat) ? submittedLat : geo.lat,
      lng: Number.isFinite(submittedLng) ? submittedLng : geo.lng
    },
    coverage: {
      covered: coverage.covered,
      unknown: coverage.unknown,
      communeName: coverage.communeName,
      regionName: coverage.regionName,
      messageKey: coverage.messageKey || 'coverage.not_available',
      message: coverage.covered ? null : req.t(coverage.messageKey || 'coverage.not_available')
    }
  });
});

router.get('/registro', (req, res) => {
  // Bug: tras salir del admin, "Empezar gratis" redirigía otra vez al panel si la cookie seguía viva.
  // En registro público nunca reutilizar sesión admin: cerrar y mostrar el formulario.
  if (isAdminSessionUser(req)) {
    const dest = req.originalUrl && req.originalUrl.startsWith('/registro')
      ? req.originalUrl
      : '/registro';
    return logoutAndRedirect(req, res, dest);
  }
  if (req.session.user) {
    const user = store.getUserById(req.session.user.id);
    if (user && !store.isEmailVerified(user)) return res.redirect('/verificar-email');
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const defaultRole =
    req.query.role === 'client' || req.query.emergency ? 'client' : 'provider';
  res.render('registro', registerRenderOptions(req, {
    title: 'Crear cuenta',
    error: null,
    form: { role: defaultRole, specialties: [] }
  }));
});

router.post('/registro', async (req, res) => {
  try {
  const form = registerFormFromBody(req.body);
  const { name, email, password, phone, role, address, addressUnit, addressLat, addressLng, addressPlaceId, addressRegion, addressCommune, specialties,
    companyRut, companyLegalName, repRut, repName, clientBillingType, clientRut, clientLegalName, clientGiro,
    otherServiceName, otherServiceDescription } = form;
  const providerDocuments = req.body.provider_documents || req.body.providerDocuments;

  const consentCheck = validateRegistrationConsents(req.body);
  if (!consentCheck.ok) {
    const payload = registerRenderOptions(req, {
      title: 'Crear cuenta',
      error: req.t(consentCheck.errorKey || 'register.error_consents'),
      form
    });
    if (wantsJson(req)) return res.status(400).json({ error: payload.error });
    return res.status(400).render('registro', payload);
  }

  const result = await store.registerUser({
    name, email, password, phone, role, address,
    addressUnit, addressLat, addressLng, addressPlaceId, addressRegion, addressCommune, specialties,
    companyRut, companyLegalName, repRut, repName, providerDocuments,
    clientBillingType, clientRut, clientLegalName, clientGiro,
    otherServiceName, otherServiceDescription
  });

  if (!result.success) {
    if (result.code === 'email_exists') {
      const login = await store.authenticateUser(email, password, { allowedRoles: PUBLIC_ROLES });
      if (!login.error) {
        const existingUser = login.user;
        setSessionUser(req, existingUser);
        store.logSecurityEvent('registro_existing_login_ok', email, req);

        if (existingUser.role === 'client' && req.session.pendingReferral) {
          const referral = store.applyReferralCode(existingUser.id, req.session.pendingReferral);
          if (referral.success) req.session.referralBonus = referral.bonus;
          delete req.session.pendingReferral;
        }

        if (!store.isEmailVerified(existingUser)) {
          const issue = await store.issueEmailVerification(existingUser.id, { locale: req.locale || 'es' });
          if (wantsJson(req)) {
            return res.status(409).json({
              error: req.t('register.error_email_exists_unverified'),
              redirect: '/verificar-email?exists=1',
              needsVerification: true,
              mailError: issue.error || null
            });
          }
          const q = issue.error && !issue.demo ? 'exists=1&mail=error' : 'exists=1';
          return res.redirect(`/verificar-email?${q}`);
        }

        if (wantsJson(req)) {
          return res.status(409).json({
            error: req.t('register.error_email_exists'),
            redirect: getDashboardPath(existingUser.role)
          });
        }
        return await redirectAfterAuth(req, res, existingUser);
      }

      const existsPayload = registerRenderOptions(req, {
        title: 'Crear cuenta',
        error: req.t('register.error_email_exists_login'),
        form,
        emailExists: true
      });
      if (wantsJson(req)) return res.status(409).json({ error: existsPayload.error, emailExists: true });
      return res.status(409).render('registro', existsPayload);
    }

    const errMsg = resolveRegisterError(req, result);
    if (wantsJson(req)) return res.status(400).json({ error: errMsg });
    return res.status(400).render('registro', registerRenderOptions(req, {
      title: 'Crear cuenta',
      error: errMsg,
      form
    }));
  }

  const user = result.user;
  setSessionUser(req, user);
  store.logSecurityEvent('registro_ok', email, req);
  store.recordRegistrationConsents(req, user.id, req.body);
  req.session.consentGranted = true;

  if (user.role === 'provider') {
    const otherService = result.otherService
      || (user.providerContract?.serviceRequests || [])[0]
      || null;
    notifyProviderSignup({
      user,
      store,
      otherService,
      io: req.app.get('io')
    }).catch((err) => console.error('[registro] sofia socio:', err.message));
  }

  if (user.role === 'client' && req.session.pendingReferral) {
    const referral = store.applyReferralCode(user.id, req.session.pendingReferral);
    if (referral.success) req.session.referralBonus = referral.bonus;
    delete req.session.pendingReferral;
  }

  // No bloquear el redirect si el SMTP tarda: el código ya se guarda antes de enviar
  let issue = { success: true };
  try {
    issue = await store.issueEmailVerification(user.id, { locale: req.locale || 'es' });
  } catch (err) {
    console.error('[registro] verificación email:', err.message);
    issue = { error: err.message || 'mail_error' };
  }

  if (wantsJson(req)) {
    const mailQs = issue.authFailed
      ? 'welcome=1&mail=auth'
      : (issue.error && !issue.demo && !issue.pending
        ? 'welcome=1&mail=error'
        : (issue.demo ? 'welcome=1&mail=demo' : (issue.pending ? 'welcome=1&mail=pending' : 'welcome=1')));
    return res.json({
      success: true,
      redirect: `/verificar-email?${mailQs}`,
      mailDemo: Boolean(issue.demo),
      mailError: issue.error || null,
      mailPending: Boolean(issue.pending),
      mailAuthFailed: Boolean(issue.authFailed)
    });
  }
  if (issue.pending) {
    return res.redirect('/verificar-email?welcome=1&mail=pending');
  }
  if (issue.authFailed) {
    return res.redirect('/verificar-email?welcome=1&mail=auth');
  }
  if (issue.error && !issue.demo) {
    return res.redirect('/verificar-email?welcome=1&mail=error');
  }
  if (issue.demo) {
    return res.redirect('/verificar-email?welcome=1&mail=demo');
  }
  return res.redirect('/verificar-email?welcome=1');
  } catch (err) {
    console.error('[registro] error inesperado:', err);
    const form = registerFormFromBody(req.body || {});
    const message = req.t('register.error_generic') || 'No se pudo crear la cuenta. Intenta nuevamente.';
    if (wantsJson(req)) return res.status(500).json({ error: message });
    return res.status(500).render('registro', registerRenderOptions(req, {
      title: 'Crear cuenta',
      error: message,
      form
    }));
  }
});

function verifyEmailPageLocals(req, user, extra = {}) {
  return {
    title: extra.title || 'Verificar correo — Fandez',
    email: user.email,
    userName: user.name || '',
    welcome: extra.welcome !== false,
    pendingLogin: Boolean(extra.pendingLogin),
    company,
    error: extra.error || null,
    success: extra.success || null,
    cooldown: extra.cooldown != null ? extra.cooldown : emailVerification.resendCooldownSeconds(user),
    codeExpiresAt: user.emailVerificationExpiresAt || null,
    demoHint: !mailer.isConfigured()
  };
}

router.get('/verificar-email', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.redirect('/logout');
  if (user.role === 'admin') {
    const { adminUrl } = require('../lib/appMode');
    return res.redirect(adminUrl('/login'));
  }
  if (store.isEmailVerified(user)) {
    return res.redirect(getDashboardPath(user.role));
  }

  let success = null;
  let error = null;
  let cooldown = emailVerification.resendCooldownSeconds(user);
  if (req.query.exists === '1') {
    success = req.t('verify.exists_resent');
  }
  if (req.query.pending === '1') {
    success = req.t('verify.pending_login');
  }
  if (req.query.mail === 'auth') {
    error = req.t('verify.mail_auth_error');
    cooldown = 0;
  } else if (req.query.mail === 'error') {
    error = req.t('verify.mail_error');
    cooldown = 0;
  } else if (req.query.mail === 'demo') {
    success = req.t('verify.mail_demo');
  } else if (req.query.mail === 'pending') {
    success = req.query.pending === '1'
      ? req.t('verify.pending_login')
      : req.t('verify.mail_pending');
  }

  res.render('verificar-email', verifyEmailPageLocals(req, user, {
    title: req.query.pending === '1' ? 'Verificación pendiente — Fandez' : (req.query.welcome === '1' ? 'Bienvenido — Fandez' : 'Verificar correo — Fandez'),
    welcome: req.query.welcome === '1' || req.query.pending === '1' || !req.query.exists,
    pendingLogin: req.query.pending === '1',
    error,
    success,
    cooldown
  }));
});

router.post('/verificar-email', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.redirect('/logout');
  if (store.isEmailVerified(user)) {
    return res.redirect(getDashboardPath(user.role));
  }

  const code = (req.body.code || '').trim();
  const result = await store.verifyEmailCode(user.id, code);
  if (result.error) {
    const fresh = store.getUserById(user.id) || user;
    const cooldown = emailVerification.resendCooldownSeconds(fresh);
    return res.render('verificar-email', verifyEmailPageLocals(req, fresh, {
      welcome: true,
      error: result.error,
      cooldown
    }));
  }

  store.logSecurityEvent('email_verificado', user.email, req);
  await redirectAfterAuth(req, res, store.getUserById(user.id));
});

router.post('/verificar-email/reenviar', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, error: 'No autenticado' });
  const user = store.getUserById(req.session.user.id);
  if (!user) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const result = await store.resendEmailVerification(user.id, { locale: req.locale || 'es' });
    if (result.error) {
      const status = result.cooldown ? 429 : 502;
      const errorMsg = result.error === 'auth_failed'
        ? req.t('verify.mail_auth_error')
        : result.error;
      return res.status(status).json({
        success: false,
        error: errorMsg,
        cooldown: result.cooldown || 0
      });
    }
    const fresh = store.getUserById(user.id);
    return res.json({
      success: true,
      demo: Boolean(result.demo),
      pending: Boolean(result.pending),
      cooldown: result.demo ? 0 : (emailVerification.RESEND_COOLDOWN_MS / 1000),
      expiresAt: fresh?.emailVerificationExpiresAt || null
    });
  } catch (err) {
    console.error('[verificar-email/reenviar]', err.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudo reenviar el código. Intenta de nuevo.',
      cooldown: 0
    });
  }
});

function renderRecoverRequest(req, res, extra = {}) {
  res.render('recuperar', {
    title: req.t('reset.title') + ' — Fandez',
    seo: buildPageMeta('login', req),
    error: null,
    sent: false,
    email: '',
    cooldown: 0,
    demoHint: !mailer.isConfigured(),
    ...extra
  });
}

router.get('/recuperar', (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const email = String(req.query.email || '').trim().toLowerCase();
  renderRecoverRequest(req, res, { email });
});

router.post('/recuperar', rateLimitLogin(8), async (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const result = await store.requestPasswordReset(email, {
    locale: req.locale || 'es',
    respectCooldown: true
  });

  if (result.errorKey) {
    return renderRecoverRequest(req, res, {
      error: req.t(result.errorKey),
      email
    });
  }

  // UX: siempre mostrar “enviado” (no revelar si el correo existe).
  // Si SMTP falló, mostrar tip demo / error suave sin filtrar existencia.
  let noticeError = null;
  if (result.authFailed) noticeError = req.t('verify.mail_auth_error');
  else if (result.mailError) noticeError = req.t('verify.mail_error');

  store.logSecurityEvent('password_reset_requested', email || 'unknown', req);

  return res.render('recuperar', {
    title: req.t('reset.sent_title') + ' — Fandez',
    seo: buildPageMeta('login', req),
    error: noticeError,
    sent: true,
    email,
    cooldown: result.cooldown || passwordReset.resendCooldownSeconds(store.getUserByEmail(email)) || 0,
    demoHint: Boolean(result.demo) || !mailer.isConfigured()
  });
});

router.get('/recuperar/nueva', (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const token = String(req.query.token || '').trim();
  const user = store.findUserByPasswordResetToken(token);
  if (!user || !passwordReset.verifyToken(user, token).ok) {
    return res.render('recuperar-nueva', {
      title: req.t('reset.invalid_title') + ' — Fandez',
      seo: buildPageMeta('login', req),
      invalid: true,
      error: req.t(user ? 'reset.error_token_expired' : 'reset.error_token_invalid'),
      token: '',
      email: null
    });
  }
  return res.render('recuperar-nueva', {
    title: req.t('reset.new_title') + ' — Fandez',
    seo: buildPageMeta('login', req),
    invalid: false,
    error: null,
    token,
    email: user.email
  });
});

router.post('/recuperar/nueva', rateLimitLogin(8), async (req, res) => {
  if (req.session.user) {
    return res.redirect(getDashboardPath(req.session.user.role));
  }
  const token = String(req.body.token || '').trim();
  const password = req.body.password;
  const passwordConfirm = req.body.passwordConfirm;
  const result = await store.resetPasswordWithToken(token, password, passwordConfirm);

  if (result.errorKey) {
    const user = store.findUserByPasswordResetToken(token);
    const fatal = result.errorKey === 'reset.error_token_invalid'
      || result.errorKey === 'reset.error_token_expired'
      || !user;
    if (fatal) {
      return res.render('recuperar-nueva', {
        title: req.t('reset.invalid_title') + ' — Fandez',
        seo: buildPageMeta('login', req),
        invalid: true,
        error: req.t(result.errorKey),
        token: '',
        email: null
      });
    }
    return res.render('recuperar-nueva', {
      title: req.t('reset.new_title') + ' — Fandez',
      seo: buildPageMeta('login', req),
      invalid: false,
      error: req.t(result.errorKey),
      token,
      email: user.email
    });
  }

  store.logSecurityEvent('password_reset_ok', result.user.email, req);
  const qs = new URLSearchParams({ reset: '1', email: result.user.email });
  return res.redirect(`/login?${qs.toString()}`);
});

router.get('/logout', (req, res) => {
  const wasAdmin = isAdminSessionUser(req);
  // Admin vuelve al login admin; resto a la home pública
  const { adminUrl } = require('../lib/appMode');
  logoutAndRedirect(req, res, wasAdmin ? adminUrl('/login') : '/');
});

router.post('/cuenta/password', async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ success: false, error: 'Debes iniciar sesión.' });
  }
  try {
    const result = await store.changeUserPassword(
      req.session.user.id,
      req.body.currentPassword || req.body.password,
      req.body.newPassword
    );
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    store.logSecurityEvent('password_change', req.session.user.email || req.session.user.id, req);
    res.json({ success: true, message: 'Contraseña actualizada.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'No se pudo cambiar la contraseña.' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const store = require('../models/store');
const { emitRequestUpdateToParties } = require('../lib/realtime');
const company = require('../config/company');
const backup = require('../lib/backup');
const { getAppVersionInfo } = require('../lib/version');
const { requireRole } = require('../middleware/auth');
const {
  attachAdminAccess,
  requireAdminPermission,
  requireFounderDecision,
  refreshSessionAdminAccess,
  canAccessPanel,
  getFirstAccessiblePanel
} = require('../middleware/adminAccess');
const { hasPermission } = require('../lib/adminPermissions');
const {
  getNavForAccess,
  getPermissionGroups,
  getProfilesList
} = require('../lib/adminPermissions');
const {
  getAdminStrings,
  localizeModules,
  localizeServices,
  getNavForLocale
} = require('../lib/i18n-admin');
const { rateLimitLogin, adminIpAllowlist, getClientIp, parseAdminIpAllowlist } = require('../middleware/security');
const { attachCsrf, requireCsrf, rotateCsrfToken } = require('../middleware/csrf');
const { qrDataUrl } = require('../lib/mfa');
const notifications = require('../lib/notifications');
const events = require('../lib/events');
const { adminUrl, getPublicStatus, canToggleModeFromAdmin, isProductionMode } = require('../lib/appMode');
const appModeStore = require('../lib/appModeStore');
const { resolveAdminAccess, hasFullSystemAccess } = require('../lib/adminPermissions');
const florencia = require('../lib/florencia');
const informes = require('../lib/informes');
const siteAlerts = require('../lib/siteAlerts');

function buildAdminAttentionInbox(storeRef, locale = 'es') {
  const inbox = [];
  const pendingTransfers = storeRef.getAllRequests().filter((r) => r.paymentStatus === 'pending_transfer');
  const dispatchQueue = storeRef.getAdminDispatchQueue(locale);
  const contractStats = storeRef.getContractStats();
  const openComplaints = (storeRef.COMPLAINTS || []).filter((c) => c.status !== 'resuelto');
  const pendingPayouts = storeRef.getPayments().filter(
    (p) => p.status === 'completed' && p.payoutStatus !== 'pagado' && p.payoutStatus !== 'n/a'
  );

  pendingTransfers.slice(0, 8).forEach((r) => {
    inbox.push({
      type: 'transfer',
      urgency: 'high',
      tab: 'pagos',
      title: `Confirmar transferencia · ${r.serviceName || 'Servicio'}`,
      body: `${r.clientName || 'Cliente'} · ${storeRef.formatCLP(r.amountDue || 0)}`,
      actionLabel: 'Ir a Pagos'
    });
  });
  dispatchQueue.slice(0, 8).forEach((r) => {
    inbox.push({
      type: 'dispatch',
      urgency: 'high',
      tab: 'solicitudes',
      title: `Pedido sin socio · ${r.serviceName || 'Servicio'}`,
      body: `${r.clientName || 'Cliente'} · ${(r.eligibleProviders || []).length} socio(s) elegible(s)`,
      actionLabel: 'Asignar'
    });
  });
  if ((contractStats.pending_review || 0) > 0 || (contractStats.needs_info || 0) > 0) {
    inbox.push({
      type: 'contracts',
      urgency: 'medium',
      tab: 'contratos',
      title: 'Contratos de socios por revisar',
      body: `${contractStats.pending_review || 0} en revisión · ${contractStats.needs_info || 0} con antecedentes pendientes`,
      actionLabel: 'Revisar'
    });
  }
  pendingPayouts.slice(0, 5).forEach((p) => {
    inbox.push({
      type: 'payout',
      urgency: 'medium',
      tab: 'proveedores',
      title: `Marcar pago a socio · ${p.providerName || 'Socio'}`,
      body: storeRef.formatCLP(p.providerPayout || 0),
      actionLabel: 'Ir a Socios'
    });
  });
  try {
    const refunds = storeRef.getAdminRefundQueue({ status: 'open', limit: 8 });
    refunds.forEach((r) => {
      inbox.push({
        type: 'refund',
        urgency: 'high',
        tab: 'pagos',
        title: `Devolución pendiente · ${r.serviceName || 'Servicio'}`,
        body: `${r.clientName || 'Cliente'} · ${storeRef.formatCLP(r.refundAmount || 0)} · ${r.refundScheduledDate || r.refundStatus}`,
        actionLabel: 'Procesar',
        requestId: r.id
      });
    });
  } catch (_) { /* ignore */ }
  openComplaints.slice(0, 5).forEach((c) => {
    inbox.push({
      type: 'complaint',
      urgency: 'medium',
      tab: 'reclamos',
      title: c.subject || 'Reclamo abierto',
      body: `${c.clientName || 'Cliente'} · ${String(c.status || '').replace(/_/g, ' ')}`,
      actionLabel: 'Ver reclamo'
    });
  });
  try {
    const authAccessWatch = require('../lib/agents/authAccessWatch');
    const auth = authAccessWatch.summarizeRecentFailures(storeRef, { minutes: 180, limit: 6 });
    if (auth.total > 0) {
      const top = Object.entries(auth.byEvent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([ev, n]) => `${ev}×${n}`)
        .join(' · ');
      inbox.push({
        type: 'auth_access',
        urgency: auth.byEvent.registro_fail || auth.byEvent.verify_mail_issue ? 'high' : 'medium',
        tab: 'seguridad',
        title: `Accesos con error · última 3 h (${auth.total})`,
        body: top || 'Revisa login y registro',
        actionLabel: 'Ver seguridad'
      });
    }
  } catch (_) { /* ignore */ }
  try {
    const op = storeRef.getOperationalDiagnostics();
    op.issues.filter((i) => i.severity === 'high').slice(0, 6).forEach((issue) => {
      inbox.push({
        type: 'ops',
        urgency: 'high',
        tab: 'solicitudes',
        title: `Ops · ${issue.code}`,
        body: `${issue.clientName || 'Cliente'} · ${issue.serviceName || 'Servicio'} — ${issue.hint || ''}`,
        actionLabel: 'Diagnóstico',
        requestId: issue.requestId
      });
    });
  } catch (_) { /* ignore */ }
  return inbox;
}

router.use(adminIpAllowlist());
router.use(attachAdminAccess);
router.use(attachCsrf);
  // Mutaciones admin (excepto login/MFA públicos y sync de backup por token) requieren CSRF.
router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const p = req.path || '';
  if (p === '/backups/github-sync' || p === '/backups/export-encrypted') return next();
  if (
    p === '/login'
    || p === '/mfa'
    || p === '/mfa/setup'
    || p.startsWith('/mfa/')
  ) {
    return requireCsrf(req, res, next);
  }
  if (req.session?.user?.role === 'admin') {
    return requireCsrf(req, res, next);
  }
  return next();
});

const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;
const MFA_PENDING_MS = 5 * 60 * 1000;

function completeAdminSession(req, user, done) {
  const finish = () => {
    // Admin no usa correo activo: marcar verificado al entrar (solo MFA / Authenticator)
    if (user && user.role === 'admin' && !user.emailVerifiedAt) {
      store.forceVerifyEmail(user.id).catch(() => {});
    }
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    refreshSessionAdminAccess(req, user);
    req.session.isAdminSession = true;
    req.session.adminMfaVerified = true;
    delete req.session.pendingAdminMfa;
    if (req.session.cookie) {
      req.session.cookie.maxAge = ADMIN_SESSION_MS;
    }
    if (typeof done === 'function') done();
  };
  if (typeof req.session.regenerate === 'function') {
    req.session.regenerate((err) => {
      if (err) console.error('[session] regenerate', err.message);
      finish();
    });
  } else {
    finish();
  }
}

function getPendingMfa(req) {
  const pending = req.session.pendingAdminMfa;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    delete req.session.pendingAdminMfa;
    return null;
  }
  return pending;
}

function adminDbNotReadyMessage(req) {
  const uptime = process.uptime();
  const initErr = global.__ziloInitError;
  if (uptime < 50 && !initErr) {
    return 'La plataforma está arrancando. Espera 30–60 segundos y recarga esta página.';
  }
  if (initErr) {
    return `Base de datos: ${initErr}. Si la BD está vacía, importa db/fandez-demo.sql en phpMyAdmin y redeploya.`;
  }
  let msg = 'La base de datos no está lista. Importa db/fandez-demo.sql en phpMyAdmin o ejecuta npm run db:setup en el servidor.';
  const appUrl = String(process.env.APP_URL || '').trim();
  if (appUrl.includes('www.') && !String(req.get('host') || '').startsWith('www.')) {
    msg += ` Usa también: ${appUrl.replace(/\/$/, '')}${adminUrl('/login')}`;
  }
  return msg;
}

/** Destino post-login seguro (solo /app o /instalar-admin). */
function safeAdminNext(raw) {
  const s = String(raw || '').trim();
  if (!s || s.includes('://') || s.includes('//') || s.includes('\\') || s.includes('..')) return null;
  let pathOnly = s.startsWith('/') ? s : `/${s}`;
  const adminBase = require('../lib/appMode').getAdminBasePath();
  if (pathOnly === adminBase || pathOnly.startsWith(`${adminBase}/`)) {
    pathOnly = pathOnly.slice(adminBase.length) || '/';
  }
  const bare = pathOnly.split('?')[0].split('#')[0] || '/';
  if (bare === '/app' || bare === '/instalar-admin') return adminUrl(bare);
  return null;
}

function rememberAdminNext(req, raw) {
  const next = safeAdminNext(raw || req.query?.next || req.body?.next);
  if (next) req.session.adminNext = next;
  return next || req.session.adminNext || null;
}

function consumeAdminNext(req, fallback = null) {
  const next = req.session.adminNext || fallback;
  delete req.session.adminNext;
  return next || adminUrl();
}

router.get('/login', (req, res) => {
  rememberAdminNext(req, req.query?.next);
  if (req.session.user?.role === 'admin' && req.session.adminMfaVerified) {
    return res.redirect(consumeAdminNext(req, adminUrl()));
  }
  if (!store.isReady()) {
    return res.render('admin/login', {
      title: 'Admin — Fandez',
      error: adminDbNotReadyMessage(req),
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
      nextPath: req.session.adminNext || ''
    });
  }
  const expired = req.query.expired === '1';
  res.render('admin/login', {
    title: 'Admin — Fandez',
    error: expired ? 'La verificación MFA expiró. Ingresa nuevamente.' : null,
    csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
    nextPath: req.session.adminNext || ''
  });
});

router.post('/login', rateLimitLogin(8), async (req, res) => {
  rememberAdminNext(req, req.body?.next || req.query?.next);
  if (!store.isReady()) {
    return res.render('admin/login', {
      title: 'Admin — Fandez',
      error: adminDbNotReadyMessage(req),
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
      nextPath: req.session.adminNext || ''
    });
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const result = await store.authenticateUser(email, password, { allowedRoles: ['admin'] });

  if (result.error === 'wrong_portal') {
    store.logSecurityEvent('admin_login_wrong_role', email, req);
    require('../lib/agents/authAccessWatch').reportLoginError({
      store, req, email, reason: 'wrong_portal'
    }).catch(() => {});
    return res.render('admin/login', {
      title: 'Admin — Fandez',
      error: 'Credenciales no válidas para administración.',
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
      nextPath: req.session.adminNext || ''
    });
  }

  if (result.error === 'blocked') {
    store.logSecurityEvent('admin_login_blocked', email, req);
    require('../lib/agents/authAccessWatch').reportLoginError({
      store, req, email, reason: 'blocked'
    }).catch(() => {});
    return res.render('admin/login', {
      title: 'Admin — Fandez',
      error: 'Esta cuenta está desactivada.',
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
      nextPath: req.session.adminNext || ''
    });
  }

  if (result.error) {
    store.logSecurityEvent('admin_login_fail', email, req);
    require('../lib/agents/authAccessWatch').reportLoginError({
      store, req, email, reason: 'admin_login_fail'
    }).catch(() => {});
    return res.render('admin/login', {
      title: 'Admin — Fandez',
      error: 'Credenciales incorrectas.',
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
      nextPath: req.session.adminNext || ''
    });
  }

  const user = result.user;
  const access = resolveAdminAccess(user);
  const mfaEnabled = store.isMfaEnabled(user.id);
  // En producción todo admin debe configurar MFA.
  const mustSetupMfa = isProductionMode() && !mfaEnabled;

  if (mfaEnabled) {
    req.session.pendingAdminMfa = {
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + MFA_PENDING_MS
    };
    delete req.session.user;
    delete req.session.adminMfaVerified;
    rotateCsrfToken(req);
    store.logSecurityEvent('admin_login_mfa_required', email, req);
    return res.redirect(adminUrl('/mfa'));
  }

  if (mustSetupMfa) {
    completeAdminSession(req, user, () => {
      rotateCsrfToken(req);
      store.logSecurityEvent('admin_login_mfa_setup_required', email, req);
      res.redirect(adminUrl('/mfa/setup') + '?required=1');
    });
    return;
  }

  completeAdminSession(req, user, () => {
    rotateCsrfToken(req);
    store.logSecurityEvent('admin_login_ok', email, req);
    res.redirect(consumeAdminNext(req, adminUrl()));
  });
});

router.get('/mfa', (req, res) => {
  const pending = getPendingMfa(req);
  if (!pending) {
    return res.redirect(adminUrl('/login'));
  }
  res.render('admin/mfa', {
    title: 'Verificación MFA — Fandez',
    email: pending.email,
    error: null,
    csrfToken: require('../middleware/csrf').ensureCsrfToken(req)
  });
});

router.post('/mfa', rateLimitLogin(6), async (req, res) => {
  const pending = getPendingMfa(req);
  if (!pending) {
    return res.redirect(adminUrl('/login') + '?expired=1');
  }

  const code = req.body.code;
  if (!(await store.verifyMfaCode(pending.userId, code))) {
    store.logSecurityEvent('admin_mfa_fail', pending.email, req);
    return res.render('admin/mfa', {
      title: 'Verificación MFA — Fandez',
      email: pending.email,
      error: 'Código incorrecto o expirado.',
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req)
    });
  }

  const user = store.getUserById(pending.userId);
  if (!user) {
    delete req.session.pendingAdminMfa;
    return res.redirect(adminUrl('/login'));
  }

  completeAdminSession(req, user, () => {
    rotateCsrfToken(req);
    store.logSecurityEvent('admin_mfa_ok', user.email, req);
    res.redirect(consumeAdminNext(req, adminUrl()));
  });
});

router.get('/mfa/setup', requireRole('admin'), async (req, res) => {
  const status = store.getAdminMfaStatus(req.session.user.id);
  if (status.enabled) {
    return res.redirect(adminUrl() + '?tab=seguridad');
  }

  const setup = await store.beginMfaSetup(req.session.user.id);
  if (setup.error) {
    return res.redirect(adminUrl() + '?tab=seguridad');
  }

  const qr = await qrDataUrl(setup.otpauthUrl);
  res.render('admin/mfa-setup', {
    title: 'Activar MFA — Fandez',
    qrDataUrl: qr,
    secret: setup.secret,
    email: req.session.user.email,
    error: null,
    csrfToken: require('../middleware/csrf').ensureCsrfToken(req)
  });
});

router.post('/mfa/setup', requireRole('admin'), async (req, res) => {
  const result = await store.confirmMfaSetup(req.session.user.id, req.body.code);
  if (result.error) {
    return res.status(400).render('admin/mfa-setup', {
      title: 'Activar MFA — Fandez',
      qrDataUrl: null,
      secret: null,
      email: req.session.user.email,
      error: result.error,
      needsRestart: true,
      csrfToken: require('../middleware/csrf').ensureCsrfToken(req)
    });
  }

  req.session.adminMfaVerified = true;
  rotateCsrfToken(req);
  store.logSecurityEvent('admin_mfa_enabled', req.session.user.email, req);
  res.redirect(adminUrl('?tab=seguridad&mfa=enabled'));
});

router.post('/mfa/disable', requireRole('admin'), async (req, res) => {
  const { password, code } = req.body;
  const result = await store.disableMfa(req.session.user.id, password, code);
  if (result.error) {
    return res.redirect(adminUrl('?tab=seguridad&mfa_error=' + encodeURIComponent(result.error)));
  }

  delete req.session.adminMfaVerified;
  store.logSecurityEvent('admin_mfa_disabled', req.session.user.email, req);
  res.redirect(adminUrl('?tab=seguridad&mfa=disabled'));
});

router.get('/app.webmanifest', (req, res) => {
  // Debe ser público (sin sesión): Chrome descarga el manifest sin cookies.
  // La URL sigue bajo ADMIN_PATH (no indexada / no enlazada en la landing).
  const base = adminUrl();
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.json({
    id: `${base}/app`,
    name: 'Fandez Admin',
    short_name: 'Fandez Admin',
    description: 'Panel privado de alertas y operaciones Fandez. No público.',
    lang: 'es-CL',
    start_url: `${base}/app?source=pwa-admin`,
    scope: base.endsWith('/') ? base : `${base}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    icons: [
      { src: '/icons/fandez-admin-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/fandez-admin-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/fandez-admin-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    prefer_related_applications: false,
    related_applications: []
  });
});

router.get('/app', requireRole('admin'), (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.render('admin/ops-app', {
    title: 'Fandez Admin',
    adminBase: adminUrl(),
    csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
    user: req.session.user
  });
});

router.get('/instalar-admin', requireRole('admin'), (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const base = adminUrl();
  const origin = String(process.env.APP_URL || company.appUrl || 'https://www.fandez.cl').replace(/\/$/, '');
  res.render('admin/ops-install', {
    title: 'Instalar Fandez Admin',
    adminBase: base,
    installUrl: `${origin}${base}/app`,
    user: req.session.user
  });
});

router.get('/ops-inbox', requireRole('admin'), requireAdminPermission('alertas.view', 'informes.view'), async (req, res) => {
  try {
    const opsInbox = require('../lib/agents/opsInbox');
    const limit = parseInt(req.query.limit, 10) || 80;
    const items = await opsInbox.listRecent({ limit });
    const open = items.filter((i) => i.status === 'open').length;
    res.json({ success: true, open, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ops-inbox/:id/resolve', requireRole('admin'), requireAdminPermission('alertas.manage', 'informes.view'), async (req, res) => {
  try {
    const opsInbox = require('../lib/agents/opsInbox');
    const item = await opsInbox.resolve(req.params.id, { byUserId: req.session.user.id });
    store.logSecurityEvent('ops_inbox_resolved', req.params.id, req);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', requireRole('admin'), async (req, res) => {
  try {
  if (!store.isReady()) {
    return res.status(503).render('error', {
      title: 'Base de datos',
      message: 'La base de datos aún no está lista. Espera unos segundos y recarga.',
      code: 503
    });
  }

  await store.reloadFromDatabase();

  const allRequests = store.getAllRequests();
  const providers = store.USERS.filter(u => u.role === 'provider');
  const clients = store.USERS.filter(u => u.role === 'client');
  const onlineCount = providers.filter(p => p.online).length;
  const adminStats = store.getAdminStats();
  const pricing = store.getPricingConfig();
  const access = req.adminAccess || store.resolveAdminAccess(store.getUserById(req.session.user.id));
  const requestedTab = req.query.tab || null;
  const initialTab = requestedTab && canAccessPanel(access, requestedTab)
    ? requestedTab
    : getFirstAccessiblePanel(access);

  const stats = {
    totalRequests: allRequests.length,
    activeRequests: allRequests.filter(r => ['searching', 'assigned', 'in_progress'].includes(r.status)).length,
    completedRequests: allRequests.filter(r => r.status === 'completed').length,
    onlineProviders: onlineCount,
    totalProviders: providers.length,
    totalClients: clients.length,
    activeServices: store.getActiveServices().length,
    totalServices: store.SERVICES.length,
    ...adminStats
  };

  res.render('admin/dashboard', {
    title: 'Fandez — Admin',
    user: req.session.user,
    stats,
    services: localizeServices(store.SERVICES, req.t),
    modules: store.getModules(),
    promos: store.getAllPromos(),
    crmLeads: store.getCrmLeads(),
    crmStats: store.getCrmStats(),
    crmStages: store.CRM_PIPELINE_STAGES,
    clientModules: localizeModules(store.getModulesByAudience('client'), req.t),
    providerModules: localizeModules(store.getModulesByAudience('provider'), req.t),
    coverageRegions: store.getCoverageForAdmin(),
    coverageStats: store.getCoverageStats(),
    coverageInterest: store.getCoverageInterest(40),
    coverageInterestStats: store.getCoverageInterestStats(),
    requests: allRequests.slice(0, 30),
    payments: store.getPayments(),
    payouts: store.getProviderPayouts(),
    providersDirectory: store.getAdminProvidersDirectory(),
    pendingTransfers: store.getAllRequests().filter(r => r.paymentStatus === 'pending_transfer'),
    refundQueue: store.getAdminRefundQueue({ status: 'open', limit: 60 }),
    dispatchQueue: store.getAdminDispatchQueue(req.locale || 'es'),
    csrfToken: require('../middleware/csrf').ensureCsrfToken(req),
    complaints: store.COMPLAINTS,
    chats: store.CHATS,
    consents: store.consentRecords.slice(0, 20),
    securityLogs: store.securityLogs.slice(0, 25),
    providers,
    demoAccounts: store.getDemoAccounts(),
    company,
    pricing,
    formatCLP: store.formatCLP,
    backupConfig: await backup.loadConfigAsync(),
    backups: await backup.listBackups(),
    backupRetention: backup.getRetentionSummary(),
    githubBackupStatus: typeof backup.githubStatus === 'function' ? backup.githubStatus() : backup.githubStatus,
    formatBytes: backup.formatBytes,
    appVersion: getAppVersionInfo(),
    mfaStatus: store.getAdminMfaStatus(req.session.user.id),
    mfaMessage: req.query.mfa || null,
    mfaError: req.query.mfa_error || null,
    financialReport: store.getFinancialReport(),
    clientIp: getClientIp(req),
    adminIpAllowlist: parseAdminIpAllowlist(),
    dteDocuments: store.getAllDteDocuments().slice(0, 40),
    dteStatus: events.getDteStatus(),
    notificationStats: notifications.getStats(),
    recentNotifications: notifications.getRecent(30),
    providerContracts: store.getAllProviderContracts(),
    contractStats: store.getContractStats(),
    documentCatalog: require('../lib/contracts').DOCUMENT_CATALOG,
    listProviderReviewDocuments: store.listProviderReviewDocuments,
    adminNav: getNavForLocale(access, req.t),
    adminStrings: getAdminStrings(req.t),
    adminAccess: access,
    adminTeam: store.getAdminTeamUsers(),
    adminProfiles: getProfilesList(),
    adminPermissionGroups: getPermissionGroups(),
    managedUsers: store.getManagedUsers({ limit: 30 }),
    florenciaConnections: florencia.connectionsStatus(),
    canAccessPanel: (panelId) => canAccessPanel(access, panelId),
    initialTab,
    attentionInbox: buildAdminAttentionInbox(store, req.locale || 'es'),
    serviceBriefs: await require('../lib/serviceBriefs').listBriefs({ limit: 100 }),
    briefStatuses: require('../lib/serviceBriefs').STATUSES
  });
  } catch (err) {
    console.error('[admin/dashboard]', err.message);
    if (err.stack) console.error(err.stack);
    return res.status(500).render('error', {
      title: 'Error en el panel',
      message: 'No se pudo cargar el panel de administración. Si acabas de actualizar, redeploya la app completa en Hostinger.',
      code: 500,
      retryPath: req.originalUrl || '/admin'
    });
  }
});

// ——— Informes de agentes (Sofía / Clara / Florencia) ———

router.get('/informes', requireRole('admin'), requireAdminPermission('informes.view'), async (req, res) => {
  try {
    const date = req.query.date ? new Date(`${req.query.date}T12:00:00`) : new Date();
    const bundle = await informes.buildInformesBundle(store, {
      date: Number.isFinite(date.getTime()) ? date : new Date()
    });
    res.json({ success: true, ...bundle });
  } catch (err) {
    console.error('[admin/informes]', err.message);
    res.status(500).json({ success: false, error: err.message || 'No se pudo generar el informe' });
  }
});

router.get('/informes/ops', requireRole('admin'), requireAdminPermission('informes.view'), async (req, res) => {
  try {
    const date = req.query.date ? new Date(`${req.query.date}T12:00:00`) : new Date();
    const ops = await informes.buildDailyOpsReport(store, { date });
    res.json({ success: true, ops });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/informes/finance', requireRole('admin'), requireAdminPermission('informes.view'), (req, res) => {
  try {
    const date = req.query.date ? new Date(`${req.query.date}T12:00:00`) : new Date();
    const finance = informes.buildWeeklyFinanceReportWithDecisions(store, { date });
    res.json({ success: true, finance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/informes/finance/notify-founder', requireRole('admin'), requireAdminPermission('informes.view'), requireFounderDecision, async (req, res) => {
  try {
    const date = req.body?.date ? new Date(`${req.body.date}T12:00:00`) : new Date();
    const finance = informes.buildWeeklyFinanceReportWithDecisions(store, { date });
    const clara = require('../lib/agents/clara');
    const result = await clara.notifyFounderDecisionPack(finance);
    store.logSecurityEvent('clara_decision_pack_notified', `${finance.decisionCount || 0} items`, req);
    res.json({ success: true, result, decisionCount: finance.decisionCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/informes/ops/notify-founder', requireRole('admin'), requireAdminPermission('informes.view'), requireFounderDecision, async (req, res) => {
  try {
    const date = req.body?.date ? new Date(`${req.body.date}T12:00:00`) : new Date();
    const founderAlerts = require('../lib/agents/founderAlerts');
    const result = await founderAlerts.sendDailyDigest(store, { date, force: true });
    store.logSecurityEvent('sofia_daily_digest_notified', result.date || 'today', req);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/informes/ops/notify-census', requireRole('admin'), requireAdminPermission('informes.view'), requireFounderDecision, async (req, res) => {
  try {
    const founderAlerts = require('../lib/agents/founderAlerts');
    const result = await founderAlerts.sendUserCensus(store);
    store.logSecurityEvent('sofia_user_census_notified', `${result.census?.providers || 0} socios`, req);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(
  '/solicitudes/:requestId/materials/:materialId/review',
  requireRole('admin'),
  requireAdminPermission('solicitudes.manage', 'finanzas.manage', 'pagos.manage'),
  requireFounderDecision,
  (req, res) => {
    const decision = req.body?.decision || req.body?.status;
    const reason = req.body?.reason || '';
    const result = store.resolveSiteMaterialReview(req.params.requestId, req.params.materialId, {
      decision,
      reason,
      actorEmail: req.session.user?.email
    });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    store.logSecurityEvent(
      'material_review_resolved',
      `${req.params.requestId}:${req.params.materialId}:${decision}`,
      req
    );
    res.json({ success: true, material: result.material, requestId: req.params.requestId });
  }
);

router.get('/informes/marketing', requireRole('admin'), requireAdminPermission('informes.view'), (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;
    const month = parseInt(req.query.month, 10) || 9;
    const marketing = informes.buildPartnerMarketingCalendar({ year, month });
    res.json({ success: true, marketing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/florencia/calendar', requireRole('admin'), requireAdminPermission('florencia.view', 'informes.view'), (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;
    const month = parseInt(req.query.month, 10) || 9;
    const marketing = informes.buildPartnerMarketingCalendar({ year, month });
    res.json({ success: true, marketing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ——— Mensajes alerta (clientes / socios / todos) ———

router.get('/alertas', requireRole('admin'), requireAdminPermission('alertas.view'), async (req, res) => {
  try {
    const alerts = await siteAlerts.listAlerts();
    res.json({
      success: true,
      alerts,
      audiences: Object.values(siteAlerts.AUDIENCES)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/alertas', requireRole('admin'), requireAdminPermission('alertas.manage'), async (req, res) => {
  try {
    let imageUrl = req.body.imageUrl;
    if (req.body.imageDataUrl) {
      imageUrl = await siteAlerts.saveImageFromDataUrl(req.body.imageDataUrl);
    }
    if (req.body.clearImage) imageUrl = null;
    const payload = {
      id: req.body.id || undefined,
      audience: req.body.audience,
      title: req.body.title,
      message: req.body.message,
      enabled: req.body.enabled !== false && req.body.enabled !== 'false' && req.body.enabled !== 0,
      tone: req.body.tone,
      dismissible: req.body.dismissible !== false && req.body.dismissible !== 'false',
      showOnAuth: req.body.showOnAuth !== false && req.body.showOnAuth !== 'false',
      showOnApp: req.body.showOnApp !== false && req.body.showOnApp !== 'false'
    };
    if (imageUrl !== undefined) payload.imageUrl = imageUrl;
    const alert = await siteAlerts.upsertAlert(payload);
    store.logSecurityEvent('site_alert_upsert', `${alert.audience}:${alert.id}`, req);
    res.json({ success: true, alert });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/alertas/:id/toggle', requireRole('admin'), requireAdminPermission('alertas.manage'), async (req, res) => {
  try {
    const enabled = req.body.enabled !== false && req.body.enabled !== 'false' && req.body.enabled !== 0;
    const alert = await siteAlerts.setEnabled(req.params.id, enabled);
    store.logSecurityEvent('site_alert_toggle', `${alert.id}:${enabled}`, req);
    res.json({ success: true, alert });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/alertas/:id', requireRole('admin'), requireAdminPermission('alertas.manage'), async (req, res) => {
  try {
    await siteAlerts.deleteAlert(req.params.id);
    store.logSecurityEvent('site_alert_delete', req.params.id, req);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ——— Florencia IA: marketing con aprobación humana ———

router.get('/florencia/items', requireRole('admin'), requireAdminPermission('florencia.view'), async (req, res) => {
  try {
    const items = await florencia.listItems({
      status: req.query.status || undefined,
      channel: req.query.channel || undefined,
      limit: req.query.limit || 200
    });
    res.json({ success: true, items, connections: florencia.connectionsStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/florencia/generate-plan', requireRole('admin'), requireAdminPermission('florencia.manage'), async (req, res) => {
  try {
    const result = await florencia.generatePlan(store, {
      objective: req.body.objective,
      audience: req.body.audience,
      budget: req.body.budget,
      days: req.body.days
    });
    store.logSecurityEvent('florencia_plan_generated', `${result.items.length} piezas`, req);
    req.app.get('io')?.to('aland_admin').emit('florencia_update', { type: 'plan', count: result.items.length });
    res.json({ success: true, ...result });
    if (req.body.autoImages !== false && req.body.autoImages !== 'false') {
      const io = req.app.get('io');
      (async () => {
        for (const item of result.items.filter((entry) => entry.content?.imagePrompt)) {
          try {
            const updated = await florencia.generateImage(item);
            io?.to('aland_admin').emit('florencia_update', { type: 'image', item: updated });
          } catch (imageError) {
            console.error(`[florencia-image] ${item.id}:`, imageError.message);
          }
        }
      })().catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/florencia/campaign-assets', requireRole('admin'), requireAdminPermission('florencia.manage'), async (req, res) => {
  try {
    const outcome = await florencia.generatePartnerCampaignSet();
    const results = outcome.results || outcome;
    store.logSecurityEvent('florencia_campaign_assets', `${results.length} piezas`, req);
    res.json({
      success: true,
      count: results.length,
      mode: outcome.mode || 'generated',
      sharp: Boolean(outcome.sharp),
      files: results.map((r) => r.file || path.basename(r.path)),
      urls: results.map((r) => r.url || `/uploads/marketing/campana-socios/${path.basename(r.path)}`),
      message: outcome.sharp === false
        ? 'Gráficas con logo oficial publicadas (piezas empaquetadas). Soft-refresh para verlas.'
        : 'Gráficas regeneradas con logo oficial Fandez (isotipo app).'
    });
  } catch (err) {
    console.error('[florencia/campaign-assets]', err.message);
    res.status(500).json({ success: false, error: err.message || 'No se pudieron generar las gráficas' });
  }
});

router.post('/florencia/items/:id/image', requireRole('admin'), requireAdminPermission('florencia.manage'), async (req, res) => {
  try {
    const item = await florencia.getItem(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Pieza no encontrada' });
    const updated = await florencia.generateImage(item, {
      extraInstructions: String(req.body?.notes || req.body?.extraInstructions || '').slice(0, 800)
    });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/florencia/chat', requireRole('admin'), requireAdminPermission('florencia.view'), async (req, res) => {
  try {
    const messages = await florencia.listChatMessages({
      itemId: req.query.itemId || null,
      limit: req.query.limit || 80
    });
    let item = null;
    if (req.query.itemId) item = await florencia.getItem(req.query.itemId);
    res.json({ success: true, messages, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/florencia/chat', requireRole('admin'), requireAdminPermission('florencia.manage'), async (req, res) => {
  try {
    const result = await florencia.chatWithFlorencia(store, {
      message: req.body.message,
      itemId: req.body.itemId || null
    });
    store.logSecurityEvent('florencia_chat', String(req.body.itemId || 'general').slice(0, 80), req);
    if (result.item) {
      req.app.get('io')?.to('aland_admin').emit('florencia_update', {
        type: result.regenerated ? 'image' : 'edit',
        item: result.item
      });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/florencia/items/:id', requireRole('admin'), requireAdminPermission('florencia.manage'), async (req, res) => {
  try {
    const content = req.body.content && typeof req.body.content === 'object'
      ? req.body.content
      : undefined;
    const item = await florencia.updateItem(req.params.id, {
      title: req.body.title,
      channel: req.body.channel,
      scheduledAt: req.body.scheduledAt,
      content
    });
    if (!item) return res.status(404).json({ success: false, error: 'Pieza no encontrada' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/florencia/items/:id/approve', requireRole('admin'), requireAdminPermission('florencia.approve'), requireFounderDecision, async (req, res) => {
  try {
    const item = await florencia.setStatus(req.params.id, 'approved', {
      approvedBy: req.session.user.id,
      approvedAt: new Date()
    });
    store.logSecurityEvent('florencia_item_approved', item.id, req);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/florencia/items/:id/reject', requireRole('admin'), requireAdminPermission('florencia.approve'), requireFounderDecision, async (req, res) => {
  try {
    const item = await florencia.setStatus(req.params.id, 'rejected', {
      error: String(req.body.reason || 'Rechazada por administración').slice(0, 1000)
    });
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/florencia/items/:id/publish', requireRole('admin'), requireAdminPermission('florencia.publish'), requireFounderDecision, async (req, res) => {
  try {
    const item = await florencia.publishItem(req.params.id, store);
    store.logSecurityEvent('florencia_item_published', `${item.channel}:${item.id}`, req);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});


router.get('/openai-usage', requireRole('admin'), requireAdminPermission('openai.usage.view'), async (req, res) => {
  try {
    const openaiUsage = require('../lib/openaiUsage');
    const summary = await openaiUsage.getUsageSummary({
      days: req.query.days || 30
    });
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/modo', requireRole('admin'), requireAdminPermission('seguridad.view', 'equipo.manage'), (req, res) => {
  res.json({ success: true, ...getPublicStatus(), suggestedAdminPath: require('../lib/appMode').suggestAdminPath() });
});

router.post('/modo', requireRole('admin'), requireAdminPermission('equipo.manage'), async (req, res) => {
  const access = req.adminAccess || {};
  if (!(access.isSuperAdmin || access.isFullAccess)) {
    return res.status(403).json({ success: false, error: 'Solo superadmin o admin.mod pueden cambiar el modo.' });
  }
  if (!canToggleModeFromAdmin()) {
    return res.status(403).json({
      success: false,
      error: 'El cambio desde admin está bloqueado. Usa APP_MODE en el servidor o ALLOW_APP_MODE_TOGGLE=true.'
    });
  }
  try {
    const status = await appModeStore.persistAppModeOverride(req.body.mode);
    store.logSecurityEvent('app_mode_change', status.mode, req);
    res.json({ success: true, ...status });
  } catch (err) {
    console.error('[admin/modo]', err.message);
    res.status(400).json({ success: false, error: err.message || 'No se pudo guardar el modo.' });
  }
});

router.get('/team/meta', requireRole('admin'), requireAdminPermission('equipo.view'), (req, res) => {
  res.json({ success: true, ...store.getAdminPermissionMeta(), team: store.getAdminTeamUsers() });
});

router.post('/team', requireRole('admin'), requireAdminPermission('equipo.manage'), async (req, res) => {
  const { name, email, password, profileId, permissions, isSuperAdmin, isFullAccess } = req.body;
  const result = await store.createAdminUser({
    name,
    email,
    password,
    profileId,
    permissions: Array.isArray(permissions) ? permissions : undefined,
    isSuperAdmin: isSuperAdmin === true || isSuperAdmin === 'true',
    isFullAccess: isFullAccess === true || isFullAccess === 'true' || profileId === 'admin.mod'
  }, req.session.user.id);

  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_team_create', email, req);
  res.json({ success: true, user: result.user });
});

router.put('/team/:id', requireRole('admin'), requireAdminPermission('equipo.manage'), async (req, res) => {
  const { name, profileId, permissions, isSuperAdmin, isFullAccess, password } = req.body;
  const current = store.getAdminTeamUsers().find((u) => u.id === req.params.id);
  const droppingFull =
    current &&
    (current.isSuperAdmin || current.isFullAccess) &&
    isSuperAdmin !== true &&
    isSuperAdmin !== 'true' &&
    isFullAccess !== true &&
    isFullAccess !== 'true' &&
    profileId !== 'superadmin' &&
    profileId !== 'admin.mod';

  if (req.params.id === req.session.user.id && droppingFull) {
    return res.status(400).json({ error: 'No puedes quitarte el acceso total a ti mismo.' });
  }

  const result = await store.updateAdminUserAccess(req.params.id, {
    name,
    profileId,
    permissions: Array.isArray(permissions) ? permissions : undefined,
    isSuperAdmin: isSuperAdmin === true || isSuperAdmin === 'true',
    isFullAccess: isFullAccess === true || isFullAccess === 'true' || profileId === 'admin.mod',
    password: password || undefined
  }, req.session.user.id);

  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_team_update', req.params.id, req);

  if (req.params.id === req.session.user.id) {
    const user = store.getUserById(req.session.user.id);
    refreshSessionAdminAccess(req, user);
  }

  res.json({ success: true, user: result.user });
});

router.post('/profiles', requireRole('admin'), requireAdminPermission('perfiles.manage', 'equipo.manage'), async (req, res) => {
  const result = await store.upsertAdminProfile({
    id: req.body.id || req.body.profileId,
    name: req.body.name,
    description: req.body.description,
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : undefined,
    isFullAccess: req.body.isFullAccess === true || req.body.isFullAccess === 'true'
  }, req.session.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_profile_upsert', result.profile?.id || '', req);
  res.json({ success: true, profile: result.profile, profiles: result.profiles });
});

router.post('/profiles/:id/delete', requireRole('admin'), requireAdminPermission('perfiles.manage', 'equipo.manage'), async (req, res) => {
  const result = await store.deleteAdminProfile(req.params.id, req.session.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('admin_profile_delete', req.params.id, req);
  res.json({ success: true, profiles: result.profiles });
});

router.get('/auditoria', requireRole('admin'), requireAdminPermission('seguridad.view'), async (req, res) => {
  const result = await store.getSecurityAuditLogs({
    q: req.query.q || '',
    event: req.query.event || '',
    from: req.query.from || '',
    to: req.query.to || '',
    limit: Number(req.query.limit) || 100,
    offset: Number(req.query.offset) || 0
  });
  res.json(result);
});

router.get('/auditoria/export.csv', requireRole('admin'), requireAdminPermission('seguridad.view'), async (req, res) => {
  const result = await store.getSecurityAuditLogs({
    q: req.query.q || '',
    event: req.query.event || '',
    from: req.query.from || '',
    to: req.query.to || '',
    limit: Math.min(2000, Number(req.query.limit) || 1000),
    offset: 0
  });
  store.logSecurityEvent('audit_export', `rows=${result.logs.length} by ${req.session.user.email}`, req);
  const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [
    'id,event,user,ip,createdAt,detail',
    ...result.logs.map((l) => [
      escape(l.id),
      escape(l.event),
      escape(l.user),
      escape(l.ip),
      escape(l.createdAt),
      escape(l.detail)
    ].join(','))
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fandez-auditoria-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${lines.join('\n')}`);
});

router.get('/dsar/buscar', requireRole('admin'), requireAdminPermission('datos.view', 'datos.manage', 'usuarios.view'), (req, res) => {
  const users = store.getManagedUsers({
    q: req.query.q || '',
    role: req.query.role || '',
    limit: Number(req.query.limit) || 20
  });
  res.json({ success: true, users });
});

router.get('/dsar/:userId', requireRole('admin'), requireAdminPermission('datos.manage', 'usuarios.manage'), (req, res) => {
  const result = store.buildUserDsarPackage(req.params.userId);
  if (result.error) return res.status(404).json({ error: result.error });
  store.logSecurityEvent('dsar_export', `${req.params.userId} by ${req.session.user.email}`, req);
  res.json(result);
});

router.get('/dsar/:userId/download.json', requireRole('admin'), requireAdminPermission('datos.manage', 'usuarios.manage'), (req, res) => {
  const result = store.buildUserDsarPackage(req.params.userId);
  if (result.error) return res.status(404).json({ error: result.error });
  store.logSecurityEvent('dsar_export_download', `${req.params.userId} by ${req.session.user.email}`, req);
  const filename = `fandez-dsar-${req.params.userId}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(result.package, null, 2));
});

router.post('/dsar/:userId/anonimizar', requireRole('admin'), requireAdminPermission('datos.manage'), async (req, res) => {
  const confirm = String(req.body?.confirm || '').trim().toUpperCase();
  if (confirm !== 'ANONIMIZAR') {
    return res.status(400).json({ error: 'Escribe ANONIMIZAR para confirmar.' });
  }
  const result = await store.anonymizeUserAccount(
    req.params.userId,
    {
      reason: req.body?.reason || '',
      actorEmail: req.session.user.email,
      actorId: req.session.user.id
    },
    req
  );
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true, user: result.user });
});

router.get('/usuarios', requireRole('admin'), requireAdminPermission('usuarios.view', 'usuarios.manage'), (req, res) => {
  const users = store.getManagedUsers({
    q: req.query.q || '',
    role: req.query.role || '',
    limit: Number(req.query.limit) || 40
  });
  res.json({ success: true, users });
});

router.get('/usuarios/:id/diagnostico', requireRole('admin'), requireAdminPermission('usuarios.view', 'usuarios.manage'), (req, res) => {
  const result = store.getUserSupportDossier(req.params.id, {
    limitRequests: Number(req.query.requests) || 12,
    limitLogs: Number(req.query.logs) || 40
  });
  if (result.error) return res.status(404).json({ error: result.error });
  store.logSecurityEvent('support_dossier_view', `${req.params.id} by ${req.session.user.email}`, req);
  res.json(result);
});

router.post('/usuarios/:id/soporte/nota', requireRole('admin'), requireAdminPermission('usuarios.manage'), (req, res) => {
  const result = store.addSupportNote(req.params.id, req.body?.note || req.body?.text, req.session.user.id, req);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

router.post('/usuarios/:id', requireRole('admin'), requireAdminPermission('usuarios.manage'), (req, res) => {
  const result = store.adminUpdateManagedUser(req.params.id, req.body || {}, req.session.user.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('usuarios_manage', req.params.id, req);
  res.json({ success: true, user: result.user });
});

router.post('/team/:id/toggle', requireRole('admin'), requireAdminPermission('equipo.manage'), (req, res) => {
  const { active } = req.body;
  const enable = active === true || active === 'true';

  if (req.params.id === req.session.user.id && !enable) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  }

  const user = store.setUserActive(req.params.id, enable);
  if (!user || user.role !== 'admin') return res.status(404).json({ error: 'Administrador no encontrado' });

  store.logSecurityEvent('admin_team_toggle', `${req.params.id}=${enable}`, req);
  res.json({ success: true, user: store.getAdminTeamUsers().find((u) => u.id === user.id) });
});

router.post('/contratos/:providerId/review', requireRole('admin'), requireAdminPermission('contratos.review'), (req, res) => {
  const { action, notes, rejectionReason, requestedDocs } = req.body;
  const result = store.reviewProviderContract(
    req.params.providerId,
    { action, notes, rejectionReason, requestedDocs },
    req.session.user.email
  );
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent(`contrato_${action}`, req.params.providerId, req);
  res.json({ success: true, provider: result.provider });
});

router.post('/contratos/:providerId/documentos/review', requireRole('admin'), requireAdminPermission('contratos.review'), (req, res) => {
  const { docKey, status, notes } = req.body || {};
  if (!['approved', 'rejected', 'needs_info'].includes(status)) {
    return res.status(400).json({ error: 'Estado de documento inválido.' });
  }
  const key = String(docKey || '');
  if (key.startsWith('kyc:')) {
    const type = key.slice(4);
    const result = store.setVerificationDocReview(
      req.params.providerId,
      type,
      { human: { status, notes: notes || '' } },
      req.session.user.email
    );
    if (result.error) return res.status(400).json({ error: result.error });
    store.logSecurityEvent(`kyc_doc_${status}`, `${req.params.providerId}:${type}`, req);
    return res.json({
      success: true,
      documents: store.listProviderReviewDocuments(req.params.providerId)
    });
  }
  const result = store.reviewContractDocument(
    req.params.providerId,
    key,
    { status, notes },
    req.session.user.email
  );
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent(`contrato_doc_${status}`, `${req.params.providerId}:${key}`, req);
  res.json({
    success: true,
    documents: store.listProviderReviewDocuments(req.params.providerId)
  });
});

router.post('/contratos/:providerId/ai-review', requireRole('admin'), requireAdminPermission('contratos.review'), async (req, res) => {
  const { reviewIdentityDocument } = require('../lib/documentReview');
  const provider = store.getUserById(req.params.providerId);
  if (!provider) return res.status(404).json({ error: 'Socio no encontrado' });
  const v = provider.verification || {};
  const tasks = [];
  const pushKyc = (type, url) => {
    if (!url || url === 'demo') return;
    tasks.push(reviewIdentityDocument({ url, docKey: type }).then((ai) => {
      store.setVerificationDocReview(req.params.providerId, type, { ai });
    }));
  };
  pushKyc('idFront', v.idCardFront);
  pushKyc('idBack', v.idCardBack);
  pushKyc('selfie', v.selfie);
  Object.entries(provider.providerContract?.documents || {}).forEach(([key, doc]) => {
    if (doc?.url) {
      tasks.push(reviewIdentityDocument({ url: doc.url, docKey: key }).then((ai) => {
        store.setContractDocumentAiReview(req.params.providerId, key, ai);
      }));
    }
  });
  (provider.providerContract?.technicalCerts || []).forEach((cert, idx) => {
    if (cert?.url) {
      tasks.push(reviewIdentityDocument({ url: cert.url, docKey: `technical_certs:${idx}` }).then((ai) => {
        store.setContractDocumentAiReview(req.params.providerId, `technical_certs:${idx}`, ai);
      }));
    }
  });
  await Promise.all(tasks);
  let representativeMatch = null;
  let erutValidation = null;
  try {
    representativeMatch = await store.runRepresentativeMatchValidation(req.params.providerId);
  } catch (err) {
    console.error('Rep match admin:', err.message);
  }
  try {
    erutValidation = await store.runErutValidation(req.params.providerId);
  } catch (err) {
    console.error('e-RUT admin:', err.message);
  }
  store.logSecurityEvent('contrato_ai_review', req.params.providerId, req);
  const fresh = store.getUserById(req.params.providerId);
  res.json({
    success: true,
    documents: store.listProviderReviewDocuments(req.params.providerId),
    representativeMatch: representativeMatch?.match || fresh?.providerContract?.representativeMatch || null,
    erutValidation: erutValidation?.validation || fresh?.providerContract?.erutValidation || null
  });
});

router.get('/contratos/:providerId', requireRole('admin'), requireAdminPermission('contratos.view'), (req, res) => {
  const provider = store.getAllProviderContracts().find((p) => p.id === req.params.providerId);
  if (!provider) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json({ success: true, provider });
});

router.get('/finanzas/export.csv', requireRole('admin'), requireAdminPermission('finanzas.export'), (req, res) => {
  const report = store.getFinancialReport();
  const payments = store.getPayments();
  const lines = [
    'id,servicio,cliente,socio,monto,comision,socio_pago,metodo,urgencia,estado,pagado_en'
  ];

  payments.forEach((p) => {
    const reqRow = store.getAllRequests().find((r) => r.id === p.id) || {};
    lines.push([
      p.id,
      csvEscape(p.serviceName),
      csvEscape(p.clientName),
      csvEscape(p.providerName),
      p.amount,
      p.commission,
      p.providerPayout,
      csvEscape(reqRow.paymentMethod || ''),
      csvEscape(p.urgencyTierLabel || ''),
      csvEscape(p.status),
      csvEscape(p.paidAt || '')
    ].join(','));
  });

  lines.push('');
  lines.push('Resumen');
  lines.push(`Visitas cobradas,${report.summary.visitsCollected}`);
  lines.push(`Recargos tarjeta,${report.summary.cardSurcharges}`);
  lines.push(`Comisión Fandez,${report.summary.appCommission}`);
  lines.push(`Pendiente socios,${report.summary.providerPending}`);
  lines.push(`Transferencias pendientes,${report.summary.pendingTransferCount}`);

  const acc = report.accounting || {};
  if (acc.pnl) {
    lines.push('');
    lines.push('Resultado (P&L)');
    lines.push(`Ingresos comisión,${acc.pnl.income.commission}`);
    lines.push(`Ingresos recargo,${acc.pnl.income.cardSurcharge}`);
    lines.push(`Gastos liquidaciones pagadas,${acc.pnl.expenses.providerPaid}`);
    lines.push(`Gastos compras SII,${acc.pnl.expenses.purchases}`);
    lines.push(`Resultado neto,${acc.pnl.netResult}`);
  }

  store.logSecurityEvent('finanzas_export', `${payments.length} filas`, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fandez-finanzas.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

router.get('/finanzas/balance.csv', requireRole('admin'), requireAdminPermission('finanzas.export'), (req, res) => {
  const pack = store.getAccountingPack();
  const lines = ['codigo,cuenta,tipo,debe,haber,saldo'];
  (pack.accountBalances || []).forEach((a) => {
    lines.push([a.code, csvEscape(a.name), a.type, a.debit, a.credit, a.balance].join(','));
  });
  lines.push('');
  lines.push('Balance general');
  lines.push(`Total activos,${pack.balanceSheet.totalAssets}`);
  lines.push(`Total pasivos,${pack.balanceSheet.totalLiabilities}`);
  lines.push(`Total patrimonio,${pack.balanceSheet.totalEquity}`);
  lines.push(`Resultado neto,${pack.pnl.netResult}`);

  store.logSecurityEvent('finanzas_balance_export', `${pack.accountBalances.length} cuentas`, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fandez-balance.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

router.post('/finanzas/compras', requireRole('admin'), requireAdminPermission('finanzas.manage'), (req, res) => {
  const finance = require('../lib/finance');
  const result = finance.purchases.upsertPurchaseInvoice(req.body || {});
  store.logSecurityEvent('finanzas_compra', result.invoice?.id || '', req);
  res.json(result);
});

router.post('/finanzas/compras/import', requireRole('admin'), requireAdminPermission('finanzas.manage'), (req, res) => {
  const finance = require('../lib/finance');
  let rows = req.body?.invoices || req.body?.rows || req.body;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch (_) { rows = []; }
  }
  const result = finance.purchases.importPurchaseInvoices(Array.isArray(rows) ? rows : []);
  store.logSecurityEvent('finanzas_compras_import', `${result.imported} facturas`, req);
  res.json(result);
});

router.post('/finanzas/compras/sync-sii', requireRole('admin'), requireAdminPermission('finanzas.manage'), async (req, res) => {
  const finance = require('../lib/finance');
  const result = await finance.purchases.syncPurchasesFromSii();
  store.logSecurityEvent('finanzas_sii_sync', result.success ? 'ok' : (result.error || 'fail'), req);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/finanzas/banco', requireRole('admin'), requireAdminPermission('finanzas.manage'), (req, res) => {
  const finance = require('../lib/finance');
  const result = finance.reconciliation.addBankMovement(req.body || {});
  store.logSecurityEvent('finanzas_banco', result.movement?.id || '', req);
  res.json(result);
});

router.post('/finanzas/banco/import', requireRole('admin'), requireAdminPermission('finanzas.manage'), (req, res) => {
  const finance = require('../lib/finance');
  let rows = req.body?.movements || req.body?.rows || req.body;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch (_) { rows = []; }
  }
  const result = finance.reconciliation.importBankMovements(Array.isArray(rows) ? rows : []);
  store.logSecurityEvent('finanzas_banco_import', `${result.imported} movs`, req);
  res.json(result);
});

router.post('/finanzas/conciliar', requireRole('admin'), requireAdminPermission('finanzas.manage'), (req, res) => {
  const finance = require('../lib/finance');
  const result = finance.reconciliation.autoReconcile(store.getPayments());
  store.logSecurityEvent('finanzas_conciliar', `${result.matched} matches`, req);
  res.json(result);
});

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.post('/dte/retry', requireRole('admin'), requireAdminPermission('documentos.manage'), async (req, res) => {
  const { requestId, phase } = req.body;
  if (!requestId || !phase) {
    return res.status(400).json({ error: 'Faltan requestId y phase' });
  }
  const result = await events.retryDte(requestId, phase);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('dte_retry', `${requestId}:${phase}`, req);
  res.json({ success: true, document: result.document });
});

router.post('/toggle-service', requireRole('admin'), requireAdminPermission('servicios.manage'), (req, res) => {
  const { serviceId, enabled } = req.body;
  const service = store.toggleService(serviceId, enabled === true || enabled === 'true');
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  store.logSecurityEvent('service_toggle', `${serviceId}=${enabled}`, req);
  req.app.get('io').emit('services_updated', { services: store.getActiveServices() });
  res.json({ success: true, service });
});

router.post('/toggle-module', requireRole('admin'), requireAdminPermission('modulos.manage'), (req, res) => {
  const { moduleId, enabled } = req.body;
  const mod = store.toggleModule(moduleId, enabled === true || enabled === 'true');
  if (!mod) return res.status(404).json({ error: 'Módulo no encontrado' });

  store.logSecurityEvent('module_toggle', `${moduleId}=${enabled}`, req);
  req.app.get('io').emit('modules_updated', { modules: store.MODULES });
  res.json({ success: true, module: mod });
});

router.post('/promos', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const result = store.upsertPromo({
    id: req.body.id,
    title: req.body.title,
    desc: req.body.desc || req.body.description,
    code: req.body.code,
    color: req.body.color,
    sortOrder: req.body.sortOrder,
    enabled: req.body.enabled,
    discountPercent: req.body.discountPercent,
    showBanner: req.body.showBanner,
    checkoutEnabled: req.body.checkoutEnabled
  });
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('promo_upsert', result.promo.id, req);
  res.json({ success: true, promo: result.promo, promos: store.getAllPromos() });
});

router.post('/promos/:id/toggle', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const promo = store.togglePromo(req.params.id, req.body.enabled === true || req.body.enabled === 'true');
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
  store.logSecurityEvent('promo_toggle', `${promo.id}=${promo.enabled}`, req);
  res.json({ success: true, promo, promos: store.getAllPromos() });
});

router.post('/promos/:id/delete', requireRole('admin'), requireAdminPermission('promos.manage'), (req, res) => {
  const result = store.deletePromo(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('promo_delete', req.params.id, req);
  res.json({ success: true, promos: store.getAllPromos() });
});

router.post('/crm', requireRole('admin'), requireAdminPermission('crm.manage'), (req, res) => {
  const result = store.upsertCrmLead(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('crm_upsert', result.lead.id, req);
  res.json({ success: true, lead: result.lead, leads: store.getCrmLeads(), stats: store.getCrmStats() });
});

router.post('/crm/:id/delete', requireRole('admin'), requireAdminPermission('crm.manage'), (req, res) => {
  const result = store.deleteCrmLead(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  store.logSecurityEvent('crm_delete', req.params.id, req);
  res.json({ success: true, leads: store.getCrmLeads(), stats: store.getCrmStats() });
});

router.get('/briefs', requireRole('admin'), requireAdminPermission('crm.view'), async (req, res) => {
  try {
    const briefs = require('../lib/serviceBriefs');
    const list = await briefs.listBriefs({ limit: 100 });
    res.json({ success: true, briefs: list, statuses: briefs.STATUSES, emptyAnswers: briefs.emptyAnswers() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/briefs', requireRole('admin'), requireAdminPermission('crm.manage'), async (req, res) => {
  try {
    const briefs = require('../lib/serviceBriefs');
    const result = await briefs.upsertBrief(req.body || {}, { userId: req.session.user.id });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    store.logSecurityEvent('service_brief_upsert', result.brief.id, req);
    const list = await briefs.listBriefs({ limit: 100 });
    res.json({ success: true, brief: result.brief, briefs: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/briefs/:id/delete', requireRole('admin'), requireAdminPermission('crm.manage'), async (req, res) => {
  try {
    const briefs = require('../lib/serviceBriefs');
    await briefs.deleteBrief(req.params.id);
    store.logSecurityEvent('service_brief_delete', req.params.id, req);
    const list = await briefs.listBriefs({ limit: 100 });
    res.json({ success: true, briefs: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/toggle-coverage', requireRole('admin'), requireAdminPermission('cobertura.manage'), (req, res) => {
  const { regionCode, communeCode, enabled, regionOnly } = req.body;
  const isEnabled = enabled === true || enabled === 'true';

  if (regionOnly && regionCode) {
    const region = store.toggleCoverageRegion(regionCode, isEnabled);
    if (!region) return res.status(404).json({ error: 'Región no encontrada' });
    store.logSecurityEvent('coverage_region_toggle', `${regionCode}=${isEnabled}`, req);
    return res.json({ success: true, region, stats: store.getCoverageStats() });
  }

  if (!regionCode || !communeCode) {
    return res.status(400).json({ error: 'Región y comuna requeridas' });
  }

  const result = store.toggleCoverageCommune(regionCode, communeCode, isEnabled);
  if (result?.error) return res.status(400).json({ error: result.error });
  if (!result) return res.status(404).json({ error: 'Comuna no encontrada' });

  store.logSecurityEvent('coverage_commune_toggle', `${regionCode}/${communeCode}=${isEnabled}`, req);
  res.json({ success: true, commune: result, stats: store.getCoverageStats() });
});

router.post('/toggle-user', requireRole('admin'), requireAdminPermission('demo.manage'), (req, res) => {
  const { userId, active } = req.body;
  const enable = active === true || active === 'true';

  if (userId === req.session.user.id && !enable) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta con la que iniciaste sesión.' });
  }

  const user = store.setUserActive(userId, enable);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  store.logSecurityEvent('user_toggle', `${userId}=${enable ? 'activo' : 'inactivo'}`, req);
  res.json({ success: true, id: user.id, active: user.active !== false });
});

router.post('/complaint/:id/status', requireRole('admin'), requireAdminPermission('reclamos.manage'), (req, res) => {
  const complaint = store.updateComplaintStatus(req.params.id, req.body.status);
  if (!complaint) return res.status(404).json({ error: 'Reclamo no encontrado' });
  store.logSecurityEvent('complaint_update', `${req.params.id}=${req.body.status}`, req);
  res.json({ success: true, complaint });
});

router.post('/payout/:requestId', requireRole('admin'), requireAdminPermission('pagos.manage'), (req, res) => {
  const req_ = store.markPayoutPaid(req.params.requestId);
  if (!req_) return res.status(404).json({ error: 'Solicitud no encontrada' });
  store.logSecurityEvent('payout_marked', req.params.requestId, req);
  res.json({ success: true, request: req_ });
});

router.get('/devoluciones', requireRole('admin'), requireAdminPermission('pagos.view', 'pagos.manage'), (req, res) => {
  const refunds = store.getAdminRefundQueue({
    status: req.query.status || 'open',
    limit: Number(req.query.limit) || 60
  });
  res.json({ success: true, refunds });
});

router.post('/devoluciones/:requestId', requireRole('admin'), requireAdminPermission('pagos.manage'), (req, res) => {
  const result = store.updateRefundStatus(
    req.params.requestId,
    {
      status: req.body?.status,
      notes: req.body?.notes,
      externalRef: req.body?.externalRef || req.body?.external_ref
    },
    req.session.user.email
  );
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true, refund: result.refund });
});

router.get('/solicitudes/:requestId/caso', requireRole('admin'), requireAdminPermission('solicitudes.view', 'pagos.view', 'usuarios.view'), (req, res) => {
  const result = store.getAdminRequestCase(req.params.requestId);
  if (result.error) return res.status(404).json({ error: result.error });
  store.logSecurityEvent('request_case_view', `${req.params.requestId} by ${req.session.user.email}`, req);
  res.json(result);
});

router.get('/backups/config', requireRole('admin'), requireAdminPermission('backups.view', 'backups.manage'), async (req, res) => {
  res.json({
    success: true,
    config: backup.loadConfig(),
    retention: backup.getRetentionSummary(),
    backups: await backup.listBackups()
  });
});

router.post('/backups/config', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const allowed = [
    'enabled', 'autoBackup', 'autoRetention', 'scheduleHour', 'scheduleMinute',
    'dailyRetentionDays', 'weeklyRetentionWeeks', 'monthlyRetentionMonths',
    'includeUploads', 'includeSecurityLogs'
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (key === 'enabled' || key === 'autoBackup' || key === 'autoRetention' || key === 'includeUploads' || key === 'includeSecurityLogs') {
      updates[key] = req.body[key] === true || req.body[key] === 'on' || req.body[key] === 'true';
    } else {
      updates[key] = req.body[key];
    }
  }
  if (updates.scheduleHour != null) updates.scheduleHour = Math.min(23, Math.max(0, parseInt(updates.scheduleHour, 10)));
  if (updates.scheduleMinute != null) updates.scheduleMinute = Math.min(59, Math.max(0, parseInt(updates.scheduleMinute, 10)));
  if (updates.dailyRetentionDays != null) updates.dailyRetentionDays = Math.min(90, Math.max(1, parseInt(updates.dailyRetentionDays, 10)));
  if (updates.weeklyRetentionWeeks != null) updates.weeklyRetentionWeeks = Math.min(52, Math.max(1, parseInt(updates.weeklyRetentionWeeks, 10)));
  if (updates.monthlyRetentionMonths != null) updates.monthlyRetentionMonths = Math.min(84, Math.max(1, parseInt(updates.monthlyRetentionMonths, 10)));

  const config = await backup.saveConfig(updates);
  store.logSecurityEvent('backup_config_update', JSON.stringify(updates), req);
  res.json({ success: true, config, retention: backup.getRetentionSummary(config) });
});

router.post('/backups/run', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  try {
    const result = await backup.createBackup(store, 'manual', req.session.user.email);
    const removed = await backup.applyRetention();
    store.logSecurityEvent('backup_manual', result.manifest.id, req);
    res.json({
      success: true,
      backup: result.manifest,
      github: result.github || null,
      removed,
      config: backup.loadConfig(),
      backups: await backup.listBackups()
    });
  } catch (err) {
    await backup.saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Disparo diario desde GitHub Actions (sin sesión admin; token de sync). */
router.post('/backups/github-sync', async (req, res) => {
  const expected = String(process.env.BACKUP_SYNC_TOKEN || process.env.BACKUP_GITHUB_SYNC_TOKEN || '').trim();
  const provided = String(req.get('X-Backup-Token') || req.body?.token || '').trim();
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Token de sync inválido.' });
  }
  if (!store.isReady()) {
    return res.status(503).json({ success: false, error: 'Store no listo' });
  }
  try {
    const result = await backup.runGithubBackupSync(store, {
      type: req.body?.type || 'daily',
      triggeredBy: 'github-action'
    });
    store.logSecurityEvent(
      'backup_github_sync',
      result.github?.path || result.github?.reason || result.error || 'ok',
      req
    );
    const status = result.success === false ? 500 : 200;
    return res.status(status).json(result);
  } catch (err) {
    await backup.saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Modo 100% automático recomendado:
 * Actions pide el .enc y lo guarda en el repo privado (sin PAT en Hostinger).
 */
router.post('/backups/export-encrypted', async (req, res) => {
  const expected = String(process.env.BACKUP_SYNC_TOKEN || process.env.BACKUP_GITHUB_SYNC_TOKEN || '').trim();
  const provided = String(req.get('X-Backup-Token') || req.body?.token || '').trim();
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Token de sync inválido.' });
  }
  if (!store.isReady()) {
    return res.status(503).json({ success: false, error: 'Store no listo' });
  }
  try {
    const result = await backup.exportEncryptedBackup(store, {
      type: req.body?.type || 'daily',
      triggeredBy: 'github-action'
    });
    if (result.error) {
      return res.status(500).json({ success: false, error: result.error });
    }
    store.logSecurityEvent(
      'backup_export_encrypted',
      `${result.package.encPath} by github-action`,
      req
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json({
      success: true,
      backup: result.backup,
      path: result.package.encPath,
      manifestPath: result.package.manifestPath,
      bytes: result.package.bytes,
      encBase64: result.package.encBuffer.toString('base64'),
      manifestBase64: result.package.manifestBuffer.toString('base64'),
      manifest: result.package.safeManifest
    });
  } catch (err) {
    await backup.saveConfig({ lastBackupStatus: 'error', lastBackupError: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/backups/github-status', requireRole('admin'), requireAdminPermission('backups.view', 'backups.manage'), (req, res) => {
  res.json({ success: true, github: backup.githubStatus() });
});

router.post('/backups/retention', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const config = backup.loadConfig();
  if (config.autoRetention === false) {
    return res.json({
      success: true,
      removed: 0,
      skipped: true,
      message: 'La limpieza automática está desactivada. El historial se conserva.',
      backups: await backup.listBackups()
    });
  }
  const removed = await backup.applyRetention();
  store.logSecurityEvent('backup_retention_purge', `removed=${removed}`, req);
  res.json({ success: true, removed, backups: await backup.listBackups() });
});

router.post('/backups/import', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const mode = String(req.body.mode || 'history').toLowerCase();
  const snapshot = req.body.snapshot;

  if (!store.isReady()) {
    return res.status(503).json({ success: false, error: 'La base de datos no está lista' });
  }

  try {
    if (mode === 'restore') {
      const access = req.adminAccess || req.session?.adminAccess;
      if (!hasPermission(access, 'backups.restore')) {
        return res.status(403).json({ success: false, error: 'No tienes permiso para restaurar backups' });
      }
      const confirm = String(req.body.confirm || '').trim().toUpperCase();
      if (confirm !== 'RESTAURAR') {
        return res.status(400).json({ success: false, error: 'Escribe RESTAURAR para confirmar la restauración' });
      }
      const result = await backup.restoreFromSnapshotData(store, snapshot, {
        triggeredBy: req.session.user.email,
        saveImport: true
      });
      store.logSecurityEvent('backup_import_restore', result.importedBackupId || 'json', req);
      return res.json({ success: true, mode: 'restore', ...result });
    }

    const result = await backup.importSnapshotFile(snapshot, req.session.user.email);
    store.logSecurityEvent('backup_import_history', result.manifest.id, req);
    res.json({ success: true, mode: 'history', backup: result.manifest });
  } catch (err) {
    store.logSecurityEvent('backup_import_failed', err.message, req);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/backups/:id/download', requireRole('admin'), requireAdminPermission('backups.view', 'backups.manage'), async (req, res) => {
  const item = await backup.getBackupById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Backup no encontrado' });

  store.logSecurityEvent('backup_download', `${req.params.id} by ${req.session.user.email}`, req);

  const ver = item.appVersion || 'backup';
  const filename = `fandez-backup-v${ver}-${String(item.createdAt).slice(0, 10)}.json`;
  const snapshotPath = item.folderPath ? path.join(item.folderPath, 'snapshot.json') : null;

  if (snapshotPath && fs.existsSync(snapshotPath)) {
    return res.download(snapshotPath, filename);
  }

  const snapshot = await backup.readSnapshot(req.params.id);
  if (!snapshot) return res.status(404).json({ error: 'Archivo no encontrado' });

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

router.post('/backups/:id/restore', requireRole('admin'), requireAdminPermission('backups.restore'), async (req, res) => {
  const confirm = String(req.body.confirm || '').trim().toUpperCase();
  if (confirm !== 'RESTAURAR') {
    return res.status(400).json({ error: 'Escribe RESTAURAR para confirmar la restauración' });
  }

  if (!store.isReady()) {
    return res.status(503).json({ error: 'La base de datos no está lista' });
  }

  try {
    const result = await backup.restoreBackup(store, req.params.id, {
      triggeredBy: req.session.user.email,
      restoreUploads: req.body.restoreUploads !== false
    });
    store.logSecurityEvent('backup_restore', `${req.params.id} → pre:${result.preRestoreBackupId}`, req);
    res.json({ success: true, ...result });
  } catch (err) {
    store.logSecurityEvent('backup_restore_failed', err.message, req);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/:id', requireRole('admin'), requireAdminPermission('backups.manage'), async (req, res) => {
  const ok = await backup.deleteBackup(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Backup no encontrado' });
  store.logSecurityEvent('backup_delete', req.params.id, req);
  res.json({ success: true, backups: await backup.listBackups() });
});

router.get('/precios', requireRole('admin'), requireAdminPermission('precios.view', 'precios.manage'), (req, res) => {
  const pricing = store.getPricingConfig();
  const gateways = require('../lib/payments/gateways');
  res.render('admin/precios', {
    title: 'Configuración de precios — Fandez Admin',
    user: req.session.user,
    pricing,
    serviceCatalog: store.getServiceCatalog(),
    catalogRows: store.getCatalogPriceRows(),
    gatewayStatus: gateways.getGatewayStatus(pricing),
    query: req.query,
    formatCLP: store.formatCLP
  });
});

router.get('/comercial', requireRole('admin'), requireAdminPermission('comercial.view', 'comercial.manage'), (req, res) => {
  const commercialPlan = require('../lib/commercialPlan');
  const pricing = store.getPricingConfig();
  const access = resolveAdminAccess(req.session.user);
  res.render('admin/comercial', {
    title: 'Planificación comercial — Fandez Admin',
    user: req.session.user,
    pricing,
    snapshot: commercialPlan.getCommercialPlanSnapshot(pricing),
    canManage: hasPermission(access, 'comercial.manage') || hasFullSystemAccess(access),
    query: req.query,
    formatCLP: store.formatCLP
  });
});

router.post('/comercial/aplicar-plan-a', requireRole('admin'), requireAdminPermission('comercial.manage'), (req, res) => {
  const commercialPlan = require('../lib/commercialPlan');
  try {
    const current = store.getPricingConfig();
    const updates = commercialPlan.buildPlanAPricingUpdate(current);
    store.updatePricingConfig(updates);
    store.logSecurityEvent('commercial_plan_a_applied', 'pricing', req);
    if (req.xhr || (req.get('accept') || '').includes('application/json')) {
      return res.json({ success: true, pricing: store.getPricingConfig() });
    }
    return res.redirect(adminUrl('/comercial?ok=plan_a'));
  } catch (err) {
    console.error('[comercial] plan A', err);
    if (req.xhr || (req.get('accept') || '').includes('application/json')) {
      return res.status(500).json({ success: false, error: err.message });
    }
    return res.redirect(adminUrl(`/comercial?error=${encodeURIComponent(err.message || 'Error')}`));
  }
});

router.post('/precios', requireRole('admin'), requireAdminPermission('precios.manage'), (req, res) => {
  const body = req.body;
  const tiers = [];
  const tierIds = Array.isArray(body.tierId) ? body.tierId : (body.tierId ? [body.tierId] : []);
  const tierLabels = Array.isArray(body.tierLabel) ? body.tierLabel : (body.tierLabel ? [body.tierLabel] : []);
  const tierDescs = Array.isArray(body.tierDesc) ? body.tierDesc : (body.tierDesc ? [body.tierDesc] : []);
  const tierPercents = Array.isArray(body.tierPercent) ? body.tierPercent : (body.tierPercent ? [body.tierPercent] : []);
  const tierMinutes = Array.isArray(body.tierMinutes) ? body.tierMinutes : (body.tierMinutes ? [body.tierMinutes] : []);
  const tierEnabledRaw = body.tierEnabled;
  const enabledSet = new Set(Array.isArray(tierEnabledRaw) ? tierEnabledRaw : (tierEnabledRaw ? [tierEnabledRaw] : []));
  const tierOrders = Array.isArray(body.tierOrder) ? body.tierOrder : (body.tierOrder ? [body.tierOrder] : []);

  for (let i = 0; i < tierIds.length; i++) {
    const surchargePercent = parseInt(tierPercents[i], 10);
    tiers.push({
      id: tierIds[i],
      label: tierLabels[i] || `Opción ${i + 1}`,
      description: tierDescs[i] || '',
      responseMinutes: parseInt(tierMinutes[i], 10) || 180,
      surchargePercent: Number.isFinite(surchargePercent) ? surchargePercent : 0,
      adjustmentPercent: Number.isFinite(surchargePercent) ? surchargePercent : 0,
      enabled: enabledSet.has(tierIds[i]),
      sortOrder: parseInt(tierOrders[i], 10) || i + 1
    });
  }

  const gwIds = Array.isArray(body.gwId) ? body.gwId : (body.gwId ? [body.gwId] : []);
  const gwEnabledRaw = body.gwEnabled;
  const gwEnabledSet = new Set(Array.isArray(gwEnabledRaw) ? gwEnabledRaw : (gwEnabledRaw ? [gwEnabledRaw] : []));
  const gwOrders = Array.isArray(body.gwOrder) ? body.gwOrder : (body.gwOrder ? [body.gwOrder] : []);
  const paymentGateways = {};
  for (let i = 0; i < gwIds.length; i++) {
    paymentGateways[gwIds[i]] = {
      enabled: gwEnabledSet.has(gwIds[i]),
      sortOrder: parseInt(gwOrders[i], 10) || i + 1
    };
  }

  const catalogPrices = {};
  const catalogIds = Array.isArray(body.catalogActivityId)
    ? body.catalogActivityId
    : (body.catalogActivityId ? [body.catalogActivityId] : []);
  const catalogBasePrices = Array.isArray(body.catalogBasePrice)
    ? body.catalogBasePrice
    : (body.catalogBasePrice ? [body.catalogBasePrice] : []);
  for (let i = 0; i < catalogIds.length; i++) {
    const id = catalogIds[i];
    const price = parseInt(catalogBasePrices[i], 10);
    if (id && Number.isFinite(price) && price > 0) catalogPrices[id] = price;
  }

  const matIds = Array.isArray(body.matId) ? body.matId : (body.matId ? [body.matId] : []);
  const matNames = Array.isArray(body.matName) ? body.matName : (body.matName ? [body.matName] : []);
  const matUnits = Array.isArray(body.matUnit) ? body.matUnit : (body.matUnit ? [body.matUnit] : []);
  const matPrices = Array.isArray(body.matPrice) ? body.matPrice : (body.matPrice ? [body.matPrice] : []);
  const matEnabledRaw = body.matEnabled;
  const matEnabledSet = new Set(Array.isArray(matEnabledRaw) ? matEnabledRaw : (matEnabledRaw ? [matEnabledRaw] : []));
  const materialsCatalog = [];
  for (let i = 0; i < matIds.length; i++) {
    const id = String(matIds[i] || '').trim();
    const name = String(matNames[i] || '').trim();
    if (!name) continue;
    const specKey = `matSpec_${id}`;
    const specRaw = body[specKey];
    const specialtyIds = Array.isArray(specRaw)
      ? specRaw.map(String).filter(Boolean)
      : (specRaw ? [String(specRaw)] : []);
    materialsCatalog.push({
      id: id || undefined,
      name,
      unit: String(matUnits[i] || 'unidad').trim() || 'unidad',
      marketPrice: parseInt(matPrices[i], 10) || 0,
      specialtyIds,
      enabled: matEnabledSet.has(id)
    });
  }

  const updated = store.updatePricingConfig({
    visitPrice: parseInt(body.visitPrice, 10),
    servicePrice: parseInt(body.servicePrice, 10),
    cancellations: {
      beforeAccepted: parseInt(body.cancelBeforeAccepted, 10),
      afterTechAccepted: parseInt(body.cancelAfterTechAccepted, 10),
      enRouteOrOnSite: parseInt(body.cancelEnRouteOrOnSite, 10)
    },
    laborCommissionRate: parseFloat(body.laborCommissionPercent) / 100,
    materialsCommissionRate: parseFloat(body.materialsCommissionPercent) / 100,
    mpOnlineRatePercent: parseFloat(body.mpOnlineRatePercent),
    mpPresentValueExtra: {
      1: parseFloat(body.mpPvExtra1),
      3: parseFloat(body.mpPvExtra3),
      6: parseFloat(body.mpPvExtra6),
      9: parseFloat(body.mpPvExtra9),
      12: parseFloat(body.mpPvExtra12)
    },
    ivaRate: parseFloat(body.ivaPercent) / 100,
    maxCardInstallments: parseInt(body.maxCardInstallments, 10),
    cardSurchargePercent: 0,
    cardEnabled: body.cardEnabled === 'on',
    transferEnabled: body.transferEnabled === 'on',
    bankTransfer: {
      bankName: body.bankName || '',
      accountType: body.bankAccountType || '',
      accountNumber: body.bankAccountNumber || '',
      holderName: body.bankHolderName || '',
      holderRut: body.bankHolderRut || '',
      email: body.bankEmail || ''
    },
    paymentGateways: Object.keys(paymentGateways).length ? paymentGateways : undefined,
    scheduleSurcharges: {
      normalPercent: parseInt(body.scheduleNormalPercent, 10),
      tardePercent: parseInt(body.scheduleTardePercent, 10),
      nocturnoPercent: parseInt(body.scheduleNocturnoPercent, 10)
    },
    urgencyTiers: tiers.length ? tiers : undefined,
    catalogPrices,
    materialsCatalog: materialsCatalog.length ? materialsCatalog : undefined,
    materialsAutoApproveMaxClp: parseInt(body.materialsAutoApproveMaxClp, 10),
    materialsFounderReviewMinClp: parseInt(body.materialsFounderReviewMinClp, 10),
    materialsAutoApproveMinConfidence: parseFloat(body.materialsAutoApproveMinConfidence)
  });

  store.logSecurityEvent('pricing_update', 'config', req);

  if (req.xhr || (req.get('accept') || '').includes('application/json')) {
    return res.json({ success: true, pricing: updated });
  }
  res.redirect(adminUrl('/precios?ok=1'));
});

router.post('/transfer/:requestId/aprobar', requireRole('admin'), requireAdminPermission('pagos.manage'), (req, res) => {
  const request = store.approveTransferPayment(req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Transferencia no encontrada o ya procesada' });
  store.logSecurityEvent('transfer_approved', req.params.requestId, req);
  const io = req.app.get('io');
  if (io) require('../lib/dispatch').notifyProvidersForRequest(io, request);
  res.json({ success: true, requestId: request.id });
});

router.get('/solicitudes/elegibles/:requestId', requireRole('admin'), requireAdminPermission('solicitudes.view'), (req, res) => {
  const request = store.getAllRequests().find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
  res.json({
    success: true,
    requestId: request.id,
    providers: store.getEligibleProvidersForRequest(request.id)
  });
});

router.get('/diagnostico/operacion', requireRole('admin'), requireAdminPermission('solicitudes.view'), (req, res) => {
  const diag = store.getOperationalDiagnostics();
  const { runGoLiveChecks } = require('../lib/goLiveCheck');
  res.json({
    success: true,
    diagnostics: diag,
    goLive: runGoLiveChecks(store)
  });
});

router.post('/solicitudes/:requestId/asignar', requireRole('admin'), requireAdminPermission('solicitudes.manage'), (req, res) => {
  const { providerId, technicianId } = req.body || {};
  if (!providerId) {
    return res.status(400).json({ success: false, error: 'Selecciona un socio.' });
  }

  const result = store.assignProvider(req.params.requestId, providerId, {
    technicianId: technicianId || null,
    actorRole: 'admin'
  });
  if (result.error) {
    return res.status(400).json({ success: false, error: result.error });
  }

  store.logSecurityEvent(
    'solicitud_canalizada',
    `${req.params.requestId} -> ${providerId}${technicianId ? ` / ${technicianId}` : ''}`,
    req
  );

  const io = req.app.get('io');
  const { broadcastRequestTaken } = require('../lib/dispatch');
  if (io) {
    broadcastRequestTaken(io, result.request.id, providerId);
    const publicProvider = store.getPublicProviderProfile(result.provider);
    emitRequestUpdateToParties(io, store, result.request, {
      request: result.request,
      provider: publicProvider
    });
    if (result.tecnico) {
      const techSocket = store.technicianSockets.get(result.tecnico.id);
      if (techSocket) {
        io.to(techSocket).emit(`tecnico_assignment_${result.tecnico.id}`, {
          requestId: result.request.id,
          request: result.request
        });
      }
    }
  }

  res.json({
    success: true,
    request: {
      id: result.request.id,
      status: result.request.status,
      providerId: result.request.providerId,
      technicianId: result.request.technicianId || null,
      technicianName: result.request.technicianName || null
    }
  });
});

router.post('/usuarios/verificar-email/reenviar', requireRole('admin'), requireAdminPermission('usuarios.manage', 'solicitudes.manage'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, error: 'Ingresa un correo.' });
  const user = store.getUserByEmail(email);
  if (!user) return res.status(404).json({ success: false, error: 'No hay cuenta con ese correo.' });
  if (user.role === 'admin') {
    return res.status(400).json({
      success: false,
      error: 'Los administradores no reciben código por correo. Usan solo Google Authenticator.'
    });
  }
  if (store.isEmailVerified(user)) {
    return res.json({ success: true, already: true, message: 'Ese correo ya está verificado.' });
  }
  const result = await store.issueEmailVerification(user.id, { locale: req.locale || 'es' });
  if (result.error) {
    return res.status(502).json({ success: false, error: result.error, demo: result.demo || false });
  }
  store.logSecurityEvent('admin_resend_verify', email, req);
  res.json({
    success: true,
    demo: Boolean(result.demo),
    message: result.demo
      ? 'Modo demo: el código está en los logs del servidor.'
      : `Código reenviado a ${email}. Pide revisar spam/promociones.`
  });
});

router.post('/usuarios/verificar-email/forzar', requireRole('admin'), requireAdminPermission('usuarios.manage', 'solicitudes.manage'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, error: 'Ingresa un correo.' });
  const user = store.getUserByEmail(email);
  if (!user) return res.status(404).json({ success: false, error: 'No hay cuenta con ese correo.' });
  const result = await store.forceVerifyEmail(user.id, { actorId: req.session.user.id });
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  store.logSecurityEvent('admin_force_verify', email, req);
  let message = result.already ? 'Ya estaba verificado.' : `Correo verificado manualmente: ${email}`;
  if (user.role === 'tecnico') {
    const dossier = store.canTechnicianOperate(user);
    message += dossier.ok
      ? ' Técnico listo: el socio ya puede usarlo en cobertura/pedidos.'
      : ` Esto solo desbloquea el login. El socio aún debe completar el expediente (${(dossier.missing || []).join(', ') || 'docs pendientes'}) para verlo como aprobado/listo.`;
  }
  res.json({
    success: true,
    already: Boolean(result.already),
    role: user.role,
    dossierOk: user.role === 'tecnico' ? store.canTechnicianOperate(user).ok : null,
    message
  });
});

module.exports = router;

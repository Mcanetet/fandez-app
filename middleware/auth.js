const store = require('../models/store');
const { adminUrl, absoluteAdminUrl } = require('../lib/appMode');
const { resolveAdminAccess } = require('../lib/adminPermissions');

function wantsJson(req) {
  const accept = String(req.get('Accept') || '');
  const xhr = String(req.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
  return xhr || accept.includes('application/json') || req.path.includes('/api/');
}

function rejectBlockedSession(req, res) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) return false;
    // Admins se gestionan aparte; aquí cortamos clientes/socios/técnicos bloqueados.
    if (sessionUser.role === 'admin') return false;
    const live = store.getUserById(sessionUser.id);
    if (live && live.active !== false) return false;
    delete req.session.user;
    if (wantsJson(req)) {
      res.status(403).json({ success: false, error: 'Tu cuenta fue desactivada. Contacta a soporte.' });
    } else {
      res.redirect('/login?blocked=1');
    }
    return true;
  } catch (_) {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    return res.redirect('/login');
  }
  if (rejectBlockedSession(req, res)) return;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' });
      if (roles.includes('admin')) {
        return res.redirect(absoluteAdminUrl(`/login${adminNextQuery(req)}`));
      }
      return res.redirect('/login');
    }
    if (rejectBlockedSession(req, res)) return;
    if (!roles.includes(req.session.user.role)) {
      if (wantsJson(req)) return res.status(403).json({ success: false, error: 'No tienes permisos para esta acción.' });
      // Sesión de cliente/socio/técnico en el mismo dominio no debe dar 403 en el panel admin.
      if (roles.includes('admin')) {
        try {
          delete req.session.user;
          delete req.session.adminAccess;
          delete req.session.adminMfaVerified;
          delete req.session.pendingAdminMfa;
        } catch (_) { /* ignore */ }
        return res.redirect(absoluteAdminUrl(`/login${adminNextQuery(req, { needAdmin: true })}`));
      }
      return res.status(403).render('error', {
        title: 'Acceso denegado',
        message: 'No tienes permisos para acceder a esta sección.',
        code: 403
      });
    }
    if (roles.includes('admin') && req.session.user.role === 'admin') {
      try {
        const user = store.getUserById(req.session.user.id);
        const access = resolveAdminAccess(user);
        const mfaOn = store.isMfaEnabled(req.session.user.id);
        const inProd = require('../lib/appMode').isProductionMode();
        // En producción: MFA obligatorio para cualquier admin (no solo full-access).
        const requireMfa = mfaOn || inProd;
        if (requireMfa && !req.session.adminMfaVerified) {
          if (!mfaOn && inProd) {
            return res.redirect(adminUrl('/mfa/setup?required=1'));
          }
          req.session.pendingAdminMfa = {
            userId: req.session.user.id,
            email: req.session.user.email,
            expiresAt: Date.now() + 5 * 60 * 1000
          };
          delete req.session.user;
          if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Se requiere verificación MFA.' });
          return res.redirect(adminUrl('/mfa'));
        }
      } catch (_) { /* store no listo */ }
    }
    next();
  };
}

/** next seguro tras login admin: /app o /instalar-admin */
function adminNextQuery(req, { needAdmin = false } = {}) {
  const raw = String(req.originalUrl || req.path || '');
  let next = '';
  if (raw.includes('/instalar-admin')) next = '/instalar-admin';
  else if (raw.includes('/app')) next = '/app';
  const params = new URLSearchParams();
  if (next) params.set('next', next);
  if (needAdmin) params.set('need_admin', '1');
  const q = params.toString();
  return q ? `?${q}` : '';
}

function requireVerifiedEmail(req, res, next) {
  if (!req.session?.user) {
    if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    return res.redirect('/login');
  }
  const user = store.getUserById(req.session.user.id);
  if (!user || store.isEmailVerified(user)) return next();
  if (user.role === 'admin') return next();
  if (wantsJson(req)) return res.status(403).json({ success: false, error: 'Debes verificar tu email para continuar.' });
  return res.redirect('/verificar-email?pending=1');
}

module.exports = { requireAuth, requireRole, requireVerifiedEmail };

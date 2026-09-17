const {
  resolveAdminAccess,
  hasPermission,
  hasAnyPermission,
  getNavForAccess,
  getFirstAccessiblePanel,
  canAccessPanel
} = require('../lib/adminPermissions');
const { adminUrl, getAdminBasePath, getPublicStatus } = require('../lib/appMode');

function getSessionAccess(req) {
  if (req.session?.adminAccess) return req.session.adminAccess;
  const store = require('../models/store');
  const user = store.getUserById(req.session?.user?.id);
  const access = resolveAdminAccess(user);
  if (req.session) req.session.adminAccess = access;
  return access;
}

function attachAdminAccess(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.session?.user?.role === 'admin') {
    req.adminAccess = getSessionAccess(req);
    res.locals.adminAccess = req.adminAccess;
    res.locals.adminNav = getNavForAccess(req.adminAccess, req.t);
  }
  res.locals.adminBase = getAdminBasePath();
  res.locals.adminUrl = adminUrl;
  res.locals.appModeStatus = getPublicStatus();
  next();
}

function requireAdminPermission(...permissions) {
  return (req, res, next) => {
    if (!req.session?.user || req.session.user.role !== 'admin') {
      return res.redirect(adminUrl('/login'));
    }
    const access = getSessionAccess(req);
    if (access.isSuperAdmin || access.isFullAccess || hasAnyPermission(access, permissions)) {
      req.adminAccess = access;
      return next();
    }
    if (req.xhr || (req.get('accept') || '').includes('application/json')) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    return res.status(403).render('error', {
      title: 'Acceso denegado',
      message: 'Tu perfil no incluye permisos para esta sección.',
      code: 403
    });
  };
}

function requireFullAdminAccess() {
  return (req, res, next) => {
    if (!req.session?.user || req.session.user.role !== 'admin') {
      return res.redirect(adminUrl('/login'));
    }
    const { hasFullSystemAccess } = require('../lib/adminPermissions');
    const access = getSessionAccess(req);
    if (hasFullSystemAccess(access)) {
      req.adminAccess = access;
      return next();
    }
    if (req.xhr || (req.get('accept') || '').includes('application/json')) {
      return res.status(403).json({ error: 'Solo superadmin o admin.mod pueden realizar esta acción.' });
    }
    return res.status(403).render('error', {
      title: 'Acceso denegado',
      message: 'Solo superadmin o admin.mod pueden modificar la base de conocimiento.',
      code: 403
    });
  };
}

function requireFounderDecision(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }
  const access = getSessionAccess(req);
  const { isFounderActor } = require('../lib/founderGates');
  if (!isFounderActor(req.session.user, access)) {
    return res.status(403).json({
      success: false,
      error: 'Solo el founder (o superadmin) puede aprobar o publicar. Pide decisión a Miguel.'
    });
  }
  req.adminAccess = access;
  return next();
}

function refreshSessionAdminAccess(req, user) {
  const access = resolveAdminAccess(user);
  req.session.adminAccess = access;
  req.session.user.adminProfile = access.profileId;
  req.session.user.isSuperAdmin = access.isSuperAdmin;
  req.session.user.isFullAccess = access.isFullAccess;
  req.session.user.permissions = access.permissions;
  return access;
}

module.exports = {
  getSessionAccess,
  attachAdminAccess,
  requireAdminPermission,
  requireFullAdminAccess,
  requireFounderDecision,
  refreshSessionAdminAccess,
  canAccessPanel,
  getFirstAccessiblePanel,
  hasPermission
};

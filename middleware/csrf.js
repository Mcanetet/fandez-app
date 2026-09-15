const crypto = require('crypto');

function ensureCsrfToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function rotateCsrfToken(req) {
  if (!req.session) return null;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function attachCsrf(req, res, next) {
  const token = ensureCsrfToken(req);
  res.locals.csrfToken = token;
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session?.csrfToken;
  const provided = req.get('X-CSRF-Token') || req.body?._csrf || req.query?._csrf;
  if (!expected || !provided || String(provided) !== String(expected)) {
    if (req.xhr || (req.get('accept') || '').includes('application/json')) {
      return res.status(403).json({ success: false, error: 'Token de seguridad inválido. Recarga el panel.' });
    }
    return res.status(403).render('error', {
      title: 'Sesión de seguridad',
      message: 'Token CSRF inválido. Vuelve atrás, recarga la página e inténtalo de nuevo.',
      code: 403
    });
  }
  next();
}

module.exports = {
  ensureCsrfToken,
  rotateCsrfToken,
  attachCsrf,
  requireCsrf
};

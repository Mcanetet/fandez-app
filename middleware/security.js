const helmet = require('helmet');

/**
 * Cabeceras HTTP alineadas a OWASP (A05 Security Misconfiguration).
 * CSP permite inline scripts/styles actuales de EJS; se endurece el resto.
 */
function securityHeaders(req, res, next) {
  return helmet({
    // No forzar COEP/COOP (rompe mapas / widgets embebidos)
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'", 'https:'],
        // EJS + Tailwind CDN / inline handlers legacy
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.tailwindcss.com',
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://www.mercadopago.com',
          'https://sdk.mercadopago.com',
          'https://www.google.com',
          'https://maps.googleapis.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com'
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https:',
          'wss:',
          'ws:',
          'https://api.mercadopago.com',
          'https://www.mercadopago.com',
          'https://maps.googleapis.com',
          'https://nominatim.openstreetmap.org'
        ],
        frameSrc: [
          "'self'",
          'https://www.mercadopago.com',
          'https://www.mercadopago.cl',
          'https://sdk.mercadopago.com',
          'https://webpay3g.transbank.cl',
          'https://webpay3gint.transbank.cl',
          'https://www.google.com'
        ],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        ...(process.env.NODE_ENV === 'production'
          ? { upgradeInsecureRequests: [] }
          : {})
      }
    },
    // HSTS solo en producción (Hostinger ya añade uno; reforzamos includeSubDomains)
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Reemplaza X-XSS-Protection obsoleto; Helmet lo desactiva por defecto (correcto)
    xXssProtection: false,
    // No filtrar Referer de mismo sitio en demasía
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
  })(req, res, (err) => {
    if (err) return next(err);
    // Permissions-Policy (geolocalización / cámara para visita en terreno)
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(self), microphone=(self), camera=(self), payment=(self), usb=()'
    );
    next();
  });
}

function rateLimitSimple(maxPerMinute = 120) {
  const hits = new Map();
  const skip = (req) => {
    const p = String(req.path || '');
    if (p.startsWith('/socket.io')) return true;
    if (p.startsWith('/uploads/')) return true;
    if (p.startsWith('/media/')) return true;
    if (p.startsWith('/icons/')) return true;
    if (p.startsWith('/css/') || p.startsWith('/js/')) return true;
    if (/\.(css|js|png|jpe?g|webp|svg|ico|woff2?|map)$/i.test(p)) return true;
    return false;
  };
  return (req, res, next) => {
    if (skip(req)) return next();
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const window = hits.get(key) || [];
    const recent = window.filter(t => now - t < 60000);
    if (recent.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function rateLimitLogin(maxPerMinute = 10) {
  const hits = new Map();
  return (req, res, next) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const window = hits.get(key) || [];
    const recent = window.filter(t => now - t < 60000);
    if (recent.length >= maxPerMinute) {
      const message = 'Demasiados intentos. Espera un minuto e intenta de nuevo.';
      if (req.xhr || (req.get('accept') || '').includes('application/json')) {
        return res.status(429).json({ error: message });
      }
      return res.status(429).render('error', {
        title: 'Demasiados intentos',
        message,
        code: 429
      });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  let ip = forwarded
    ? String(forwarded).split(',')[0].trim()
    : (req.get('x-real-ip') || req.ip || req.socket?.remoteAddress || 'unknown');
  ip = String(ip).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function parseAdminIpAllowlist() {
  return String(process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ip) => (ip.startsWith('::ffff:') ? ip.slice(7) : ip));
}

function adminIpAllowlist() {
  return (req, res, next) => {
    const allowed = parseAdminIpAllowlist();
    if (!allowed.length) return next();

    const enforce = process.env.NODE_ENV === 'production'
      || process.env.ADMIN_IP_ALLOWLIST_ENFORCE === 'true';
    if (!enforce) return next();

    const p = String(req.path || '');
    // Manifest PWA debe ser público (Chrome lo pide sin cookies / desde otra IP).
    if (req.method === 'GET' && (p === '/app.webmanifest' || p.endsWith('/app.webmanifest'))) {
      return next();
    }

    const ip = getClientIp(req);
    if (allowed.includes(ip) || allowed.includes('*')) return next();

    try {
      const store = require('../models/store');
      store.logSecurityEvent('admin_ip_blocked', ip, req);
    } catch (_) { /* store no listo */ }

    // GET: página clara con la IP (útil en celular / 4G)
    if (req.method === 'GET') {
      return res.status(403).render('admin/login', {
        title: 'Admin — Fandez',
        error: `IP no autorizada (${ip}). Para usar Fandez Admin en el celular: en Hostinger borra ADMIN_IP_ALLOWLIST (deja vacío) o añade esta IP, y redeploya. MFA sigue activo.`,
        csrfToken: null,
        ipBlocked: true,
        nextPath: ''
      });
    }

    return res.status(403).render('error', {
      title: 'Acceso restringido',
      message: `Tu IP (${ip}) no está autorizada para el panel. Actualiza ADMIN_IP_ALLOWLIST en Hostinger o bórrala para desactivar el filtro.`,
      code: 403
    });
  };
}

module.exports = {
  securityHeaders,
  rateLimitSimple,
  rateLimitLogin,
  getClientIp,
  parseAdminIpAllowlist,
  adminIpAllowlist
};

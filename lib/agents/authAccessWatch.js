/**
 * Sofía vigila accesos a registro e ingreso.
 * Avisa al founder (ops inbox + email) cuando hay errores al crear cuenta o al entrar.
 */
'use strict';

const founderAlerts = require('./founderAlerts');
const company = require('../../config/company');

const buckets = new Map(); // key → { count, firstAt, lastAt, samples: [] }
const BUCKET_TTL_MS = 30 * 60 * 1000;
const LOGIN_FAIL_THRESHOLD = 4;

function adminLink(hash = '') {
  const base = company.appUrl ? String(company.appUrl).replace(/\/+$/, '') : '';
  if (!base) return null;
  return hash ? `${base}#${hash}` : base;
}

function pruneBuckets(now = Date.now()) {
  for (const [k, b] of buckets) {
    if (now - b.lastAt > BUCKET_TTL_MS) buckets.delete(k);
  }
}

function bumpBucket(key, sample) {
  pruneBuckets();
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { count: 0, firstAt: now, lastAt: now, samples: [] };
    buckets.set(key, b);
  }
  b.count += 1;
  b.lastAt = now;
  if (sample) {
    b.samples.push(String(sample).slice(0, 160));
    if (b.samples.length > 8) b.samples.shift();
  }
  return b;
}

function clientMeta(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  const ip = (typeof fwd === 'string' && fwd.split(',')[0].trim())
    || req?.ip
    || '—';
  return {
    ip,
    ua: String(req?.headers?.['user-agent'] || '').slice(0, 140)
  };
}

function roleLabel(role) {
  if (role === 'provider') return 'socio';
  if (role === 'tecnico') return 'técnico';
  if (role === 'admin') return 'admin';
  return 'cliente';
}

/**
 * Error al intentar crear cuenta (validación, cobertura, timeout, 500, etc.).
 */
async function reportRegistrationError({
  store = null,
  req = null,
  form = {},
  error = null,
  errorKey = null,
  code = null,
  httpStatus = 400
} = {}) {
  const email = String(form.email || '').trim().toLowerCase() || '—';
  const role = form.role === 'provider' ? 'provider' : 'client';
  const reason = errorKey || code || 'registro_error';
  const message = String(error || errorKey || 'Error al registrar').slice(0, 400);
  const meta = clientMeta(req);

  try {
    store?.logSecurityEvent?.(
      'registro_fail',
      JSON.stringify({
        email,
        role,
        errorKey: errorKey || null,
        code: code || null,
        status: httpStatus,
        message: message.slice(0, 240),
        ip: meta.ip
      }),
      req
    );
  } catch (_) { /* ignore */ }

  const severity = httpStatus >= 500 ? 'critical' : 'high';
  const title = `Error al registrarse (${roleLabel(role)})`;
  const body = [
    'Sofía detectó un fallo al crear una cuenta.',
    '',
    `Rol: ${roleLabel(role)}`,
    `Email: ${email}`,
    `Nombre: ${form.name || '—'}`,
    `Tel: ${form.phone || '—'}`,
    form.addressRegion ? `Región/comuna: ${form.addressRegion} / ${form.addressCommune || '—'}` : null,
    `Motivo: ${message}`,
    errorKey ? `Clave: ${errorKey}` : null,
    code ? `Código: ${code}` : null,
    `HTTP: ${httpStatus}`,
    `IP: ${meta.ip}`,
    meta.ua ? `Dispositivo: ${meta.ua}` : null,
    '',
    'Revisa Admin → Seguridad / Briefs si aplica, y el flujo /registro.'
  ].filter(Boolean).join('\n');

  return founderAlerts.notifyInstant({
    agent: 'Sofía',
    severity,
    title,
    body,
    dedupeKey: `registro-fail-${email}-${reason}`,
    link: adminLink(),
    store
  });
}

/**
 * Fallo al ingresar (login). Avisa siempre en cuenta bloqueada;
 * en credenciales incorrectas, al acumular varios intentos.
 */
async function reportLoginError({
  store = null,
  req = null,
  email = '',
  reason = 'login_fail'
} = {}) {
  const mail = String(email || '').trim().toLowerCase() || 'desconocido';
  const meta = clientMeta(req);
  const key = `login:${reason}:${mail}:${meta.ip}`;
  const bucket = bumpBucket(key, mail);

  const immediate = reason === 'blocked'
    || reason === 'wrong_portal'
    || reason === 'admin_login_fail';

  if (!immediate && bucket.count < LOGIN_FAIL_THRESHOLD) {
    return { skipped: true, reason: 'below_threshold', count: bucket.count };
  }

  const severity = reason === 'blocked' ? 'high' : 'medium';
  const title = reason === 'blocked'
    ? `Ingreso bloqueado: ${mail}`
    : reason === 'wrong_portal'
      ? `Admin intentó login público: ${mail}`
      : `Varios fallos de ingreso (${bucket.count})`;

  const body = [
    'Sofía detectó problemas al ingresar a Fandez.',
    '',
    `Email: ${mail}`,
    `Motivo: ${reason}`,
    `Intentos en ~30 min: ${bucket.count}`,
    `IP: ${meta.ip}`,
    meta.ua ? `Dispositivo: ${meta.ua}` : null,
    bucket.samples.length ? `Muestras: ${bucket.samples.join(' · ')}` : null,
    '',
    'Si es un usuario legítimo, revisa contraseña / verificación de correo / cuenta activa.'
  ].filter(Boolean).join('\n');

  return founderAlerts.notifyInstant({
    agent: 'Sofía',
    severity,
    title,
    body,
    dedupeKey: immediate
      ? `login-${reason}-${mail}`
      : `login-burst-${mail}-${meta.ip}-${Math.floor(Date.now() / BUCKET_TTL_MS)}`,
    link: adminLink(),
    store
  });
}

/**
 * Problemas al enviar o validar el código de verificación.
 */
async function reportVerifyIssue({
  store = null,
  req = null,
  user = null,
  issue = null,
  context = 'verify'
} = {}) {
  const email = user?.email || '—';
  const err = issue?.authFailed
    ? 'SMTP auth falló (credenciales correo)'
    : (issue?.error || issue?.mailError || 'Error de verificación');
  const severity = issue?.authFailed ? 'critical' : 'high';

  try {
    store?.logSecurityEvent?.(
      'verify_mail_issue',
      JSON.stringify({ email, error: String(err).slice(0, 240), context }),
      req
    );
  } catch (_) { /* ignore */ }

  return founderAlerts.notifyInstant({
    agent: 'Sofía',
    severity,
    title: `Verificación de correo: problema · ${email}`,
    body: [
      `Contexto: ${context}`,
      `Usuario: ${user?.name || '—'} (${email})`,
      `Rol: ${roleLabel(user?.role)}`,
      `Detalle: ${err}`,
      issue?.pending ? 'El envío quedó pendiente en segundo plano.' : null,
      '',
      'Revisa SMTP en Hostinger y Admin → Seguridad.'
    ].filter(Boolean).join('\n'),
    dedupeKey: `verify-${context}-${email}-${String(err).slice(0, 40)}`,
    link: adminLink(),
    store
  });
}

/**
 * Resumen reciente de fallos (para digest / atención admin).
 */
function summarizeRecentFailures(store, { minutes = 60, limit = 20 } = {}) {
  const logs = store?.securityLogs || [];
  const since = Date.now() - minutes * 60 * 1000;
  const interesting = new Set([
    'registro_fail',
    'login_fail',
    'login_blocked',
    'login_admin_blocked_public',
    'admin_login_fail',
    'verify_mail_issue'
  ]);
  const recent = logs.filter((l) => {
    if (!interesting.has(l.event)) return false;
    const t = Date.parse(l.createdAt || '');
    return Number.isFinite(t) && t >= since;
  });

  const byEvent = {};
  recent.forEach((l) => {
    byEvent[l.event] = (byEvent[l.event] || 0) + 1;
  });

  return {
    total: recent.length,
    byEvent,
    samples: recent.slice(0, limit).map((l) => ({
      event: l.event,
      detail: l.detail,
      ip: l.ip,
      at: l.createdAt
    }))
  };
}

module.exports = {
  reportRegistrationError,
  reportLoginError,
  reportVerifyIssue,
  summarizeRecentFailures,
  LOGIN_FAIL_THRESHOLD
};

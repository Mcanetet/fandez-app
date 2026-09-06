/**
 * Recuperación de contraseña por correo (enlace de un solo uso).
 * TTL 30 min · cooldown reenvío 60 s · token opaco hasheado en BD.
 */
const crypto = require('crypto');
const mailer = require('./mailer');
const company = require('../config/company');

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashToken(token) {
  const secret = process.env.SESSION_SECRET || 'fandez-dev';
  return crypto.createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function buildResetEmail({ name, resetUrl, locale = 'es' }) {
  const isEn = locale === 'en';
  const { transactional } = require('./emailLayout');
  const first = String(name || '').trim().split(/\s+/)[0] || (isEn ? 'there' : '');
  const subject = isEn
    ? 'Reset your Fandez password'
    : 'Recupera tu contraseña Fandez';
  const text = isEn
    ? `Hello ${first},\n\nWe received a request to reset your Fandez password.\n\nOpen this link (valid 30 minutes):\n${resetUrl}\n\nIf you did not request this, you can ignore this email. Your password will stay the same.\n\nFandez SpA\n${company.supportEmail}`
    : `Hola ${first},\n\nRecibimos una solicitud para restablecer tu contraseña de Fandez.\n\nAbre este enlace (válido 30 minutos):\n${resetUrl}\n\nSi no pediste esto, ignora el correo. Tu contraseña no cambiará.\n\nFandez SpA\n${company.supportEmail}`;
  const html = isEn
    ? transactional({
      title: subject,
      preheader: 'Link valid for 30 minutes.',
      eyebrow: 'Password recovery',
      heading: 'Create a new password',
      greeting: `Hello ${first},`,
      intro: 'Tap the button below to choose a new password for your Fandez account.',
      details: [
        { label: 'Valid for', value: '30 minutes' },
        { label: 'Security', value: 'One-time link' }
      ],
      cta: { href: resetUrl, label: 'Reset password' },
      note: 'If you did not request a reset, ignore this email. Your current password stays active.'
    })
    : transactional({
      title: subject,
      preheader: 'Enlace válido por 30 minutos.',
      eyebrow: 'Recuperar contraseña',
      heading: 'Crea una nueva contraseña',
      greeting: first ? `Hola ${first},` : 'Hola,',
      intro: 'Toca el botón para elegir una contraseña nueva en tu cuenta Fandez.',
      details: [
        { label: 'Válido por', value: '30 minutos' },
        { label: 'Seguridad', value: 'Enlace de un solo uso' }
      ],
      cta: { href: resetUrl, label: 'Restablecer contraseña' },
      note: 'Si no pediste recuperar la contraseña, ignora este correo. Tu clave actual sigue activa.'
    });
  return { subject, text, html };
}

function prepareReset(user, { locale = 'es', appUrl } = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const sentAt = new Date().toISOString();
  const base = String(appUrl || company.appUrl || '').replace(/\/$/, '');
  const resetUrl = `${base}/recuperar/nueva?token=${encodeURIComponent(token)}`;
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt,
    sentAt,
    resetUrl,
    emailContent: buildResetEmail({ name: user.name, resetUrl, locale })
  };
}

async function dispatchResetEmail(user, prepared) {
  const result = await mailer.sendMail({
    to: user.email,
    subject: prepared.emailContent.subject,
    text: prepared.emailContent.text,
    html: prepared.emailContent.html
  });
  if (result.demo) {
    console.log(`[reset:demo] Enlace para ${user.email}: ${prepared.resetUrl}`);
  } else if (result.error) {
    console.error(`[reset:error] No se pudo enviar a ${user.email}: ${result.error}`);
  }
  return result;
}

function tokenStillValid(user) {
  if (!user?.passwordResetTokenHash || !user?.passwordResetExpiresAt) return false;
  return new Date(user.passwordResetExpiresAt).getTime() >= Date.now();
}

function canResend(user) {
  if (!user) return true;
  if (!tokenStillValid(user)) return true;
  if (!user.passwordResetSentAt) return true;
  return Date.now() - new Date(user.passwordResetSentAt).getTime() >= RESEND_COOLDOWN_MS;
}

function resendCooldownSeconds(user) {
  if (!user || canResend(user)) return 0;
  const elapsed = Date.now() - new Date(user.passwordResetSentAt).getTime();
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
}

function verifyToken(user, token) {
  if (!user?.passwordResetTokenHash || !user?.passwordResetExpiresAt) {
    return { errorKey: 'reset.error_token_invalid' };
  }
  if (new Date(user.passwordResetExpiresAt).getTime() < Date.now()) {
    return { errorKey: 'reset.error_token_expired' };
  }
  const expected = user.passwordResetTokenHash;
  const computed = hashToken(String(token || '').trim());
  const left = Buffer.from(String(computed));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { errorKey: 'reset.error_token_invalid' };
  }
  return { ok: true };
}

module.exports = {
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  hashToken,
  generateToken,
  prepareReset,
  dispatchResetEmail,
  tokenStillValid,
  canResend,
  resendCooldownSeconds,
  verifyToken
};

const crypto = require('crypto');
const mailer = require('./mailer');
const company = require('../config/company');

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashCode(userId, code) {
  const secret = process.env.SESSION_SECRET || 'fandez-dev';
  return crypto.createHash('sha256').update(`${userId}:${code}:${secret}`).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function codesMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function buildVerificationEmail({ name, code, locale = 'es' }) {
  const isEn = locale === 'en';
  const { getSiteUrl } = require('./seo');
  const { transactional } = require('./emailLayout');
  const appUrl = getSiteUrl();
  const subject = isEn
    ? 'Your Fandez verification code'
    : 'Tu código de verificación Fandez';
  const text = isEn
    ? `Hello ${name},\n\nYour Fandez verification code is: ${code}\n\nIt expires in 15 minutes. Enter this code at ${appUrl}/verificar-email to activate your account.\n\nIf you did not create a Fandez account, you can ignore this message.\n\nFandez SpA\n${company.supportEmail}`
    : `Hola ${name},\n\nTu código de verificación Fandez es: ${code}\n\nExpira en 15 minutos. Ingrésalo en ${appUrl}/verificar-email para activar tu cuenta.\n\nSi no creaste una cuenta en Fandez, puedes ignorar este mensaje.\n\nFandez SpA\n${company.supportEmail}`;
  const html = isEn
    ? transactional({
      title: subject,
      preheader: `Your code is ${code}. Expires in 15 minutes.`,
      eyebrow: 'Account verification',
      heading: 'Confirm your email',
      greeting: `Hello ${name},`,
      intro: 'Use this code to verify your Fandez account and start requesting services.',
      code,
      details: [
        { label: 'Valid for', value: '15 minutes' },
        { label: 'Where to enter it', value: 'Verification page' }
      ],
      cta: { href: `${appUrl}/verificar-email`, label: 'Open verification page' },
      note: 'If you did not create a Fandez account, you can ignore this email.'
    })
    : transactional({
      title: subject,
      preheader: `Tu código es ${code}. Expira en 15 minutos.`,
      eyebrow: 'Verificación de cuenta',
      heading: 'Confirma tu correo',
      greeting: `Hola ${name},`,
      intro: 'Usa este código para verificar tu cuenta Fandez y empezar a solicitar servicios.',
      code,
      details: [
        { label: 'Válido por', value: '15 minutos' },
        { label: 'Dónde ingresarlo', value: 'Página de verificación' }
      ],
      cta: { href: `${appUrl}/verificar-email`, label: 'Abrir página de verificación' },
      note: 'Si no creaste una cuenta en Fandez, puedes ignorar este correo.'
    });
  return { subject, text, html };
}

async function sendVerificationEmail(user, { locale = 'es' } = {}) {
  const prepared = prepareVerification(user, { locale });
  const mailResult = await dispatchVerificationEmail(user, prepared);
  return {
    codeHash: prepared.codeHash,
    expiresAt: prepared.expiresAt,
    sentAt: prepared.sentAt,
    mailResult
  };
}

function prepareVerification(user, { locale = 'es' } = {}) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const sentAt = new Date().toISOString();
  return {
    code,
    codeHash: hashCode(user.id, code),
    expiresAt,
    sentAt,
    emailContent: buildVerificationEmail({ name: user.name, code, locale })
  };
}

async function dispatchVerificationEmail(user, prepared) {
  const result = await mailer.sendMail({
    to: user.email,
    subject: prepared.emailContent.subject,
    text: prepared.emailContent.text,
    html: prepared.emailContent.html
  });

  if (result.demo) {
    console.log(`[verify:demo] Código para ${user.email}: ${prepared.code}`);
  } else if (result.error) {
    console.error(`[verify:error] No se pudo enviar a ${user.email}: ${result.error}`);
  }
  return result;
}

function verifyCode(user, code) {
  if (!user?.emailVerificationCodeHash || !user?.emailVerificationExpiresAt) {
    return { error: 'No hay un código activo. Solicita uno nuevo.' };
  }
  if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
    return { error: 'El código expiró. Solicita uno nuevo.' };
  }
  const normalized = String(code || '').trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { error: 'Ingresa el código de 6 dígitos.' };
  }
  const expected = user.emailVerificationCodeHash;
  const computed = hashCode(user.id, normalized);
  const left = Buffer.from(String(computed));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { error: 'Código incorrecto. Revisa tu correo e intenta de nuevo.' };
  }
  return { ok: true };
}

function hasActiveCode(user) {
  if (!user?.emailVerificationCodeHash || !user?.emailVerificationExpiresAt) return false;
  return new Date(user.emailVerificationExpiresAt).getTime() >= Date.now();
}

function canResend(user) {
  if (!user) return true;
  // Sin código vigente (nunca enviado o ya expiró): permitir pedir otro al tiro
  if (!hasActiveCode(user)) return true;
  if (!user.emailVerificationSentAt) return true;
  return Date.now() - new Date(user.emailVerificationSentAt).getTime() >= RESEND_COOLDOWN_MS;
}

function resendCooldownSeconds(user) {
  if (!user || canResend(user)) return 0;
  const elapsed = Date.now() - new Date(user.emailVerificationSentAt).getTime();
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
}

module.exports = {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  hashCode,
  generateCode,
  prepareVerification,
  dispatchVerificationEmail,
  sendVerificationEmail,
  verifyCode,
  hasActiveCode,
  canResend,
  resendCooldownSeconds
};

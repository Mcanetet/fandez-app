/**
 * Gates de autonomía: qué puede hacer un agente solo vs qué pide al founder.
 * Env:
 *   FOUNDER_EMAILS=miguel@...,otro@...
 *   FOUNDER_TELEGRAM_CHAT_ID=... (opcional; si no, TELEGRAM_CHAT_ID)
 *   FOUNDER_NTFY_TOPIC=... (opcional)
 */

'use strict';

const DEFAULT_THRESHOLDS = {
  /** Boletas ≤ esto pueden auto-aprobarse si la IA aprueba con buena confianza */
  materialsAutoApproveMaxClp: 15000,
  /** Por encima: siempre pending_founder aunque la IA apruebe */
  materialsFounderReviewMinClp: 15000,
  /** Confianza mínima IA para auto-aprobar montos chicos */
  materialsAutoApproveMinConfidence: 0.85,
  /** Payouts / reembolsos que entran al decision pack ASK */
  payoutAskMinClp: 1,
  refundAskMinClp: 1
};

function founderEmails() {
  const raw = [
    process.env.FOUNDER_EMAILS,
    process.env.FOUNDER_EMAIL,
    process.env.ADMIN_EMAIL
  ]
    .filter(Boolean)
    .join(',');
  return [...new Set(
    raw.split(/[,;\s]+/)
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function isFounderEmail(email) {
  const list = founderEmails();
  if (!list.length) return false;
  return list.includes(String(email || '').trim().toLowerCase());
}

/**
 * Actor autorizado a decisiones founder (approve/publish Florencia, etc.).
 * Superadmin / full access siempre; o email en FOUNDER_EMAILS.
 */
function isFounderActor(user, access = null) {
  if (!user || user.role !== 'admin') return false;
  if (isFounderEmail(user.email)) return true;
  if (access?.isSuperAdmin || access?.isFullAccess) return true;
  const perms = access?.permissions || user.adminPermissions || [];
  return Array.isArray(perms) && perms.includes('founder.decisions');
}

function getAutonomyThresholds(pricing = null) {
  const p = pricing || {};
  const autoMax = parseInt(p.materialsAutoApproveMaxClp, 10);
  const founderMin = parseInt(p.materialsFounderReviewMinClp, 10);
  const conf = Number(p.materialsAutoApproveMinConfidence);
  return {
    materialsAutoApproveMaxClp: Number.isFinite(autoMax) && autoMax >= 0
      ? autoMax
      : DEFAULT_THRESHOLDS.materialsAutoApproveMaxClp,
    materialsFounderReviewMinClp: Number.isFinite(founderMin) && founderMin >= 0
      ? founderMin
      : DEFAULT_THRESHOLDS.materialsFounderReviewMinClp,
    materialsAutoApproveMinConfidence: Number.isFinite(conf) && conf > 0 && conf <= 1
      ? conf
      : DEFAULT_THRESHOLDS.materialsAutoApproveMinConfidence,
    payoutAskMinClp: DEFAULT_THRESHOLDS.payoutAskMinClp,
    refundAskMinClp: DEFAULT_THRESHOLDS.refundAskMinClp
  };
}

/**
 * Formato ASK al founder (máx. ~6 líneas).
 */
function formatFounderAsk({
  agent = 'Agente',
  whatHappened = '',
  recommendation = '',
  impact = '',
  needFromYou = 'Aprobar · Rechazar · Diferir',
  link = ''
} = {}) {
  return [
    `Decisión pendiente · ${agent}`,
    `1) Qué pasó: ${String(whatHappened).slice(0, 280)}`,
    `2) Recomendación: ${String(recommendation).slice(0, 200)}`,
    impact ? `3) Impacto si no decides hoy: ${String(impact).slice(0, 200)}` : null,
    `4) Necesito de ti: ${needFromYou}`,
    link ? `Link: ${link}` : null
  ].filter(Boolean).join('\n');
}

async function notifyFounderAsk(payload) {
  const adminNotify = require('./aland/adminNotify');
  const text = typeof payload === 'string' ? payload : formatFounderAsk(payload);
  const title = (payload && payload.agent)
    ? `Fandez · ${payload.agent} ASK`
    : 'Fandez · Decisión founder';

  // Preferir canal founder si existe
  const prevChat = process.env.TELEGRAM_CHAT_ID;
  const prevTopic = process.env.NTFY_TOPIC;
  if (process.env.FOUNDER_TELEGRAM_CHAT_ID) {
    process.env.TELEGRAM_CHAT_ID = process.env.FOUNDER_TELEGRAM_CHAT_ID;
  }
  if (process.env.FOUNDER_NTFY_TOPIC) {
    process.env.NTFY_TOPIC = process.env.FOUNDER_NTFY_TOPIC;
  }

  try {
    return await adminNotify.notifyAdminFree({
      subject: title,
      text,
      title
    });
  } finally {
    if (process.env.FOUNDER_TELEGRAM_CHAT_ID) {
      if (prevChat == null) delete process.env.TELEGRAM_CHAT_ID;
      else process.env.TELEGRAM_CHAT_ID = prevChat;
    }
    if (process.env.FOUNDER_NTFY_TOPIC) {
      if (prevTopic == null) delete process.env.NTFY_TOPIC;
      else process.env.NTFY_TOPIC = prevTopic;
    }
  }
}

module.exports = {
  DEFAULT_THRESHOLDS,
  founderEmails,
  isFounderEmail,
  isFounderActor,
  getAutonomyThresholds,
  formatFounderAsk,
  notifyFounderAsk
};

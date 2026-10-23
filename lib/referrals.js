'use strict';

const MONTHLY_CAP = 5;

function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function countReferralsInMonth(users, referrerId, at = new Date()) {
  const key = monthKey(at);
  return (users || []).filter((u) => {
    if (!u || u.referredByUserId !== referrerId || !u.referredAt) return false;
    return monthKey(new Date(u.referredAt)) === key;
  }).length;
}

function canLinkReferral({ enabled, user, code, referrer, users, now }) {
  if (!enabled) {
    return { error: 'Los referidos están desactivados. Actívalos en Admin → Módulos.' };
  }
  if (!user) return { error: 'Usuario inválido' };
  const normalized = normalizeCode(code);
  if (!normalized) return { error: 'Código requerido' };
  if (user.usedReferral || user.referredByUserId) {
    return { error: 'Ya usaste un código de referido' };
  }
  if (!referrer) return { error: 'Código no válido' };
  if (referrer.id === user.id || referrer.referralCode === user.referralCode) {
    return { error: 'No puedes usar tu propio código' };
  }
  if (countReferralsInMonth(users, referrer.id, now) >= MONTHLY_CAP) {
    return { error: 'Este código ya llegó al tope de 5 amigos este mes' };
  }
  return { ok: true, code: normalized };
}

function linkReferral({ user, referrer, code, now }) {
  const at = (now || new Date()).toISOString();
  user.usedReferral = true;
  user.referredByUserId = referrer.id;
  user.referredAt = at;
  user.referralFriendDiscountUsed = false;
  user.referralSettled = false;
  return {
    success: true,
    bonus: 0,
    deferred: true,
    referredByUserId: referrer.id,
    code: normalizeCode(code)
  };
}

function isFirstPaidVisit(requests, userId, exceptRequestId) {
  return !(requests || []).some((r) => (
    r
    && r.clientId === userId
    && r.id !== exceptRequestId
    && (r.paymentStatus === 'approved' || r.status === 'completed')
  ));
}

function friendDiscountAmount({
  enabled,
  user,
  remaining,
  creditCLP,
  firstPaidVisit
}) {
  if (!enabled || !user?.referredByUserId || user.referralFriendDiscountUsed) return 0;
  if (!firstPaidVisit) return 0;
  const cap = Math.max(0, Math.round(Number(creditCLP) || 0));
  const due = Math.max(0, Math.round(Number(remaining) || 0));
  return Math.min(cap, due);
}

function shouldSettleReferrer({ enabled, request, user }) {
  if (!enabled || !request || !user) return false;
  if (user.referralSettled || request.referralRewardSettled) return false;
  if (!user.referredByUserId) return false;
  if (request.paymentStatus !== 'approved') return false;
  if (request.status !== 'completed' && request.techStatus !== 'completado') return false;
  return true;
}

module.exports = {
  MONTHLY_CAP,
  monthKey,
  normalizeCode,
  countReferralsInMonth,
  canLinkReferral,
  linkReferral,
  isFirstPaidVisit,
  friendDiscountAmount,
  shouldSettleReferrer
};

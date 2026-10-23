'use strict';

const referrals = require('./referrals');
const repository = require('../models/repository');
const db = require('./db');
const { ensureAppSettingsTable } = require('./appModeStore');

const META_KEY = 'referral_program_links_v1';
let metaMap = {};
let metaLoaded = false;

function parseSetting(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch (_) {
    return {};
  }
}

function userMeta(user) {
  if (!user) return {};
  return {
    referredByUserId: user.referredByUserId || null,
    referredAt: user.referredAt || null,
    referralFriendDiscountUsed: Boolean(user.referralFriendDiscountUsed),
    referralSettled: Boolean(user.referralSettled)
  };
}

function applyMetaToUser(user, meta) {
  if (!user || !meta) return;
  if (meta.referredByUserId) user.referredByUserId = meta.referredByUserId;
  if (meta.referredAt) user.referredAt = meta.referredAt;
  if (meta.referralFriendDiscountUsed != null) {
    user.referralFriendDiscountUsed = Boolean(meta.referralFriendDiscountUsed);
  }
  if (meta.referralSettled != null) user.referralSettled = Boolean(meta.referralSettled);
  if (user.referredByUserId) user.usedReferral = true;
}

async function loadMetaMap() {
  if (metaLoaded) return metaMap;
  metaLoaded = true;
  if (!db.isConfigured()) return metaMap;
  try {
    await ensureAppSettingsTable();
    const res = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      [META_KEY]
    );
    metaMap = parseSetting(res.rows?.[0]?.setting_value);
  } catch (err) {
    console.warn('[referrals] no se pudo leer el mapa de referidos:', err.message);
  }
  return metaMap;
}

function persistMetaMap() {
  if (!db.isConfigured()) return;
  repository.persist(async () => {
    await ensureAppSettingsTable();
    await db.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [META_KEY, JSON.stringify(metaMap)]
    );
  }, 'referidos meta');
}

function rememberUser(user) {
  if (!user?.id) return;
  metaMap[user.id] = userMeta(user);
  persistMetaMap();
  repository.persist(() => repository.saveUser(user), `referido ${user.id}`);
}

function hydrateUsers(store) {
  const users = store.USERS || [];
  for (const user of users) {
    applyMetaToUser(user, metaMap[user.id]);
  }
}

function enableReferralsModule(store) {
  if (typeof store.isReferralsEnabled === 'function' && store.isReferralsEnabled()) return;
  if (typeof store.toggleModule === 'function') {
    store.toggleModule('client_referidos', true);
  }
}

function persistRequest(request) {
  if (!request) return;
  repository.persist(() => repository.saveRequest(request), `referido visita ${request.id}`);
}

function install(store) {
  if (!store || store.__referralsInstalled) return store;
  store.__referralsInstalled = true;

  const origInit = store.init;
  if (typeof origInit === 'function') {
    store.init = async function initWithReferrals(...args) {
      const result = await origInit.apply(this, args);
      await loadMetaMap();
      hydrateUsers(store);
      enableReferralsModule(store);
      return result;
    };
  }

  store.applyReferralCode = function applyReferralCode(userId, code) {
    const enabled = typeof store.isReferralsEnabled === 'function'
      ? store.isReferralsEnabled()
      : true;
    const user = store.getUserById(userId);
    if (user) applyMetaToUser(user, metaMap[user.id]);
    const users = store.USERS || [];
    const normalized = referrals.normalizeCode(code);
    const referrer = users.find((u) => {
      if (!u || u.referralCode !== normalized) return false;
      return typeof store.canActAsClient === 'function'
        ? store.canActAsClient(u)
        : u.role === 'client';
    });
    const gate = referrals.canLinkReferral({
      enabled,
      user,
      code: normalized,
      referrer,
      users,
      now: new Date()
    });
    if (gate.error) return { error: gate.error };
    const linked = referrals.linkReferral({
      user,
      referrer,
      code: normalized,
      now: new Date()
    });
    const cfg = store.getReferralConfig ? store.getReferralConfig() : { creditCLP: 5000 };
    rememberUser(user);
    return { ...linked, creditCLP: cfg.creditCLP || 5000 };
  };

  const origDiscounts = store.applyCheckoutDiscounts;
  store.applyCheckoutDiscounts = function applyCheckoutDiscounts(userId, requestId, opts) {
    const result = origDiscounts.call(store, userId, requestId, opts);
    if (result?.error) return result;
    const request = store.getRequestById(requestId);
    const user = store.getUserById(userId);
    if (user) applyMetaToUser(user, metaMap[user.id]);
    const cfg = store.getReferralConfig ? store.getReferralConfig() : { creditCLP: 5000 };
    const extra = referrals.friendDiscountAmount({
      enabled: store.isReferralsEnabled ? store.isReferralsEnabled() : true,
      user,
      remaining: request?.amountDue,
      creditCLP: cfg.creditCLP,
      firstPaidVisit: referrals.isFirstPaidVisit(store.requests, userId, requestId)
    });
    if (extra > 0 && request) {
      request.discountReferral = extra;
      request.amountDue = Math.max(0, (request.amountDue || 0) - extra);
      request.estimatedVisit = request.amountDue;
      persistRequest(request);
    }
    return { success: true, summary: store.getCheckoutSummary(userId, requestId) };
  };

  const origSummary = store.getCheckoutSummary;
  store.getCheckoutSummary = function getCheckoutSummary(userId, requestId) {
    const summary = origSummary.call(store, userId, requestId);
    if (!summary) return summary;
    const request = store.getRequestById(requestId);
    summary.discountReferral = request?.discountReferral || 0;
    return summary;
  };

  const origPaid = store.markPaymentApproved;
  store.markPaymentApproved = function markPaymentApproved(requestId, paymentId, extras) {
    const request = origPaid.call(store, requestId, paymentId, extras);
    if (request?.discountReferral > 0) {
      const user = store.getUserById(request.clientId);
      if (user) {
        applyMetaToUser(user, metaMap[user.id]);
        user.referralFriendDiscountUsed = true;
        rememberUser(user);
      }
    }
    return request;
  };

  function settleIfNeeded(request) {
    if (!request) return;
    const user = store.getUserById(request.clientId);
    if (user) applyMetaToUser(user, metaMap[user.id]);
    const enabled = store.isReferralsEnabled ? store.isReferralsEnabled() : true;
    if (!referrals.shouldSettleReferrer({ enabled, request, user })) return;
    const referrer = store.getUserById(user.referredByUserId);
    if (!referrer) return;
    const cfg = store.getReferralConfig ? store.getReferralConfig() : { creditCLP: 5000 };
    const bonus = Math.max(0, Math.round(Number(cfg.creditCLP) || 0));
    if (bonus > 0 && typeof store.addUserCredits === 'function') {
      store.addUserCredits(referrer.id, bonus, {
        reason: 'referral',
        requestId: request.id,
        note: 'Crédito por primera visita de un amigo'
      });
    }
    referrer.referralsCount = (referrer.referralsCount || 0) + 1;
    if (store.isPointsEnabled && store.isPointsEnabled()) {
      const points = Math.max(0, Number(cfg.referrerPoints) || 0);
      if (points > 0) referrer.ziloPoints = (referrer.ziloPoints || 0) + points;
    }
    user.referralSettled = true;
    request.referralRewardSettled = true;
    rememberUser(user);
    repository.persist(() => repository.saveUser(referrer), `referidor ${referrer.id}`);
    persistRequest(request);
  }

  const origComplete = store.completeSiteWork;
  store.completeSiteWork = function completeSiteWork(...args) {
    const result = origComplete.apply(store, args);
    settleIfNeeded(result?.request || store.getRequestById(args[0]));
    return result;
  };

  const origBudget = store.respondSiteBudget;
  store.respondSiteBudget = function respondSiteBudget(...args) {
    const result = origBudget.apply(store, args);
    settleIfNeeded(result?.request);
    return result;
  };

  return store;
}

module.exports = {
  install,
  loadMetaMap,
  META_KEY
};

/**
 * Invitación por correo al agregar / vincular un técnico desde Mi equipo.
 */
'use strict';

const notifications = require('./notifications');
const emailVerification = require('./emailVerification');
const { appBaseUrl } = require('./emailLayout');
const repository = require('../models/repository');
const founderAlerts = require('./agents/founderAlerts');

async function prepareVerifyCode(store, tecnico, locale = 'es') {
  if (!tecnico || (typeof store.isEmailVerified === 'function' && store.isEmailVerified(tecnico))) {
    return null;
  }
  const prepared = emailVerification.prepareVerification(tecnico, { locale });
  tecnico.emailVerificationCodeHash = prepared.codeHash;
  tecnico.emailVerificationExpiresAt = prepared.expiresAt;
  tecnico.emailVerificationSentAt = prepared.sentAt;
  try {
    await repository.saveUser(tecnico);
  } catch (err) {
    console.error('[technician-invite] save verify:', err.message);
    return null;
  }
  return prepared.code;
}

/**
 * @returns {Promise<{ ok: boolean, demo?: boolean, error?: string, event?: string, status?: string }>}
 */
async function sendTechnicianInvite({
  store,
  tecnico,
  provider,
  linked = false,
  locale = 'es'
} = {}) {
  if (!tecnico?.email) return { ok: false, error: 'sin_email' };

  const event = linked ? 'technician.linked' : 'technician.invited';
  let verifyCode = null;
  if (!linked) {
    verifyCode = await prepareVerifyCode(store, tecnico, locale);
  }

  const base = appBaseUrl();
  let activateUrl = `${base}/login`;
  if (!linked && typeof store.issueTechnicianInviteToken === 'function') {
    const token = store.issueTechnicianInviteToken(tecnico.id);
    if (token) activateUrl = `${base}/activar-tecnico/${token}`;
  }

  let record = null;
  try {
    record = await notifications.sendEvent(event, {
      to: tecnico.email,
      phone: tecnico.phone || null,
      userId: tecnico.id,
      tecnico,
      provider,
      providerName: provider?.name,
      verifyCode,
      loginUrl: `${base}/login`,
      verifyUrl: `${base}/verificar-email`,
      activateUrl,
      meta: {
        providerId: provider?.id || null,
        technicianId: tecnico.id,
        linked: Boolean(linked)
      }
    });
  } catch (err) {
    console.error('[technician-invite]', err.message);
    return { ok: false, error: err.message || 'mail_error', event };
  }

  if (!record) return { ok: false, error: 'template_missing', event };
  if (record.status === 'failed') {
    founderAlerts.notifyInstant({
      agent: 'Sofía',
      severity: 'high',
      title: `Invitación técnico no enviada · ${tecnico.email}`,
      body: [
        `Empresa: ${provider?.name || provider?.email || '—'}`,
        `Técnico: ${tecnico.name || '—'} · ${tecnico.email}`,
        `Modo: ${linked ? 'vínculo' : 'cuenta nueva'}`,
        `Error: ${record.error || 'fallo SMTP'}`
      ].join('\n'),
      dedupeKey: `tech-invite-fail-${tecnico.email}`,
      store
    }).catch(() => {});
    return { ok: false, error: record.error || 'mail_failed', event, demo: false };
  }

  return {
    ok: true,
    demo: Boolean(record.meta?.demoMail),
    event,
    status: record.status
  };
}

module.exports = {
  sendTechnicianInvite
};

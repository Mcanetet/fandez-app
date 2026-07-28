const crypto = require('crypto');
const company = require('../config/company');
const notifications = require('./notifications');
const aland = require('./aland');

const DEFAULT_TIMEOUT_MINUTES = 15;
let running = false;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function buildChoiceUrl(requestId, token, choice) {
  const base = String(company.appUrl || '').replace(/\/$/, '');
  return `${base}/cliente/solicitud/${encodeURIComponent(requestId)}/sin-socio?token=${encodeURIComponent(token)}&choice=${encodeURIComponent(choice)}`;
}

async function createAlandNotice(store, request) {
  const client = store.getUserById(request.clientId);
  if (!client) return { conversation: null, message: null };

  const conversation = await aland.createConversation({
    serviceId: request.serviceId,
    serviceName: request.serviceName,
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email
  });
  const message = await aland.addMessage({
    conversationId: conversation.id,
    senderType: 'aland',
    senderName: 'Aland IA',
    body: `Han pasado 15 minutos y aún no encontramos un socio para tu servicio de ${request.serviceName}. ¿Quieres que sigamos buscando? Puedes responder desde la app o desde el enlace del correo.`,
    meta: {
      type: 'no_provider_choice',
      requestId: request.id,
      actions: ['refund', 'continue']
    }
  });
  return { conversation, message };
}

async function processRequest(store, io, request) {
  const client = store.getUserById(request.clientId);
  if (!client) return null;

  const token = crypto.randomBytes(32).toString('hex');
  let conversation = null;
  let message = null;
  try {
    ({ conversation, message } = await createAlandNotice(store, request));
  } catch (err) {
    console.error(`[sin-socio] Aland ${request.id}:`, err.message);
  }

  const updated = store.markNoProviderNotice(request.id, {
    tokenHash: hashToken(token),
    conversationId: conversation?.id || null
  });
  if (!updated) return null;

  const refundUrl = buildChoiceUrl(request.id, token, 'refund');
  const continueUrl = buildChoiceUrl(request.id, token, 'continue');
  await notifications.sendEvent('service.no_provider', {
    request: updated,
    client,
    to: client.email,
    refundUrl,
    continueUrl,
    meta: { alandConversationId: conversation?.id || null }
  });

  if (io) {
    const payload = {
      request: store.enrichRequestForClient(updated),
      conversationId: conversation?.id || null,
      message
    };
    io.to(`request_${request.id}`).emit(`request_update_${request.id}`, payload);
    io.to(`aland_client_${request.clientId}`).emit('no_provider_choice_required', payload);
    if (conversation && message) {
      io.to(`aland_client_${request.clientId}`).emit('aland_message', {
        conversationId: conversation.id,
        message
      });
    }
    io.to('aland_admin').emit('no_provider_choice_required', payload);
  }

  return updated;
}

async function run(store, io, { timeoutMinutes = DEFAULT_TIMEOUT_MINUTES } = {}) {
  if (running) return [];
  running = true;
  try {
    const promoted = typeof store.promoteDueScheduledSearches === 'function'
      ? store.promoteDueScheduledSearches()
      : [];
    for (const request of promoted) {
      try {
        const { notifyProvidersForRequest } = require('./dispatch');
        notifyProvidersForRequest(io, request);
        if (io) {
          io.to(`request_${request.id}`).emit(`request_update_${request.id}`, {
            request: store.enrichRequestForClient(request)
          });
        }
      } catch (err) {
        console.error(`[scheduled-search] ${request.id}:`, err.message);
      }
    }

    const stale = store.getUnassignedRequestsAwaitingNotice(timeoutMinutes);
    const processed = [];
    for (const request of stale) {
      try {
        const result = await processRequest(store, io, request);
        if (result) processed.push(result);
      } catch (err) {
        console.error(`[sin-socio] ${request.id}:`, err.message);
      }
    }
    return processed;
  } finally {
    running = false;
  }
}

function start(store, io, { timeoutMinutes = DEFAULT_TIMEOUT_MINUTES } = {}) {
  const intervalMs = 30 * 1000;
  const timer = setInterval(() => {
    run(store, io, { timeoutMinutes }).catch((err) => {
      console.error('[sin-socio] watcher:', err.message);
    });
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  DEFAULT_TIMEOUT_MINUTES,
  hashToken,
  run,
  start
};

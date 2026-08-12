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
          io.to(`aland_client_${request.clientId}`).emit('client_open_request_alert', {
            type: 'search_started',
            title: 'Iniciamos la búsqueda de técnico',
            body: `Ya comenzó la búsqueda para ${request.serviceName}.`,
            url: `/cliente/servicio/${request.serviceId}?tracking=${request.id}`,
            request: store.enrichRequestForClient(request)
          });
        }
      } catch (err) {
        console.error(`[scheduled-search] ${request.id}:`, err.message);
      }
    }

    const expired = typeof store.expireStaleUnassignedRequests === 'function'
      ? store.expireStaleUnassignedRequests()
      : [];
    for (const request of expired) {
      try {
        if (io) {
          const payload = {
            request: store.enrichRequestForClient(request),
            cancelled: true,
            expired: true
          };
          io.to(`request_${request.id}`).emit(`request_update_${request.id}`, payload);
          io.to(`aland_client_${request.clientId}`).emit('client_open_request_alert', {
            type: 'auto_expired',
            urgency: 'high',
            title: 'Solicitud cerrada por tiempo',
            body: `Cerramos ${request.serviceName}: estuvo abierta demasiado tiempo sin técnico. Se retuvo la tarifa base y se gestiona la devolución del resto.`,
            url: '/cliente',
            request: payload.request
          });
        }
        const client = store.getUserById(request.clientId);
        if (client?.email) {
          await notifications.sendEvent('service.cancelled_refund', {
            request,
            client,
            to: client.email,
            meta: {
              reason: 'auto_expired_unassigned',
              retentionFee: request.cancellationFeeCharged,
              refundAmount: request.refundAmount
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.error(`[expire-open] ${request.id}:`, err.message);
      }
    }

    // Alertas de pendientes abiertos (sin spam: máx. 1 cada 30 min por solicitud).
    if (io && typeof store.getClientAttentionItems === 'function') {
      const seenClients = new Set();
      for (const request of store.requests || []) {
        if (!['scheduled', 'searching', 'assigned', 'in_progress'].includes(request.status)) continue;
        if (seenClients.has(request.clientId)) continue;
        const items = store.getClientAttentionItems(request.clientId).filter((item) => item.urgency === 'high');
        if (!items.length) continue;
        seenClients.add(request.clientId);
        const top = items[0];
        const lastAt = Date.parse(request.clientAttentionAlertAt || '');
        if (Number.isFinite(lastAt) && Date.now() - lastAt < 30 * 60 * 1000) continue;
        request.clientAttentionAlertAt = new Date().toISOString();
        io.to(`aland_client_${request.clientId}`).emit('client_open_request_alert', top);
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

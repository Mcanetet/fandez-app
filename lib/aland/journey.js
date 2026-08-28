/**
 * Aland acompaña al cliente en cada hito del pedido.
 * Reutiliza o crea la conversación ligada a request.alandConversationId
 * y emite aland_message + journey_update por Socket.IO.
 */
const alandStore = require('./store');
const { getRequestTimeouts } = require('../requestTimeouts');

let getStore = null;
let ioRef = null;

const JOURNEY_COPY = {
  payment_searching: (r) =>
    `Pago confirmado. Estamos buscando un socio verificado para tu servicio de ${r.serviceName}. Esto puede tomar hasta unos ${getRequestTimeouts().unassignedNoticeMinutes} minutos; te avisaré aquí en cuanto haya novedades.`,
  provider_assigned: (r) =>
    `Ya tienes un socio asignado para ${r.serviceName}. Puedes seguir el estado en la app; si necesitas algo durante la visita, escribe aquí.`,
  technician_en_route: (r) =>
    `El técnico ya va en camino a tu domicilio (${r.serviceName}). Te avisaré cuando llegue.`,
  technician_on_site: (r) =>
    `El técnico llegó al domicilio. Si propone un presupuesto o un cambio de servicio, te pediremos aprobación en la app antes de continuar.`,
  budget_sent: (r, extra = {}) =>
    `Recibiste un presupuesto${extra.amount ? ` por ${formatCLP(extra.amount)}` : ''} para ${r.serviceName}. Revísalo y aprueba o rechaza en la app antes de que continúe el trabajo.`,
  additional_payment: (r, extra = {}) =>
    `Hay un pago pendiente${extra.amount ? ` de ${formatCLP(extra.amount)}` : ''}${extra.description ? ` (${extra.description})` : ''} por tu servicio de ${r.serviceName}. Puedes pagarlo desde el banner en la app.`,
  service_completed: (r) =>
    `Tu servicio de ${r.serviceName} quedó completado. Revisa el resumen en la app y, si puedes, deja una calificación: nos ayuda a mantener el estándar de atención.`
};

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

function bind({ store, io } = {}) {
  if (store) getStore = () => store;
  if (io) ioRef = io;
}

function attachConversationId(request, conversationId) {
  if (!getStore || !request || !conversationId) return;
  const store = getStore();
  const live = store.getAllRequests().find((item) => item.id === request.id) || request;
  if (live.alandConversationId === conversationId) return;
  live.alandConversationId = conversationId;
  store.repository.persist(() => store.repository.saveRequest(live), `aland journey ${live.id}`);
  request.alandConversationId = conversationId;
}

async function ensureConversation(request) {
  if (!getStore || !request?.clientId) return null;
  const store = getStore();
  const client = store.getUserById(request.clientId);
  if (!client) return null;

  if (request.alandConversationId) {
    const existing = await alandStore.getConversationById(request.alandConversationId);
    if (existing) return existing;
  }

  // Reutilizar conversación reciente del mismo cliente+servicio si existe
  try {
    const list = await alandStore.listConversations({ clientId: client.id, limit: 20 });
    const match = list.find((c) => c.serviceId === request.serviceId || c.serviceId === 'soporte-general');
    if (match) {
      attachConversationId(request, match.id);
      return match;
    }
  } catch (_) { /* fall through to create */ }

  const conversation = await alandStore.createConversation({
    serviceId: request.serviceId || 'soporte-general',
    serviceName: request.serviceName || 'Soporte Fandez',
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email
  });
  attachConversationId(request, conversation.id);
  return conversation;
}

/**
 * @param {object} request
 * @param {{ type: string, body?: string, amount?: number }} opts
 */
async function notifyClientJourney(request, opts = {}) {
  if (!request?.clientId) return null;
  const type = String(opts.type || '').trim();
  if (!type) return null;

  // Evitar spam: un aviso por tipo por request
  if (!request.alandJourneyNotices) request.alandJourneyNotices = {};
  if (request.alandJourneyNotices[type] && !opts.force) return null;

  let conversation;
  let message;
  try {
    conversation = await ensureConversation(request);
    if (!conversation) return null;

    const bodyFn = JOURNEY_COPY[type];
    const body = opts.body || (typeof bodyFn === 'function' ? bodyFn(request, opts) : null);
    if (!body) return null;

    message = await alandStore.addMessage({
      conversationId: conversation.id,
      senderType: 'aland',
      senderName: 'Sofía',
      body,
      meta: {
        type: 'journey_update',
        journeyType: type,
        requestId: request.id
      }
    });
  } catch (err) {
    console.error(`[aland-journey] ${request.id} ${type}:`, err.message);
    return null;
  }

  if (getStore) {
    const store = getStore();
    const live = store.getAllRequests().find((item) => item.id === request.id) || request;
    if (!live.alandJourneyNotices) live.alandJourneyNotices = {};
    live.alandJourneyNotices[type] = new Date().toISOString();
    store.repository.persist(() => store.repository.saveRequest(live), `aland journey notice ${live.id}`);
    request.alandJourneyNotices = live.alandJourneyNotices;
  }

  if (ioRef) {
    const payload = {
      conversationId: conversation.id,
      message,
      requestId: request.id,
      journeyType: type
    };
    ioRef.to(`aland_client_${request.clientId}`).emit('aland_message', payload);
    ioRef.to(`aland_client_${request.clientId}`).emit('journey_update', payload);
    ioRef.to(`request_${request.id}`).emit('journey_update', payload);
    ioRef.to('aland_admin').emit('aland_monitor_update', {
      conversationId: conversation.id,
      message
    });
  }

  return { conversation, message };
}

module.exports = {
  bind,
  notifyClientJourney,
  JOURNEY_COPY
};

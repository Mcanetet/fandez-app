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
    `Listo, pago confirmado. Estoy buscando un socio para ${r.serviceName}. Puede tomar unos ${getRequestTimeouts().unassignedNoticeMinutes} min; te aviso aquí.`,
  provider_assigned: (r) =>
    `Ya tienes socio para ${r.serviceName}. Sigue el estado en la app; si necesitas algo de la visita, escríbeme.`,
  technician_en_route: (r) =>
    `El técnico va en camino (${r.serviceName}). Te aviso cuando llegue.`,
  technician_on_site: (r) =>
    `El técnico ya está en el domicilio. Si hay presupuesto o cambio, lo apruebas en la app antes de seguir.`,
  budget_sent: (r, extra = {}) =>
    `Tienes un presupuesto${extra.amount ? ` de ${formatCLP(extra.amount)}` : ''} por ${r.serviceName}. Revísalo en la app para aprobar o rechazar.`,
  materials_purchase: (r, extra = {}) =>
    `El técnico pide OK para un producto/material (~${extra.amount ? formatCLP(extra.amount) : 'precio referencial'})${extra.description ? `: ${extra.description}` : ''}. Es un precio aproximado de catálogo: si apruebas se cobra ese monto a la tarjeta y, al subir la boleta o factura, se valida el precio real (puede haber un ajuste a favor o en contra). Bajo $10.000 va incluido.`,
  activity_change: (r, extra = {}) =>
    `Hay un cambio de precio${extra.activityName ? ` (${extra.activityName})` : ''}${extra.amount ? ` · aprox. ${formatCLP(extra.amount)}` : ''} en ${r.serviceName}. El total de productos es referencial; la boleta o factura confirma el monto final y puede haber modificaciones. En la app: Apruebo · Más detalles · No aprobar.`,
  additional_payment: (r, extra = {}) =>
    `Hay un pago pendiente${extra.amount ? ` de ${formatCLP(extra.amount)}` : ''}${extra.description ? ` (${extra.description})` : ''} por ${r.serviceName}. Puedes pagarlo desde el aviso en la app.`,
  materials_trueup: (r, extra = {}) => {
    if (extra.due > 0) {
      return `Ya validamos el precio con la boleta o factura del producto. Queda un ajuste de ${formatCLP(extra.due)} (el documento fue mayor al aproximado). Págala en la app para cerrar el total correcto.`;
    }
    if (extra.credit > 0) {
      return `Ya validamos el precio con la boleta o factura: costó menos que el aproximado. Queda un saldo a tu favor de ${formatCLP(extra.credit)} para devolución.`;
    }
    if (extra.materialsTotal > 0) {
      return `Precio del producto validado con boleta o factura (${formatCLP(extra.materialsTotal)}): coincide con lo aproximado. Sin cambios adicionales.`;
    }
    return `El precio del producto se validó con la boleta o factura de la compra.`;
  },
  service_completed: (r) => {
    if (r.serviceId === 'jardineria' || r.gardenIntake) {
      return `Listo: tu proyecto de jardinería quedó cerrado. Revisa los entregables en el resumen y, si puedes, deja una calificación.`;
    }
    return `Listo: ${r.serviceName} quedó completado. Si puedes, deja una calificación en la app — nos ayuda a mantener el estándar.`;
  },
  garden_deliverable: (r, extra = {}) =>
    `Se cargó un entregable de tu proyecto${extra.label ? ` (${extra.label})` : ''}${extra.progress ? ` · ${extra.progress}` : ''}. Los verás completos al cerrar la visita.`
};

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

function bind({ store, io } = {}) {
  if (store) getStore = () => store;
  if (io) ioRef = io;
}

function getIo() {
  return ioRef;
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
  getIo,
  notifyClientJourney,
  JOURNEY_COPY
};

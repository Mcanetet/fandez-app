/**
 * Tools de lectura para Sofía (sin function-calling OpenAI).
 * Inyecta contexto vivo del cliente en el prompt.
 */

'use strict';

function formatCLP(n) {
  const v = Math.max(0, parseInt(n, 10) || 0);
  return `$${v.toLocaleString('es-CL')}`;
}

/**
 * @returns {string|null} bloque de texto para el system prompt
 */
function buildClientLiveContext(appStore, user) {
  if (!appStore || !user?.id || user.role !== 'client') return null;

  const requests = (typeof appStore.getRequestsByClient === 'function'
    ? appStore.getRequestsByClient(user.id)
    : (typeof appStore.getClientRequests === 'function'
      ? appStore.getClientRequests(user.id)
      : (appStore.requests || []).filter((r) => r.clientId === user.id))) || [];

  const active = requests
    .filter((r) => !['cancelled', 'completed', 'refunded'].includes(String(r.status || '')))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 3);

  const recentDone = requests
    .filter((r) => r.status === 'completed')
    .sort((a, b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')))
    .slice(0, 1);

  const lines = ['DATOS EN VIVO DEL CLIENTE (fuente de verdad; no inventes fuera de esto):'];

  if (!active.length && !recentDone.length) {
    lines.push('- Sin pedidos activos en este momento.');
    return lines.join('\n');
  }

  const list = active.length ? active : recentDone;
  list.forEach((r, i) => {
    lines.push(
      `- Pedido ${i + 1}: ${r.serviceName || r.serviceId || 'servicio'} · id ${r.id}`,
      `  estado=${r.status || '—'} · tech=${r.techStatus || '—'} · pago=${r.paymentStatus || '—'}`,
      `  monto=${formatCLP(r.amountDue || r.amountPaid || r.visitPricePaid || 0)} · comuna/dir=${r.commune || r.address || '—'}`,
      r.technicianName ? `  técnico=${r.technicianName}` : null,
      r.providerName ? `  socio=${r.providerName}` : null,
      r.refundStatus ? `  reembolso=${r.refundStatus} ${r.refundAmount != null ? formatCLP(r.refundAmount) : ''}` : null,
      r.safetyAlert ? `  alerta seguridad registrada=${r.safetyAlert.at || 'sí'}` : null
    );
  });

  return lines.filter(Boolean).join('\n');
}

function wantsLiveStatus(text) {
  const t = String(text || '').toLowerCase();
  return /estado|pedido|solicitud|seguimiento|t[eé]cnico|en camino|lleg[oó]|pago|cobro|reembolso|devoluci[oó]n|presupuesto|d[oó]nde est[aá]|mi visita|asignad/.test(t);
}

module.exports = {
  buildClientLiveContext,
  wantsLiveStatus,
  formatCLP
};

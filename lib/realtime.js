/**
 * Emisión acotada de updates de pedido (sin broadcast global).
 * Solo room del pedido + sockets registrados de socio/técnico asignados.
 */

function emitRequestUpdateToParties(io, store, request, payload) {
  if (!io || !request?.id || !payload) return;
  const event = `request_update_${request.id}`;
  io.to(`request_${request.id}`).emit(event, payload);

  if (request.providerId && store?.providerSockets) {
    const sid = store.providerSockets.get(request.providerId);
    if (sid) io.to(sid).emit(event, payload);
  }
  if (request.technicianId && store?.technicianSockets) {
    const sid = store.technicianSockets.get(request.technicianId);
    if (sid) io.to(sid).emit(event, payload);
  }
}

module.exports = {
  emitRequestUpdateToParties
};

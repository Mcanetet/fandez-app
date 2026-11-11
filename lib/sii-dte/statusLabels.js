/**
 * Etiquetas en español para siiStatus (valores internos en inglés).
 */
'use strict';

const SII_STATUS_LABELS = {
  pending: 'Pendiente',
  signed: 'Firmado',
  sent: 'Enviado',
  processing: 'En proceso',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  registered: 'Registrado',
  demo: 'Demo',
  // por si llega en mayúsculas desde BD/UI antigua
  PENDING: 'Pendiente',
  SIGNED: 'Firmado',
  SENT: 'Enviado',
  PROCESSING: 'En proceso',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado'
};

function siiStatusLabel(status) {
  const key = String(status || '').toLowerCase().trim();
  if (!key) return '—';
  return SII_STATUS_LABELS[key] || String(status);
}

module.exports = {
  SII_STATUS_LABELS,
  siiStatusLabel
};

/**
 * Receptores frecuentes del facturador admin (no son socios Fandez).
 * Útil para set de pruebas / envíos al SII.
 */
'use strict';

const PRESET_RECEPTORS = [
  {
    id: 'preset:sii',
    name: 'Servicio de Impuestos Internos',
    legalName: 'SERVICIO DE IMPUESTOS INTERNOS',
    rut: '60.803.000-K',
    giro: 'SERVICIOS DE LA ADMINISTRACION PUBLICA',
    address: 'TEATINOS 120',
    commune: 'SANTIAGO',
    city: 'SANTIAGO',
    email: '',
    preset: true
  }
];

function listReceptorPresets() {
  return PRESET_RECEPTORS.map((p) => ({ ...p }));
}

function isPresetReceptorId(id) {
  return String(id || '').startsWith('preset:');
}

module.exports = {
  PRESET_RECEPTORS,
  listReceptorPresets,
  isPresetReceptorId
};

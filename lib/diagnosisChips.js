/**
 * Chips de diagnóstico en terreno, acordes a la especialidad del pedido.
 * Evita mostrar preguntas de gasfitería en cerrajería (y viceversa).
 */

const COMMON = ['Otro'];

const BY_SERVICE = {
  gasfiter: [
    'Fuga / goteo',
    'No sale agua',
    'Baja presión',
    'WC / estanque',
    'Desagüe tapado',
    'Olor a gas',
    'Cañería rota'
  ],
  electrico: [
    'No enciende',
    'Salta el diferencial',
    'Cortocircuito / chispa',
    'Tablero / automático',
    'Toma / enchufe fallando',
    'Luminaria',
    'Olor a quemado'
  ],
  cerrajero: [
    'Puerta / chapa trabada',
    'Llave perdida o rota',
    'Cilindro dañado',
    'Cerradura no gira',
    'Copia de llaves',
    'Cambio de chapa',
    'Apertura de emergencia'
  ],
  termos: [
    'No calienta',
    'Fuga de agua',
    'No enciende',
    'Error en display',
    'Baja presión / sin agua caliente',
    'Ruido anormal',
    'Olor a gas'
  ],
  calderas: [
    'No enciende',
    'Error / código en panel',
    'Sin calefacción',
    'Sin agua caliente',
    'Fuga',
    'Presión baja',
    'Olor a gas'
  ],
  lavavajillas: [
    'No enciende',
    'No lava / no enjuaga',
    'Fuga de agua',
    'No desagua',
    'Hace ruido',
    'Puerta / cierre',
    'Error en display'
  ],
  lavadora: [
    'No enciende',
    'No centrifuga',
    'Fuga de agua',
    'No desagua',
    'Hace ruido / vibra',
    'Puerta trabada',
    'Error en display'
  ],
  generadores: [
    'No parte',
    'No genera energía',
    'Corte intermitente',
    'Sobrecalentamiento',
    'Ruido / vibración',
    'Fuga de combustible',
    'Panel / transfer'
  ],
  pintura: [
    'Humedad / manchas',
    'Desprendimiento',
    'Grietas',
    'Preparación de muro',
    'Acabado irregular',
    'Cambio de color',
    'Área mayor a lo cotizado'
  ],
  jardineria: [
    'Poda / mantenimiento',
    'Riego / goteras',
    'Césped / maleza',
    'Árbol / riesgo',
    'Diseño / proyecto',
    'Instalación de plantas',
    'Área distinta a lo cotizado'
  ]
};

const FALLBACK = [
  'No funciona como debería',
  'Daño visible',
  'Ruido / vibración',
  'Fuga o escape',
  'No enciende',
  'Se cayó / golpe'
];

function getDiagnosisChips(serviceId) {
  const key = String(serviceId || '').trim().toLowerCase();
  const chips = BY_SERVICE[key] || FALLBACK;
  return [...chips, ...COMMON.filter((c) => !chips.includes(c))];
}

module.exports = {
  getDiagnosisChips,
  BY_SERVICE
};

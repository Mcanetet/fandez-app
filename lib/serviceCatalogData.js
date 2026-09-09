/**
 * Catálogo base de especialidades y subservicios (precios CLP en horario normal).
 * Admin puede sobrescribir precios vía pricing.catalogPrices.
 */

'use strict';

/** Mapeo servicio de la app → especialidad del catálogo */
const SERVICE_TO_SPECIALTY = {
  gasfiter: 'gasfiteria',
  electrico: 'electricidad',
  termos: 'termos-electricos',
  cerrajero: 'cerrajeria',
  lavadora: 'lavadoras',
  lavavajillas: 'lavavajillas',
  calderas: 'calderas',
  generadores: 'generadores',
  pintura: 'pintura',
  jardineria: 'jardineria'
};

const SERVICE_CATALOG = [
  {
    id: 'gasfiteria',
    name: 'Gasfitería',
    activities: [
      { id: 'gas-cambio-llave', name: 'Cambio o reparación de llave / grifería', kind: 'correctiva', basePrice: 110000 },
      { id: 'gas-sanitario', name: 'Reparación o cambio de sanitario / WC', kind: 'correctiva', basePrice: 140000 },
      { id: 'gas-ducha', name: 'Reparación o instalación de ducha', kind: 'correctiva', basePrice: 130000 },
      { id: 'gas-tina', name: 'Reparación de tina / hidromasaje', kind: 'correctiva', basePrice: 150000 },
      { id: 'gas-lavamanos', name: 'Reparación o instalación de lavamanos', kind: 'correctiva', basePrice: 120000 },
      { id: 'gas-destape', name: 'Destape de cañería / alcantarillado', kind: 'correctiva', basePrice: 160000 },
      { id: 'gas-filtracion', name: 'Reparación de filtración', kind: 'correctiva', basePrice: 140000 },
      { id: 'gas-sifones', name: 'Limpieza o cambio de sifones', kind: 'preventiva', basePrice: 110000 },
      { id: 'gas-matriz', name: 'Inspección y mantención de matriz', kind: 'preventiva', basePrice: 120000 },
      { id: 'gas-estanque', name: 'Reparación de estanque de WC', kind: 'correctiva', basePrice: 115000 },
      { id: 'gas-llave-paso', name: 'Cambio de llave de paso', kind: 'correctiva', basePrice: 105000 },
      { id: 'gas-calefont-fuga', name: 'Revisión fuga en circuito de agua caliente', kind: 'correctiva', basePrice: 135000 }
    ]
  },
  {
    id: 'electricidad',
    name: 'Electricidad',
    activities: [
      { id: 'elec-enchufe', name: 'Cambio o reparación de enchufe', kind: 'correctiva', basePrice: 100000 },
      { id: 'elec-interruptor', name: 'Cambio de interruptor / dimmer', kind: 'correctiva', basePrice: 100000 },
      { id: 'elec-punto-luz', name: 'Instalación de punto de luz', kind: 'correctiva', basePrice: 120000 },
      { id: 'elec-cortocircuito', name: 'Normalización de cortocircuito', kind: 'correctiva', basePrice: 150000 },
      { id: 'elec-automaticos', name: 'Reemplazo de automáticos principales', kind: 'correctiva', basePrice: 135000 },
      { id: 'elec-balanceo', name: 'Balanceo de cargas en tablero', kind: 'preventiva', basePrice: 115000 },
      { id: 'elec-aislamiento', name: 'Pruebas de aislamiento', kind: 'preventiva', basePrice: 105000 },
      { id: 'elec-tablero', name: 'Revisión / ordenamiento de tablero', kind: 'preventiva', basePrice: 125000 },
      { id: 'elec-timbre', name: 'Instalación o reparación de timbre', kind: 'correctiva', basePrice: 100000 },
      { id: 'elec-ventilador', name: 'Instalación de ventilador de techo', kind: 'correctiva', basePrice: 130000 }
    ]
  },
  {
    id: 'aire-acondicionado',
    name: 'Aire Acondicionado',
    activities: [
      { id: 'ac-mantencion', name: 'Mantención completa y sanitización', kind: 'preventiva', basePrice: 110000 },
      { id: 'ac-serpentines', name: 'Limpieza química serpentines', kind: 'preventiva', basePrice: 125000 },
      { id: 'ac-refrigerante', name: 'Recarga de refrigerante', kind: 'correctiva', basePrice: 150000 },
      { id: 'ac-placa', name: 'Reemplazo de placa electrónica', kind: 'correctiva', basePrice: 140000 },
      { id: 'ac-instalacion', name: 'Instalación de equipo split', kind: 'correctiva', basePrice: 180000 },
      { id: 'ac-drenaje', name: 'Reparación de drenaje / fuga de agua', kind: 'correctiva', basePrice: 120000 },
      { id: 'ac-ruido', name: 'Diagnóstico y corrección de ruido', kind: 'correctiva', basePrice: 115000 }
    ]
  },
  {
    id: 'calderas',
    name: 'Calderas de Edificios',
    activities: [
      { id: 'cald-mensual', name: 'Mantención mensual de caldera', kind: 'preventiva', basePrice: 250000 },
      { id: 'cald-gases', name: 'Análisis de gases y calibración', kind: 'preventiva', basePrice: 180000 },
      { id: 'cald-bombas', name: 'Cambio de bombas circuladoras', kind: 'correctiva', basePrice: 220000 },
      { id: 'cald-colector', name: 'Reparación de fuga en colector', kind: 'correctiva', basePrice: 310000 },
      { id: 'cald-quemador', name: 'Revisión / ajuste de quemador', kind: 'correctiva', basePrice: 200000 },
      { id: 'cald-valvula', name: 'Cambio de válvula de seguridad', kind: 'correctiva', basePrice: 190000 }
    ]
  },
  {
    id: 'generadores',
    name: 'Mantenimiento de Generadores',
    activities: [
      { id: 'gen-mantencion', name: 'Mantención preventiva completa', kind: 'preventiva', basePrice: 220000 },
      { id: 'gen-aceite-filtros', name: 'Cambio de aceite y filtros', kind: 'preventiva', basePrice: 180000 },
      { id: 'gen-prueba-electrica', name: 'Prueba de sistema eléctrico y protecciones', kind: 'preventiva', basePrice: 160000 },
      { id: 'gen-transferencia', name: 'Revisión de tablero de transferencia automática', kind: 'preventiva', basePrice: 190000 },
      { id: 'gen-carga', name: 'Prueba de funcionamiento con carga', kind: 'preventiva', basePrice: 250000 },
      { id: 'gen-bateria', name: 'Revisión o cambio de batería de partida', kind: 'correctiva', basePrice: 140000 },
      { id: 'gen-falla', name: 'Diagnóstico y reparación de falla de arranque', kind: 'correctiva', basePrice: 170000 }
    ]
  },
  {
    id: 'termos-electricos',
    name: 'Termos Eléctricos',
    activities: [
      { id: 'termo-sarro', name: 'Limpieza de sarro y cambio de ánodo', kind: 'preventiva', basePrice: 110000 },
      { id: 'termo-valvula', name: 'Inspección de válvula de sobrepresión', kind: 'preventiva', basePrice: 100000 },
      { id: 'termo-resistencia', name: 'Reemplazo de resistencia y termostato', kind: 'correctiva', basePrice: 135000 },
      { id: 'termo-120l', name: 'Instalación o cambio de termo 120L', kind: 'correctiva', basePrice: 160000 },
      { id: 'termo-fuga', name: 'Reparación de fuga en termo', kind: 'correctiva', basePrice: 125000 },
      { id: 'termo-no-cala', name: 'Diagnóstico termo no calienta', kind: 'correctiva', basePrice: 110000 }
    ]
  },
  {
    id: 'cerrajeria',
    name: 'Cerrajería',
    activities: [
      { id: 'cerr-apertura', name: 'Apertura de puerta (sin daño)', kind: 'correctiva', basePrice: 100000 },
      { id: 'cerr-cambio-chapa', name: 'Cambio de chapa / cerradura', kind: 'correctiva', basePrice: 120000 },
      { id: 'cerr-cilindro', name: 'Cambio de cilindro', kind: 'correctiva', basePrice: 110000 },
      { id: 'cerr-copia-llaves', name: 'Copia de llaves (servicio a domicilio)', kind: 'preventiva', basePrice: 100000 },
      { id: 'cerr-blindaje', name: 'Refuerzo / blindaje de puerta', kind: 'correctiva', basePrice: 180000 }
    ]
  },
  {
    id: 'lavadoras',
    name: 'Lavadoras',
    activities: [
      { id: 'lav-no-centrifuga', name: 'Reparación: no centrifuga', kind: 'correctiva', basePrice: 120000 },
      { id: 'lav-fuga', name: 'Reparación de fuga de agua', kind: 'correctiva', basePrice: 115000 },
      { id: 'lav-bomba', name: 'Cambio de bomba de desagüe', kind: 'correctiva', basePrice: 130000 },
      { id: 'lav-tarjeta', name: 'Diagnóstico / cambio de tarjeta', kind: 'correctiva', basePrice: 150000 },
      { id: 'lav-mantencion', name: 'Mantención preventiva', kind: 'preventiva', basePrice: 100000 }
    ]
  },
  {
    id: 'lavavajillas',
    name: 'Lavavajillas',
    activities: [
      { id: 'lv-no-drena', name: 'Reparación: no drena', kind: 'correctiva', basePrice: 120000 },
      { id: 'lv-fuga', name: 'Reparación de fuga', kind: 'correctiva', basePrice: 115000 },
      { id: 'lv-bomba', name: 'Cambio de bomba', kind: 'correctiva', basePrice: 135000 },
      { id: 'lv-programas', name: 'Falla de programas / electrónica', kind: 'correctiva', basePrice: 145000 },
      { id: 'lv-mantencion', name: 'Mantención y limpieza profunda', kind: 'preventiva', basePrice: 100000 }
    ]
  },
  {
    id: 'pintura',
    name: 'Pintura',
    activities: [
      { id: 'pint-habitacion', name: 'Pintura de habitación (hasta 12 m²)', kind: 'correctiva', basePrice: 140000 },
      { id: 'pint-living', name: 'Pintura de living / comedor', kind: 'correctiva', basePrice: 180000 },
      { id: 'pint-techo', name: 'Pintura de techo', kind: 'correctiva', basePrice: 150000 },
      { id: 'pint-retouche', name: 'Retoque y corrección de manchas', kind: 'correctiva', basePrice: 110000 },
      { id: 'pint-muros-humedad', name: 'Reparación de muro + pintura (humedad)', kind: 'correctiva', basePrice: 160000 },
      { id: 'pint-puertas', name: 'Pintura de puertas / marcos', kind: 'correctiva', basePrice: 130000 },
      { id: 'pint-preparacion', name: 'Preparación de superficie (lijado / pasta)', kind: 'preventiva', basePrice: 120000 },
      { id: 'pint-fachada-parcial', name: 'Pintura fachada parcial / exterior acotado', kind: 'correctiva', basePrice: 220000 }
    ]
  },
  {
    id: 'jardineria',
    name: 'Jardinería',
    pricingUnit: 'm2',
    activities: [
      { id: 'jard-cesped', name: 'Corte de césped / pasto', kind: 'preventiva', pricingUnit: 'm2', pricePerM2: 3500, minM2: 15, basePrice: 3500 },
      { id: 'jard-desmalezado', name: 'Desmalezado y limpieza de jardín', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: 4500, minM2: 15, basePrice: 4500 },
      { id: 'jard-mantencion', name: 'Mantención integral (corte, maleza y bordes)', kind: 'preventiva', pricingUnit: 'm2', pricePerM2: 6000, minM2: 15, basePrice: 6000 },
      { id: 'jard-poda', name: 'Poda de arbustos y setos', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: 7000, minM2: 15, basePrice: 7000 },
      { id: 'jard-jardineras', name: 'Jardineras, maceteros y canteros', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: 5500, minM2: 10, basePrice: 5500 },
      { id: 'jard-plantacion', name: 'Plantación o césped en rollo (mano de obra)', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: 9000, minM2: 15, basePrice: 9000 }
    ]
  }
];

const GARDEN_MIN_JOB_CLP = 40000;
const GARDEN_OTHER_RATE_M2 = 5500;

function isPerM2Activity(activity) {
  return activity?.pricingUnit === 'm2';
}

function isPerM2Service(serviceId) {
  return String(serviceId || '') === 'jardineria';
}

function resolveM2QuoteBase(activity, squareMeters) {
  const rate = Number(activity?.pricePerM2 || activity?.basePrice) || GARDEN_OTHER_RATE_M2;
  const m2 = Math.max(10, Number(squareMeters) || 0);
  return Math.max(GARDEN_MIN_JOB_CLP, Math.round(rate * m2));
}

module.exports = {
  SERVICE_CATALOG,
  SERVICE_TO_SPECIALTY,
  GARDEN_MIN_JOB_CLP,
  GARDEN_OTHER_RATE_M2,
  isPerM2Activity,
  isPerM2Service,
  resolveM2QuoteBase
};

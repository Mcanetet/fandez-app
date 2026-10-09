/**
 * Catálogo base de especialidades y subservicios (precios CLP en horario normal).
 * Admin puede sobrescribir precios vía pricing.catalogPrices.
 */

'use strict';

/** Mapeo servicio de la app → especialidad del catálogo */
const SERVICE_TO_SPECIALTY = {
  gasfiter: 'gasfiteria',
  electrico: 'electricidad',
  aires: 'aire-acondicionado',
  termos: 'termos-electricos',
  cerrajero: 'cerrajeria',
  /** Legacy: ya no hay servicio cliente; actividades viven en gasfitería / otros */
  lavadora: 'otros',
  lavavajillas: 'gasfiteria',
  calderas: 'calderas',
  generadores: 'generadores',
  pintura: 'pintura',
  jardineria: 'jardineria-urgencia',
  paisajismo: 'paisajismo',
  fotovoltaico: 'fotovoltaico',
  piscinas: 'piscinas',
  limpieza: 'limpieza',
  escombros: 'escombros',
  otros: 'otros'
};

/** Suportlux (Word): neto + $5.000 + IVA 19% → precio cliente IVA incl. */
const SUPORTLUX_MARKUP_CLP = 5000;
const SUPORTLUX_IVA = 1.19;
function suportluxClientPrice(netoClp) {
  return Math.round((Number(netoClp) + SUPORTLUX_MARKUP_CLP) * SUPORTLUX_IVA);
}
/** Facturación mínima Word $250.000 netos → mismo markup + IVA. */
const ESCOMBROS_MIN_JOB_CLP = suportluxClientPrice(250000);

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
      { id: 'gas-calefont-fuga', name: 'Revisión fuga en circuito de agua caliente', kind: 'correctiva', basePrice: 135000 },
      { id: 'lav-fuga', name: 'Lavadora: reparación de fuga de agua', kind: 'correctiva', basePrice: 115000 },
      { id: 'lav-bomba', name: 'Lavadora: cambio de bomba de desagüe', kind: 'correctiva', basePrice: 130000 },
      { id: 'lv-no-drena', name: 'Lavavajillas: reparación no drena', kind: 'correctiva', basePrice: 120000 },
      { id: 'lv-fuga', name: 'Lavavajillas: reparación de fuga', kind: 'correctiva', basePrice: 115000 },
      { id: 'lv-bomba', name: 'Lavavajillas: cambio de bomba', kind: 'correctiva', basePrice: 135000 }
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
      { id: 'ac-mantencion', name: 'Mantención completa y sanitización', kind: 'preventiva', basePrice: 89000 },
      { id: 'ac-serpentines', name: 'Limpieza química serpentines', kind: 'preventiva', basePrice: 99000 },
      { id: 'ac-refrigerante', name: 'Recarga de refrigerante', kind: 'correctiva', basePrice: 99000 },
      { id: 'ac-placa', name: 'Reemplazo de placa electrónica', kind: 'correctiva', basePrice: 115000 },
      { id: 'ac-instalacion', name: 'Instalación de equipo split', kind: 'correctiva', basePrice: 170000 },
      { id: 'ac-drenaje', name: 'Reparación de drenaje / fuga de agua', kind: 'correctiva', basePrice: 99000 },
      { id: 'ac-ruido', name: 'Diagnóstico y corrección de ruido', kind: 'correctiva', basePrice: 95000 }
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
      { id: 'termo-no-cala', name: 'Diagnóstico termo no calienta', kind: 'correctiva', basePrice: 110000 },
      /** Smoke test MP / flujo completo: cobro fijo $1 CLP sin piso ni recargos. */
      { id: 'termo-prueba-1', name: 'Prueba de 1$', kind: 'correctiva', basePrice: 1, quoteMode: 'smoke_test' }
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
    id: 'otros',
    name: 'Otros',
    activities: [
      { id: 'lav-no-centrifuga', name: 'Lavadora: no centrifuga', kind: 'correctiva', basePrice: 120000 },
      { id: 'lav-tarjeta', name: 'Lavadora: diagnóstico / cambio de tarjeta', kind: 'correctiva', basePrice: 150000 },
      { id: 'lav-mantencion', name: 'Lavadora: mantención preventiva', kind: 'preventiva', basePrice: 100000 },
      { id: 'lv-programas', name: 'Lavavajillas: falla de programas / electrónica', kind: 'correctiva', basePrice: 145000 },
      { id: 'lv-mantencion', name: 'Lavavajillas: mantención y limpieza profunda', kind: 'preventiva', basePrice: 100000 },
      { id: 'otros-diagnostico', name: 'Diagnóstico / visita otros oficios', kind: 'correctiva', basePrice: 100000 }
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
    id: 'jardineria-urgencia',
    name: 'Jardinería',
    pricingUnit: 'job',
    activities: [
      { id: 'jard-poda', name: 'Poda de árboles o arbustos', kind: 'correctiva', basePrice: 65000 },
      { id: 'jard-cesped', name: 'Corte de pasto / césped', kind: 'preventiva', basePrice: 55000 },
      { id: 'jard-maleza', name: 'Limpieza de maleza', kind: 'correctiva', basePrice: 60000 },
      { id: 'jard-riego-reparacion', name: 'Reparación de riego', kind: 'correctiva', basePrice: 70000 },
      { id: 'jard-urgente-otro', name: 'Otro arreglo de jardín', kind: 'correctiva', basePrice: 55000 }
    ]
  },
  {
    id: 'paisajismo',
    name: 'Paisajismo',
    pricingUnit: 'job',
    activities: [
      {
        id: 'jard-diseno',
        name: 'Diseño de Jardines',
        kind: 'correctiva',
        pricingUnit: 'job',
        quoteMode: 'garden_intake',
        basePrice: 40000,
        minM2: 100,
        description: 'Proyectos nuevos o remodelación desde 100 m²'
      },
      {
        id: 'jard-construccion',
        name: 'Construcción de Jardines',
        kind: 'correctiva',
        pricingUnit: 'job',
        quoteMode: 'garden_intake',
        basePrice: 40000,
        minM2: 100,
        description: 'Ejecución, nuevas obras o remodelaciones desde 100 m²'
      },
      {
        id: 'jard-mantencion',
        name: 'Mantención de Jardines',
        kind: 'preventiva',
        pricingUnit: 'job',
        quoteMode: 'garden_intake',
        basePrice: 40000,
        minM2: 100,
        description: 'Condominios, edificios o espacios comunes desde 100 m²'
      }
    ]
  },
  {
    id: 'fotovoltaico',
    name: 'Paneles solares',
    pricingUnit: 'job',
    activities: [
      {
        id: 'fv-eval-autoconsumo',
        name: 'Evaluación FV · Autoconsumo',
        kind: 'correctiva',
        pricingUnit: 'job',
        quoteMode: 'fv_intake',
        basePrice: 49000,
        description: 'Visita técnica + levantamiento; cobro inicial de evaluación'
      },
      {
        id: 'fv-eval-netbilling',
        name: 'Evaluación FV · Netbilling',
        kind: 'correctiva',
        pricingUnit: 'job',
        quoteMode: 'fv_intake',
        basePrice: 49000,
        description: 'Visita técnica + levantamiento; cobro inicial de evaluación'
      },
      {
        id: 'fv-eval-hibrido',
        name: 'Evaluación FV · Híbrido + batería',
        kind: 'correctiva',
        pricingUnit: 'job',
        quoteMode: 'fv_intake',
        basePrice: 49000,
        description: 'Visita técnica + levantamiento; cobro inicial de evaluación'
      }
    ]
  },
  {
    id: 'piscinas',
    name: 'Piscinas',
    pricingUnit: 'job',
    activities: [
      { id: 'pisc-mantencion', name: 'Mantención / agua verde', kind: 'correctiva', basePrice: 75000 },
      { id: 'pisc-bomba', name: 'Reparación de bomba', kind: 'correctiva', basePrice: 95000 },
      { id: 'pisc-filtro', name: 'Filtro / arena', kind: 'correctiva', basePrice: 85000 },
      { id: 'pisc-proyecto', name: 'Proyecto / remodelación (evaluación)', kind: 'correctiva', basePrice: 90000, quoteMode: 'project_eval' },
      { id: 'pisc-otro', name: 'Otro problema de piscina', kind: 'correctiva', basePrice: 75000 }
    ]
  },
  {
    id: 'limpieza',
    name: 'Limpieza',
    pricingUnit: 'm2',
    activities: [
      {
        id: 'lim-hogar',
        name: 'Limpieza de hogar / departamento',
        kind: 'preventiva',
        pricingUnit: 'm2',
        pricePerM2: 1500,
        minM2: 20,
        basePrice: 1500,
        materialsIncluded: true
      },
      {
        id: 'lim-oficina',
        name: 'Limpieza de oficina / local',
        kind: 'preventiva',
        pricingUnit: 'm2',
        pricePerM2: 1500,
        minM2: 20,
        basePrice: 1500,
        materialsIncluded: true
      },
      {
        id: 'lim-profunda',
        name: 'Limpieza profunda',
        kind: 'correctiva',
        pricingUnit: 'm2',
        pricePerM2: 1500,
        minM2: 20,
        basePrice: 1500,
        materialsIncluded: true
      }
    ]
  },
  {
    id: 'escombros',
    name: 'Retiro de Escombros y Limpieza Profunda',
    activities: [
      { id: 'esc-barro', name: 'Retiro de barro y sedimentos', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(65000), minM2: 1, basePrice: suportluxClientPrice(65000) },
      { id: 'esc-piedras', name: 'Retiro de piedras y rocas pequeñas', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(85000), minM2: 1, basePrice: suportluxClientPrice(85000) },
      { id: 'esc-vegetacion', name: 'Retiro de vegetación, ramas y troncos menores', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(55000), minM2: 1, basePrice: suportluxClientPrice(55000) },
      { id: 'esc-muebles', name: 'Retiro de muebles y enseres dañados', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(45000), minM2: 1, basePrice: suportluxClientPrice(45000) },
      { id: 'esc-limpieza-gruesa', name: 'Limpieza gruesa de pisos y superficies', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: suportluxClientPrice(7500), minM2: 1, basePrice: suportluxClientPrice(7500) },
      { id: 'esc-limpieza-profunda', name: 'Limpieza profunda de pisos y superficies', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: suportluxClientPrice(16500), minM2: 1, basePrice: suportluxClientPrice(16500) },
      { id: 'esc-muros', name: 'Limpieza de muros afectados', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: suportluxClientPrice(22000), minM2: 1, basePrice: suportluxClientPrice(22000) },
      { id: 'esc-desinfeccion', name: 'Desinfección de superficies cuando proceda', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: suportluxClientPrice(12500), minM2: 1, basePrice: suportluxClientPrice(12500) },
      { id: 'esc-revestimientos', name: 'Retiro de revestimientos no recuperables', kind: 'correctiva', pricingUnit: 'm2', pricePerM2: suportluxClientPrice(45000), minM2: 1, basePrice: suportluxClientPrice(45000) },
      { id: 'esc-transp-sedimentos', name: 'Transporte y disposición de sedimentos/escombros no peligrosos', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(35000), minM2: 1, basePrice: suportluxClientPrice(35000) },
      { id: 'esc-transp-voluminosos', name: 'Transporte y disposición de residuos voluminosos o vegetales', kind: 'correctiva', pricingUnit: 'm3', pricePerM2: suportluxClientPrice(45000), minM2: 1, basePrice: suportluxClientPrice(45000) },
      { id: 'esc-jornada-operario', name: 'Jornada adicional de operario', kind: 'correctiva', pricingUnit: 'job', basePrice: suportluxClientPrice(85000) },
      { id: 'esc-supervision', name: 'Supervisión técnica en terreno', kind: 'correctiva', pricingUnit: 'job', basePrice: suportluxClientPrice(95000) },
      { id: 'esc-movilizacion', name: 'Movilización e instalación de faena', kind: 'correctiva', pricingUnit: 'job', basePrice: suportluxClientPrice(85000) }
    ]
  }
];

const GARDEN_MIN_JOB_CLP = 40000;
const GARDEN_OTHER_RATE_M2 = 5500;
const CLEANING_RATE_M2 = 1500;
const CLEANING_MIN_M2 = 20;
const CLEANING_MIN_JOB_CLP = 30000;
const CLEANING_SURCHARGE = 0.15;
const CLEANING_OTHER_RATE_M2 = 1500;
const LANDSCAPE_MIN_M2 = 20;
const LANDSCAPE_MIN_JOB_CLP = 400000;
const LANDSCAPE_BASE_RATE_M2 = 25000;

/** Rangos de mercado Chile: básico / intermedio / alto (CLP por m² de proyecto). */
const LANDSCAPE_STANDARDS = {
  basico: { id: 'basico', label: 'Básico', ratePerM2: 25000 },
  intermedio: { id: 'intermedio', label: 'Intermedio', ratePerM2: 45000 },
  alto: { id: 'alto', label: 'Alto estándar', ratePerM2: 70000 }
};

const LANDSCAPE_TERRAIN = {
  plano: { id: 'plano', label: 'Plano / acceso normal', multiplier: 1 },
  pendiente: { id: 'pendiente', label: 'Con pendiente', multiplier: 1.15 },
  acceso_dificil: { id: 'acceso_dificil', label: 'Acceso difícil', multiplier: 1.25 }
};

const LANDSCAPE_SPECIES = {
  economicas: { id: 'economicas', label: 'Especies económicas', multiplier: 1 },
  mixtas: { id: 'mixtas', label: 'Mezcla intermedia', multiplier: 1.1 },
  premium: { id: 'premium', label: 'Premium / nativas especiales', multiplier: 1.2 }
};

function isPerM2Activity(activity) {
  const u = activity?.pricingUnit;
  return u === 'm2' || u === 'project_m2' || u === 'm3';
}

function isPerM2Service(serviceId) {
  // Jardinería usa intake de paisajismo (evaluación técnica), no cobro por m² online.
  // Escombros mezcla m²/m³/jornada: la unidad se resuelve por actividad.
  return String(serviceId || '') === 'limpieza';
}

function isEscombrosService(serviceId) {
  return String(serviceId || '') === 'escombros';
}

function isGardenService(serviceId) {
  const id = String(serviceId || '');
  return id === 'paisajismo' || id === 'jardineria';
}

function isCleaningService(serviceId) {
  return String(serviceId || '') === 'limpieza';
}

function isLandscapeActivity(activity) {
  if (!activity) return false;
  return activity.quoteMode === 'landscape'
    || activity.id === 'jard-paisajismo'
    || activity.pricingUnit === 'project_m2';
}

function isGardenIntakeActivity(activity) {
  if (!activity) return false;
  return activity.quoteMode === 'garden_intake'
    || ['jard-diseno', 'jard-construccion', 'jard-mantencion'].includes(String(activity.id || ''));
}

function isSmokeTestActivity(activity) {
  if (!activity) return false;
  return activity.quoteMode === 'smoke_test'
    || String(activity.id || '') === 'termo-prueba-1';
}

function resolveM2QuoteBase(activity, squareMeters, { serviceId } = {}) {
  const cleaning = isCleaningService(serviceId) || String(activity?.id || '').startsWith('lim-');
  const escombros = isEscombrosService(serviceId) || String(activity?.id || '').startsWith('esc-');
  if (escombros) {
    const unit = activity?.pricingUnit || 'job';
    if (unit === 'job' || unit === 'servicio' || unit === 'jornada') {
      return Math.max(ESCOMBROS_MIN_JOB_CLP, Math.round(Number(activity?.basePrice) || 0));
    }
    const rate = Number(activity?.pricePerM2 || activity?.pricePerUnit || activity?.basePrice) || 0;
    const minQty = Number(activity?.minM2 || activity?.minQty) || 1;
    const qty = Math.max(minQty, Number(squareMeters) || 0);
    return Math.max(ESCOMBROS_MIN_JOB_CLP, Math.round(rate * qty));
  }
  const defaultRate = cleaning ? CLEANING_RATE_M2 : GARDEN_OTHER_RATE_M2;
  const minJob = cleaning ? CLEANING_MIN_JOB_CLP : GARDEN_MIN_JOB_CLP;
  const minM2 = Number(activity?.minM2) || (cleaning ? CLEANING_MIN_M2 : 10);
  const rate = Number(activity?.pricePerM2 || activity?.basePrice) || defaultRate;
  const m2 = Math.max(minM2, Number(squareMeters) || 0);
  return Math.max(minJob, Math.round(rate * m2));
}

/**
 * Factores de limpieza: mascotas y/o post-evento → +15% c/u sobre el total m².
 */
function normalizeCleaningFactors(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const hasPets = Boolean(input.hasPets || input.pets || input.mascotas);
  const postEvent = Boolean(input.postEvent || input.postParty || input.postFiesta);
  const surchargePct = (hasPets ? CLEANING_SURCHARGE : 0) + (postEvent ? CLEANING_SURCHARGE : 0);
  const labels = [];
  if (hasPets) labels.push('Mascotas en la casa (+15%)');
  if (postEvent) labels.push('Post evento / post fiesta (+15%)');
  return {
    ok: true,
    hasPets,
    postEvent,
    surchargePct,
    multiplier: 1 + surchargePct,
    labels,
    materialsIncluded: true
  };
}

function applyCleaningSurcharge(baseAmount, factors) {
  const base = Math.max(0, Math.round(Number(baseAmount) || 0));
  const mult = Number(factors?.multiplier);
  if (!Number.isFinite(mult) || mult <= 1) return base;
  return Math.round(base * mult);
}

function formatCleaningSummary(factors, squareMeters) {
  if (!factors) return '';
  const parts = [];
  if (Number(squareMeters) > 0) parts.push(`${Math.round(squareMeters)} m²`);
  parts.push('materiales incluidos');
  if (factors.labels?.length) parts.push(factors.labels.join(' · '));
  return `Limpieza: ${parts.join(' · ')}.`;
}

function landscapeRateMap(activity) {
  const basico = Number(activity?.pricePerM2 || activity?.basePrice) || LANDSCAPE_BASE_RATE_M2;
  const scale = basico / LANDSCAPE_BASE_RATE_M2;
  return {
    basico,
    intermedio: Math.round(LANDSCAPE_STANDARDS.intermedio.ratePerM2 * scale),
    alto: Math.round(LANDSCAPE_STANDARDS.alto.ratePerM2 * scale)
  };
}

/**
 * Normaliza factores del cliente para cuantificar un proyecto de paisajismo.
 * @returns {{ ok: true, ... } | { ok: false, error: string }}
 */
function normalizeLandscapeFactors(raw, squareMeters, activity = null) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const m2 = Math.max(
    LANDSCAPE_MIN_M2,
    Number(squareMeters) || Number(input.squareMeters) || 0
  );
  if (!Number.isFinite(m2) || m2 < LANDSCAPE_MIN_M2) {
    return { ok: false, error: `Indica los m² del proyecto (mínimo ${LANDSCAPE_MIN_M2} m²).` };
  }

  const standardKey = String(input.standard || '').trim();
  const terrainKey = String(input.terrain || '').trim();
  const speciesKey = String(input.species || '').trim();
  const standardMeta = LANDSCAPE_STANDARDS[standardKey];
  const terrainMeta = LANDSCAPE_TERRAIN[terrainKey];
  const speciesMeta = LANDSCAPE_SPECIES[speciesKey];

  if (!standardMeta) {
    return { ok: false, error: 'Elige el estándar del proyecto (básico, intermedio o alto).' };
  }
  if (!terrainMeta) {
    return { ok: false, error: 'Indica el tipo de terreno o acceso.' };
  }
  if (!speciesMeta) {
    return { ok: false, error: 'Indica el nivel de especies vegetales.' };
  }

  const rates = landscapeRateMap(activity);
  const ratePerM2 = rates[standardKey] || standardMeta.ratePerM2;
  const includes = {
    design: Boolean(input.includesDesign ?? input.design),
    irrigation: Boolean(input.includesIrrigation ?? input.irrigation),
    earthwork: Boolean(input.includesEarthwork ?? input.earthwork),
    lighting: Boolean(input.includesLighting ?? input.lighting)
  };

  return {
    ok: true,
    squareMeters: Math.round(m2),
    standard: standardMeta.id,
    standardLabel: standardMeta.label,
    ratePerM2,
    terrain: terrainMeta.id,
    terrainLabel: terrainMeta.label,
    terrainMultiplier: terrainMeta.multiplier,
    species: speciesMeta.id,
    speciesLabel: speciesMeta.label,
    speciesMultiplier: speciesMeta.multiplier,
    includes
  };
}

function resolveLandscapeQuoteBase(factors) {
  if (!factors || !Number(factors.ratePerM2) || !Number(factors.squareMeters)) {
    return LANDSCAPE_MIN_JOB_CLP;
  }
  let total = Number(factors.ratePerM2) * Number(factors.squareMeters);
  total *= Number(factors.terrainMultiplier) || 1;
  total *= Number(factors.speciesMultiplier) || 1;
  const includes = factors.includes || {};
  if (includes.irrigation) total *= 1.15;
  if (includes.earthwork) total *= 1.12;
  if (includes.lighting) total *= 1.08;
  if (includes.design) {
    total += Math.max(150000, Math.round(total * 0.05));
  }
  return Math.max(LANDSCAPE_MIN_JOB_CLP, Math.round(total));
}

function formatLandscapeSummary(factors) {
  if (!factors || !factors.ratePerM2) return '';
  const parts = [
    `${factors.squareMeters} m²`,
    factors.standardLabel,
    factors.terrainLabel,
    factors.speciesLabel
  ].filter(Boolean);
  const inc = [];
  if (factors.includes?.design) inc.push('diseño');
  if (factors.includes?.irrigation) inc.push('riego');
  if (factors.includes?.earthwork) inc.push('movimiento de tierra');
  if (factors.includes?.lighting) inc.push('iluminación');
  let line = `Proyecto paisajismo: ${parts.join(' · ')}`;
  if (inc.length) line += `. Incluye: ${inc.join(', ')}.`;
  line += ' Materiales/plantas se cotizan aparte.';
  return line;
}

module.exports = {
  SERVICE_CATALOG,
  SERVICE_TO_SPECIALTY,
  SUPORTLUX_MARKUP_CLP,
  SUPORTLUX_IVA,
  suportluxClientPrice,
  ESCOMBROS_MIN_JOB_CLP,
  GARDEN_MIN_JOB_CLP,
  GARDEN_OTHER_RATE_M2,
  CLEANING_RATE_M2,
  CLEANING_MIN_M2,
  CLEANING_MIN_JOB_CLP,
  CLEANING_SURCHARGE,
  CLEANING_OTHER_RATE_M2,
  LANDSCAPE_MIN_M2,
  LANDSCAPE_MIN_JOB_CLP,
  LANDSCAPE_BASE_RATE_M2,
  LANDSCAPE_STANDARDS,
  LANDSCAPE_TERRAIN,
  LANDSCAPE_SPECIES,
  isPerM2Activity,
  isPerM2Service,
  isGardenService,
  isCleaningService,
  isEscombrosService,
  isLandscapeActivity,
  isGardenIntakeActivity,
  isSmokeTestActivity,
  resolveM2QuoteBase,
  landscapeRateMap,
  normalizeLandscapeFactors,
  resolveLandscapeQuoteBase,
  formatLandscapeSummary,
  normalizeCleaningFactors,
  applyCleaningSurcharge,
  formatCleaningSummary
};

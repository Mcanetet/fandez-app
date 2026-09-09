/**
 * Planificación comercial soft launch — Plan A (híbrido competitivo).
 * Precios al cliente = total a pagar (IVA incluido / precio final).
 */

'use strict';

const PLAN_A_ID = 'plan_a_hibrido';

/** Política de IVA hacia el cliente (recomendación comercial + legal B2C Chile). */
const IVA_POLICY = {
  mode: 'included',
  label: 'IVA incluido',
  recommendation:
    'Al cliente muéstrale siempre el total a pagar con IVA incluido. No separes “neto + IVA” en el checkout B2C: en Chile el consumidor espera el precio final. El desglose neto/IVA queda para boleta/factura (DTE).',
  why: [
    'Mayor conversión: el cliente compara WhatsApp vs app con un solo número.',
    'Cumple la expectativa de precio transparente (SERNAC / práctica retail).',
    'Evita sorpresas al pagar con tarjeta.',
    'Internamente Fandez retiene 12% IVA incluido de la mano de obra más el costo Mercado Pago (valor presente). Eso no se suma al cliente.'
  ],
  avoid: 'No sumar 19% encima del precio de catálogo en pantalla. El precio del catálogo ya es el total cliente.'
};

/**
 * Precios Plan A (CLP, total cliente IVA incluido).
 * Visita acreditable al trabajo cuando se acepta presupuesto.
 */
const PLAN_A = {
  id: PLAN_A_ID,
  name: 'Plan A — Soft launch híbrido competitivo',
  visitPrice: 19990,
  servicePrice: 90000,
  laborCommissionRate: 0.12,
  merchantCardFeePercent: Math.round(0.0319 * 1.19 * 10000) / 100,
  mpOnlineRatePercent: 3.19,
  maxCardInstallments: 3,
  catalogPrices: {
    // Gasfitería
    'gas-cambio-llave': 75000,
    'gas-sanitario': 95000,
    'gas-ducha': 90000,
    'gas-tina': 105000,
    'gas-lavamanos': 85000,
    'gas-destape': 95000,
    'gas-filtracion': 95000,
    'gas-sifones': 75000,
    'gas-matriz': 85000,
    'gas-estanque': 80000,
    'gas-llave-paso': 70000,
    'gas-calefont-fuga': 95000,
    // Electricidad
    'elec-enchufe': 55000,
    'elec-interruptor': 55000,
    'elec-punto-luz': 75000,
    'elec-cortocircuito': 100000,
    'elec-automaticos': 95000,
    'elec-balanceo': 80000,
    'elec-aislamiento': 70000,
    'elec-tablero': 90000,
    'elec-timbre': 55000,
    'elec-ventilador': 90000,
    // Aire
    'ac-mantencion': 85000,
    'ac-serpentines': 95000,
    'ac-refrigerante': 120000,
    'ac-placa': 110000,
    'ac-instalacion': 160000,
    'ac-drenaje': 85000,
    'ac-ruido': 80000,
    // Termos
    'termo-sarro': 85000,
    'termo-valvula': 65000,
    'termo-resistencia': 100000,
    'termo-120l': 130000,
    'termo-fuga': 90000,
    'termo-no-cala': 80000,
    // Cerrajería
    'cerr-apertura': 55000,
    'cerr-cambio-chapa': 80000,
    'cerr-cilindro': 75000,
    'cerr-copia-llaves': 55000,
    'cerr-blindaje': 150000,
    // Lavadoras
    'lav-no-centrifuga': 90000,
    'lav-fuga': 85000,
    'lav-bomba': 95000,
    'lav-tarjeta': 105000,
    'lav-mantencion': 75000,
    // Lavavajillas
    'lv-no-drena': 90000,
    'lv-fuga': 85000,
    'lv-bomba': 95000,
    'lv-programas': 105000,
    'lv-mantencion': 75000,
    // Pintura (competitiva)
    'pint-habitacion': 150000,
    'pint-living': 190000,
    'pint-techo': 160000,
    'pint-retouche': 100000,
    'pint-muros-humedad': 160000,
    'pint-puertas': 130000,
    'pint-preparacion': 110000,
    'pint-fachada-parcial': 210000
  },
  highlights: [
    { sku: 'Visita diagnóstico', price: 19990, note: 'Acreditable 100% si el cliente acepta el trabajo' },
    { sku: 'Destape', price: 95000, note: 'Antes $160 mil · mercado ~$20–80 mil' },
    { sku: 'Cambio enchufe', price: 55000, note: 'Antes $100 mil · mercado ~$12–35 mil' },
    { sku: 'Apertura puerta', price: 55000, note: 'Antes $100 mil · mercado ~$20–50 mil' },
    { sku: 'Mantención AC', price: 85000, note: 'Antes $110 mil · mercado ~$35–80 mil' }
  ]
};

/** Agenda semanal soft launch + playbooks sin ventas. */
const AGENDA_WEEKS = [
  {
    id: 'w0',
    weekLabel: 'Semana 0 — Preparación',
    goal: 'Salir a productivo con precios Plan A y socios curados',
    steps: [
      { id: 'w0-1', title: 'Aplicar Plan A en precios', owner: 'Admin', doneHint: 'Botón “Aplicar Plan A” en esta página' },
      { id: 'w0-2', title: 'APP_MODE=production + MP webhook en Hostinger', owner: 'Ops' },
      { id: 'w0-3', title: 'Activar 8–12 socios con cobertura en 4–6 comunas', owner: 'Comercial' },
      { id: 'w0-4', title: 'Smoke: pago real → muro → ETA GPS', owner: 'Ops' },
      { id: 'w0-5', title: 'Cupón BIENVENIDO (−$5.000 1er servicio) activo', owner: 'Marketing' }
    ],
    ifNoSales: [
      'No es “sin ventas” aún: valida checkout y un pedido piloto interno antes de abrir demanda.'
    ],
    clientIncentives: [
      'Mensaje seed WhatsApp: visita $19.990 acreditable + seguimiento en mapa.',
      'No ads masivos hasta fill rate >50%.'
    ],
    partnerIncentives: [
      'Onboarding 1:1: checklist cobertura + “yo hago el servicio”.',
      'Promesa: liquidación viernes + take-home ~75% labor.'
    ]
  },
  {
    id: 'w1',
    weekLabel: 'Semana 1 — Soft launch',
    goal: 'Primeros pedidos reales · fill rate >70% en <20 min',
    steps: [
      { id: 'w1-1', title: 'Abrir demanda solo en comunas con ≥2 técnicos online', owner: 'Ops' },
      { id: 'w1-2', title: 'Anclar 3 SKUs: destape, eléctrico, mantención AC', owner: 'Marketing' },
      { id: 'w1-3', title: 'Contactar 50 clientes seed (familia/amigos/condo)', owner: 'Comercial' },
      { id: 'w1-4', title: 'Revisar diario: pedidos pagados sin muro (diagnóstico ops)', owner: 'Ops' },
      { id: 'w1-5', title: 'Medir: conversión visita→trabajo, ticket, cancelaciones', owner: 'Comercial' }
    ],
    ifNoSales: [
      'Día 2 sin pedidos: bajar fricción (revisar OTP/SMTP y pago MP), no bajar más precio aún.',
      'Día 4 sin pedidos: ofrecer 10 visitas piloto a $0 retención (solo diagnóstico acreditable) a seed list.',
      'Verificar que socios estén EN LÍNEA en horario pico (10–13 y 17–20).'
    ],
    clientIncentives: [
      'Cupón LANZAMIENTO −$10.000 (máx. 20 usos).',
      'Garantía “si nadie acepta en 20 min, te devolvemos o seguimos buscando”.',
      'Push/email: “técnico verificado + mapa en vivo”.'
    ],
    partnerIncentives: [
      'Bono $20.000 tras 3 trabajos completados en 14 días.',
      'Prioridad en muro a socios con rating y cobertura completa.',
      'Si muro vacío >15 min: WhatsApp broadcast a socios online de esa especialidad.'
    ]
  },
  {
    id: 'w2',
    weekLabel: 'Semana 2 — Ajuste fino',
    goal: 'Estabilizar unit economics y retención',
    steps: [
      { id: 'w2-1', title: 'Ajuste ±10% SKUs según fill rate y quejas de precio', owner: 'Comercial' },
      { id: 'w2-2', title: 'Activar zona ±10% solo si hay cobertura estable', owner: 'Producto' },
      { id: 'w2-3', title: 'Pedir reseñas a clientes completados', owner: 'Soporte' },
      { id: 'w2-4', title: 'Reclutar +5 socios en comunas con demanda sin oferta', owner: 'Comercial' }
    ],
    ifNoSales: [
      'Si hay visitas pagadas pero 0 aceptaciones: problema de oferta → más socios / bajar comisión temporal a 15% 7 días.',
      'Si 0 visitas: problema de demanda → contenido Florencia + referidos $5.000.',
      'Auditar abandono en checkout (MP sandbox, webhook, APP_MODE).'
    ],
    clientIncentives: [
      '2×1 en mantención AC (segundo equipo −50%).',
      'Referidos: $5.000 crédito al referidor y al nuevo.'
    ],
    partnerIncentives: [
      'Comisión 15% temporal 7 días si fill rate <50%.',
      'Destacar “socio estrella de la semana” en muro (prioridad visual).'
    ]
  },
  {
    id: 'w3',
    weekLabel: 'Semana 3 — Escalar con cuidado',
    goal: 'Repetir clientes + primera capa dinámica zona',
    steps: [
      { id: 'w3-1', title: 'Campaña “vuelve en 30 días” a clientes completados', owner: 'Marketing' },
      { id: 'w3-2', title: 'Pack edificio: 3 mantenciones AC con descuento', owner: 'Comercial' },
      { id: 'w3-3', title: 'Evaluar surge cliente (±15% tope) solo con densidad', owner: 'Producto' },
      { id: 'w3-4', title: 'Go/no-go ads pagos (Meta) con presupuesto acotado', owner: 'Marketing' }
    ],
    ifNoSales: [
      'Congelar ads. Volver a Ops: cobertura, precios ancla, onboarding socio.',
      'Hacer 5 entrevistas a clientes que abandonaron el funnel.'
    ],
    clientIncentives: [
      'Crédito $8.000 si agenda mantención preventiva en 14 días.',
      'Programa pasaporte hogar: historial técnico visible.'
    ],
    partnerIncentives: [
      'Pago anticipado parcial en trabajos >$120 mil (opcional).',
      'Capacitación procedimiento Fandez + kit foto diagnóstico.'
    ]
  },
  {
    id: 'w4',
    weekLabel: 'Semana 4 — Consolidación',
    goal: 'Run-rate semanal predecible · NPS >40',
    steps: [
      { id: 'w4-1', title: 'Reporte unit economics (ticket, CAC, take-rate)', owner: 'Finanzas' },
      { id: 'w4-2', title: 'Limpiar SKUs sin demanda; potenciar top 10', owner: 'Comercial' },
      { id: 'w4-3', title: 'Plan mes 2: dinámico zona + incentivo oferta', owner: 'Producto' },
      { id: 'w4-4', title: 'Decisión: abrir 2–3 comunas nuevas o profundizar', owner: 'Dirección' }
    ],
    ifNoSales: [
      'Pivot a Opción D (visita lead barata) o B (premium oriente) según feedback.',
      'No seguir quemando cupones sin oferta: primero liquidez de técnicos.'
    ],
    clientIncentives: [
      'Suscripción “hogar protegido”: 1 visita preventivo/trimestre.'
    ],
    partnerIncentives: [
      'Contrato volumen edificios (calderas/AC) con tarifa preferente.'
    ]
  }
];

function getCommercialPlanSnapshot(currentPricing = {}) {
  const currentVisit = parseInt(currentPricing.visitPrice, 10) || 0;
  const currentCatalog = currentPricing.catalogPrices || {};
  const planCatalog = PLAN_A.catalogPrices;
  const sampleIds = Object.keys(planCatalog).slice(0, 12);
  const diffs = sampleIds.map((id) => ({
    id,
    planPrice: planCatalog[id],
    currentPrice: currentCatalog[id] != null ? currentCatalog[id] : null
  }));

  const planApplied =
    currentVisit === PLAN_A.visitPrice
    && sampleIds.filter((id) => Number(currentCatalog[id]) === Number(planCatalog[id])).length >= 8;

  return {
    planA: PLAN_A,
    ivaPolicy: IVA_POLICY,
    agenda: AGENDA_WEEKS,
    planApplied,
    diffs,
    currentVisit
  };
}

function buildPlanAPricingUpdate(currentPricing = {}) {
  const currentCatalog = currentPricing.catalogPrices && typeof currentPricing.catalogPrices === 'object'
    ? currentPricing.catalogPrices
    : {};
  const { DEFAULT_PRICING } = require('./pricing');
  return {
    visitPrice: PLAN_A.visitPrice,
    servicePrice: PLAN_A.servicePrice,
    laborCommissionRate: PLAN_A.laborCommissionRate,
    merchantCardFeePercent: PLAN_A.merchantCardFeePercent,
    mpOnlineRatePercent: PLAN_A.mpOnlineRatePercent,
    maxCardInstallments: PLAN_A.maxCardInstallments,
    catalogPrices: {
      ...currentCatalog,
      ...PLAN_A.catalogPrices
    },
    urgencyTiers: (DEFAULT_PRICING.urgencyTiers || []).map((tier) => ({ ...tier })),
    commercialPlanId: PLAN_A_ID,
    commercialPlanAppliedAt: new Date().toISOString(),
    clientPriceMode: IVA_POLICY.mode
  };
}

module.exports = {
  PLAN_A_ID,
  PLAN_A,
  IVA_POLICY,
  AGENDA_WEEKS,
  getCommercialPlanSnapshot,
  buildPlanAPricingUpdate
};

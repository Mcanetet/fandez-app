/**
 * Pruebas del motor de tarifas dinámicas.
 * Uso: node scripts/test-dynamic-tariffs.js
 */
'use strict';

const {
  calculateDynamicTariff,
  SERVICE_CATALOG,
  MIN_WORK_BASE_CLP
} = require('../lib/dynamicTariffs');

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, recibió ${actual}`);
  }
  console.log(`✓ ${label} → ${actual}`);
}

function run() {
  console.log('— Casos de negocio —');

  // Caso 1 (Normal/Programado): 160000 * 1.0 * 1.0 = 160000
  const c1 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '14:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(c1.horarioBand, 'normal', 'Caso 1 banda horario');
  assertEqual(c1.urgenciaBand, 'scheduled', 'Caso 1 banda urgencia');
  assertEqual(c1.total, 160000, 'Caso 1 total');

  // Caso 2 (Tarde/Urgencia media): 160000 * 1.25 * 1.10 = 220000
  const c2 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '19:30',
    tiempoRespuestaMinutos: 90
  });
  assertEqual(c2.horarioBand, 'tarde', 'Caso 2 banda horario');
  assertEqual(c2.urgenciaBand, 'medium', 'Caso 2 banda urgencia');
  assertEqual(c2.total, 220000, 'Caso 2 total');

  // Caso 3 (Nocturno/Urgencia crítica): 160000 * 1.50 * 1.25 = 300000
  const c3 = calculateDynamicTariff({
    valorBase: 160000,
    horaSolicitud: '23:30',
    tiempoRespuestaMinutos: 45
  });
  assertEqual(c3.horarioBand, 'nocturno', 'Caso 3 banda horario');
  assertEqual(c3.urgenciaBand, 'critical', 'Caso 3 banda urgencia');
  assertEqual(c3.total, 300000, 'Caso 3 total');

  console.log('\n— Validaciones extra —');

  const forced = calculateDynamicTariff({
    valorBase: 50000,
    horaSolicitud: '10:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(forced.valorBaseAplicado, MIN_WORK_BASE_CLP, `Fuerza mínimo $${MIN_WORK_BASE_CLP}`);
  assertEqual(forced.total, MIN_WORK_BASE_CLP, 'Total mínimo en horario normal programado');

  let threw = false;
  try {
    calculateDynamicTariff({
      valorBase: Math.max(1000, MIN_WORK_BASE_CLP - 1000),
      horaSolicitud: '10:00',
      tiempoRespuestaMinutos: 180,
      strictBase: true
    });
  } catch (_) {
    threw = true;
  }
  assertEqual(threw, true, 'strictBase lanza error bajo mínimo');

  const edgeLate = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '17:00',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(edgeLate.horarioBand, 'normal', '17:00 es horario normal');

  const edgeNight = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '17:01',
    tiempoRespuestaMinutos: 180
  });
  assertEqual(edgeNight.horarioBand, 'tarde', '17:01 es horario tarde');

  // Date en UTC: 04:00 UTC = 00:00 Chile (UTC-4 invierno aproximado vía America/Santiago)
  // Verificamos que no use getHours() del servidor: una hora de madrugada Chile debe ser nocturno.
  const chileMidnightUtc = new Date('2026-07-18T04:00:00.000Z'); // 00:00 America/Santiago (sin DST típico julio)
  const byZone = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: chileMidnightUtc,
    tiempoRespuestaMinutos: 45,
    timeZone: 'America/Santiago'
  });
  assertEqual(byZone.horarioBand, 'nocturno', 'Medianoche Chile vía zona IANA → nocturno/madrugada');
  assertEqual(byZone.horarioMultiplier, 1.5, 'Recargo madrugada 50%');
  assertEqual(byZone.total, 187500, 'Base 100000 × 1.5 × 1.25 urgencia crítica');

  const deviceLocal = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '02:15',
    tiempoRespuestaMinutos: 180,
    timeZone: 'America/Santiago'
  });
  assertEqual(deviceLocal.horarioBand, 'nocturno', 'HH:mm local del dispositivo 02:15 → nocturno');
  assertEqual(deviceLocal.total, 150000, 'Base 100000 × 1.5 madrugada sin urgencia');

  const customNight = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '02:00',
    tiempoRespuestaMinutos: 180,
    scheduleSurcharges: { normalPercent: 0, tardePercent: 25, nocturnoPercent: 40 },
    urgenciaMultiplier: 1.2,
    urgenciaBand: 'immediate'
  });
  assertEqual(customNight.horarioPercent, 40, 'Nocturno configurable desde admin 40%');
  assertEqual(customNight.total, 168000, '100000 × 1.4 × 1.2');

  // Visitas diferidas: no heredan recargo de la hora actual
  const deferredEvening = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '19:57',
    tiempoRespuestaMinutos: 180,
    urgenciaMultiplier: 1,
    urgenciaBand: 'tomorrow',
    forceHorarioBand: 'normal'
  });
  assertEqual(deferredEvening.horarioBand, 'normal', 'Mañana fuerza horario normal');
  assertEqual(deferredEvening.total, 100000, 'Mañana = precio base sin recargo tarde');

  const deferredDiscount = calculateDynamicTariff({
    valorBase: 100000,
    horaSolicitud: '19:57',
    tiempoRespuestaMinutos: 180,
    urgenciaMultiplier: 0.9,
    urgenciaBand: 'two_days',
    forceHorarioBand: 'normal'
  });
  assertEqual(deferredDiscount.total, 90000, 'En 2 días = −10% sobre base');

  const { calculateVisitPricing } = require('../lib/pricing');
  const tomorrowPreview = calculateVisitPricing({}, 'tomorrow', {
    horaSolicitud: '19:57',
    valorBase: 100000,
    timeZone: 'America/Santiago'
  });
  assertEqual(tomorrowPreview.visitTotal, 90000, 'calculateVisitPricing mañana con −10%');
  assertEqual(tomorrowPreview.adjustmentAmount, -10000, 'calculateVisitPricing mañana descuento');

  const todayPreview = calculateVisitPricing({}, 'today', {
    horaSolicitud: '19:57',
    valorBase: 100000,
    timeZone: 'America/Santiago'
  });
  assertEqual(todayPreview.visitTotal, 100000, 'Hoy sin recargo ni horario');
  assertEqual(todayPreview.adjustmentAmount, 0, 'Hoy sin ajuste');

  const twoDaysPreview = calculateVisitPricing({}, 'two_days', {
    horaSolicitud: '19:57',
    valorBase: 100000,
    timeZone: 'America/Santiago'
  });
  assertEqual(twoDaysPreview.visitTotal, 90000, 'calculateVisitPricing 2 días con −10%');
  assertEqual(twoDaysPreview.adjustmentAmount, -10000, 'calculateVisitPricing 2 días descuento');

  const nightImmediate = calculateVisitPricing({}, 'immediate', {
    horaSolicitud: '02:00',
    valorBase: 70000,
    timeZone: 'America/Santiago'
  });
  assertEqual(nightImmediate.scheduleBand, 'nocturno', 'Inmediato en madrugada marca banda nocturno');
  assertEqual(nightImmediate.schedulePercent, 50, 'Madrugada +50%');
  assertEqual(nightImmediate.scheduleAdjustmentAmount, 35000, 'Recargo madrugada separado $35.000');
  assertEqual(nightImmediate.urgencyOnlyPercent, 25, 'Urgencia inmediato +25%');
  assertEqual(nightImmediate.urgencyOnlyAdjustmentAmount, 26250, 'Recargo inmediato separado $26.250');
  assertEqual(nightImmediate.adjustmentAmount, 61250, 'Ajuste total = madrugada + inmediato');
  assertEqual(nightImmediate.visitTotal, 131250, 'Total $131.250 = base + desglose');

  const catalogCount = SERVICE_CATALOG.reduce((n, s) => n + s.activities.length, 0);
  if (SERVICE_CATALOG.length < 5) throw new Error('Catálogo debe tener al menos 5 especialidades');
  if (catalogCount < 20) throw new Error(`Catálogo demasiado corto: ${catalogCount}`);
  console.log(`✓ Catálogo: ${SERVICE_CATALOG.length} especialidades, ${catalogCount} subservicios`);

  const {
    resolveM2QuoteBase,
    GARDEN_MIN_JOB_CLP,
    isPerM2Service
  } = require('../lib/serviceCatalogData');
  const { getServiceFromPrice, quoteActivityForRequest } = require('../lib/pricing');

  if (!isPerM2Service('jardineria')) throw new Error('jardineria debe cobrarse por m²');
  assertEqual(getServiceFromPrice({}, 'jardineria'), 3500, 'Desde jardinería = $3.500 / m²');
  assertEqual(resolveM2QuoteBase({ pricePerM2: 3500 }, 40), 140000, '40 m² corte césped');
  assertEqual(resolveM2QuoteBase({ pricePerM2: 3500 }, 10), GARDEN_MIN_JOB_CLP, '10 m² aplica mínimo de salida $40.000');

  const gardenQuote = quoteActivityForRequest({}, 'jard-cesped', {
    horaSolicitud: '14:00',
    tierId: 'today',
    squareMeters: 40
  });
  assertEqual(gardenQuote.visitTotal, 140000, 'Cotización 40 m² corte en horario normal');

  const gardenFloor = calculateDynamicTariff({
    valorBase: 40000,
    horaSolicitud: '14:00',
    tiempoRespuestaMinutos: 180,
    skipWorkFloor: true
  });
  assertEqual(gardenFloor.valorBaseAplicado, 40000, 'Jardinería no pisa el mínimo de $55.000');

  console.log('\n— Liquidación 15% IVA incl. + Mercado Pago —');
  const { computeRequestFinancials, calculatePaymentSurcharge } = require('../lib/pricing');

  const finCash = computeRequestFinancials({
    visitPricePaid: 100000,
    additionalPaymentsTotal: 0,
    paymentMethod: 'mercadopago',
    cardInstallments: 1
  }, {});
  assertEqual(finCash.laborCommission, 15000, 'Comisión 15% IVA incluido');
  assertEqual(finCash.cardFee, 3796, 'MP 3,19% + IVA 19% (1 cuota)');
  assertEqual(finCash.appTotal, 18796, 'App + MP sin apilar IVA otra vez');
  assertEqual(finCash.providerTotal, 81204, 'Neto socio 1 cuota');
  assertEqual(finCash.ivaOnFeesIncluded, true, 'IVA ya viene incluido');

  const fin12 = computeRequestFinancials({
    visitPricePaid: 100000,
    additionalPaymentsTotal: 0,
    paymentMethod: 'mercadopago',
    cardInstallments: 12
  }, {});
  assertEqual(fin12.cardFee, 21408, 'MP valor presente 12 cuotas');
  assertEqual(fin12.providerTotal, 63592, 'Neto socio 12 cuotas (el cliente sigue pagando $100.000)');

  const clientCard = calculatePaymentSurcharge({}, 100000, 'card');
  assertEqual(clientCard.amount, 0, 'Cliente: $0 recargo tarjeta');
  assertEqual(clientCard.subtotal, 100000, 'Cliente paga el precio publicado');

  const { normalizePricing } = require('../lib/pricing');
  const { buildPreferencePaymentMethods } = require('../lib/mercadopago');
  assertEqual(normalizePricing({}).maxCardInstallments, 3, 'Tope de cuotas default = 3');
  assertEqual(buildPreferencePaymentMethods(3).installments, 3, 'Preferencia MP máximo 3 cuotas');
  assertEqual(buildPreferencePaymentMethods(12).installments, 12, 'Admin puede subir el tope');
  assertEqual(buildPreferencePaymentMethods(1).installments, 1, 'Se puede dejar solo contado');

  const { isPreOperations } = require('../lib/launchNotice');
  assertEqual(isPreOperations(Date.parse('2026-09-15T12:00:00-03:00')), true, 'Aviso activo en septiembre');
  assertEqual(isPreOperations(Date.parse('2026-10-01T00:00:00-03:00')), false, 'Aviso se apaga el 1 de octubre');

  console.log('\nTodos los tests OK');
}

run();

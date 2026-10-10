'use strict';

/**
 * Batería de flujos críticos Fandez (pedido → precio → diagnóstico → producto → pago).
 * Unitarios + store en memoria (sin MySQL real).
 */

process.env.NODE_ENV = 'test';

jest.mock('../lib/db', () => ({
  query: jest.fn(async () => [{ affectedRows: 1 }]),
  getPool: jest.fn(),
  raw: jest.fn(async () => undefined)
}));

jest.mock('../models/repository', () => ({
  persist: jest.fn((fn) => {
    if (typeof fn === 'function') {
      try { fn(); } catch (_) { /* ignore */ }
    }
    return undefined;
  }),
  saveRequest: jest.fn(async (r) => r),
  saveUser: jest.fn(async (u) => u),
  savePricingConfig: jest.fn(async (p) => p),
  saveSecurityLog: jest.fn(async (l) => l)
}));

jest.mock('../lib/events', () => new Proxy({}, {
  get: () => jest.fn()
}));

const {
  MIN_WORK_BASE_CLP,
  normalizeCatalogPrices,
  getServiceCatalog,
  calculateDynamicTariff
} = require('../lib/dynamicTariffs');
const {
  SERVICE_CATALOG,
  filterActivitiesForClient,
  isClientPackageActivity,
  GARDEN_MIN_JOB_CLP,
  CLEANING_MIN_JOB_CLP
} = require('../lib/serviceCatalogData');
const {
  getServiceFromPrice,
  calculateVisitPricing,
  normalizePricing,
  DEFAULT_PRICING
} = require('../lib/pricing');
const {
  DEFAULT_MATERIALS_CATALOG,
  normalizeMaterialsPreview,
  sumMaterialsPreview,
  getEnabledMaterialsCatalog
} = require('../lib/materials/catalog');
const {
  applyZonePricing,
  normalizeZonePricing,
  communePercent
} = require('../lib/zonePricing');
const {
  isDeferredUrgencyTier,
  validateProposedVisit,
  scheduleFields,
  defaultVisitYmdForTier,
  parseLocalDateTimeToIso,
  TIME_SLOTS
} = require('../lib/visitSchedule');
const store = require('../models/store');

const JOB_ID = 'req-flujo-critico-1';
const CLIENT_ID = 'client-flujo-1';
const TECH_ID = 'tech-flujo-1';

function wipeJob() {
  const list = store.requests;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.id === JOB_ID) list.splice(i, 1);
  }
}

function seedJob(overrides = {}) {
  wipeJob();
  const request = {
    id: JOB_ID,
    clientId: CLIENT_ID,
    technicianId: TECH_ID,
    providerId: 'prov-flujo-1',
    serviceId: 'gasfiter',
    serviceName: 'Gasfitería',
    activityId: 'gas-pkg-griferia',
    activityName: 'Grifería y llaves',
    paymentStatus: 'approved',
    status: 'in_progress',
    techStatus: 'diagnostico',
    visitTotal: 105000,
    visitPricePaid: 105000,
    chatMessages: [],
    siteReport: {
      arrivedAt: new Date().toISOString(),
      diagnosis: 'Sanitario con fuga irreparable',
      photoStart: 'data:image/jpeg;base64,xx',
      materials: [],
      action: null
    },
    ...overrides
  };
  store.requests.push(request);
  return request;
}

afterEach(async () => {
  wipeJob();
  // Drena afterEvent(setImmediate) del store para no romper el teardown de Jest.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
});

describe('Flujo A · Piso comercial $80.000 IVA incluido', () => {
  test('MIN_WORK_BASE y mínimos de jardín/limpieza son $80.000', () => {
    expect(MIN_WORK_BASE_CLP).toBe(80000);
    expect(GARDEN_MIN_JOB_CLP).toBe(80000);
    expect(CLEANING_MIN_JOB_CLP).toBe(80000);
  });

  test('overrides admin a $70.000 / $75.000 suben al piso', () => {
    const normalized = normalizeCatalogPrices({
      'elec-enchufe': 70000,
      'gas-cambio-llave': 75000,
      'jard-pkg-cesped': 70000
    });
    expect(normalized['elec-enchufe']).toBe(80000);
    expect(normalized['gas-cambio-llave']).toBe(80000);
    expect(normalized['jard-pkg-cesped']).toBe(80000);
  });

  test('catálogo efectivo no deja job bajo el piso (salvo m² / smoke)', () => {
    const cat = getServiceCatalog({ 'elec-enchufe': 70000 });
    const elec = cat.find((s) => s.id === 'electricidad');
    const enchufe = elec.activities.find((a) => a.id === 'elec-enchufe');
    expect(enchufe.basePrice).toBeGreaterThanOrEqual(80000);
  });

  test('tarifa dinámica fuerza mínimo $80.000', () => {
    const forced = calculateDynamicTariff({
      valorBase: 50000,
      horaSolicitud: '10:00',
      tiempoRespuestaMinutos: 180,
      forceHorarioBand: 'normal'
    });
    expect(forced.valorBaseAplicado).toBe(80000);
    expect(forced.total).toBe(80000);
  });
});

describe('Flujo B · Paquetes cliente (gasfitería / jardinería)', () => {
  test('gasfitería muestra paquetes, no la lista fina ops', () => {
    const specialty = SERVICE_CATALOG.find((s) => s.id === 'gasfiteria');
    const client = filterActivitiesForClient(specialty.activities);
    expect(client.every(isClientPackageActivity)).toBe(true);
    expect(client.some((a) => a.id === 'gas-pkg-griferia')).toBe(true);
    expect(client.some((a) => a.id === 'gas-cambio-llave')).toBe(false);
    const griferia = client.find((a) => a.id === 'gas-pkg-griferia');
    expect(griferia.basePrice).toBe(105000);
    expect(String(griferia.description)).toMatch(/10\.000|mano de obra/i);
  });

  test('jardinería tiene precios diferenciados en paquetes', () => {
    const specialty = SERVICE_CATALOG.find((s) => s.id === 'jardineria-urgencia');
    const client = filterActivitiesForClient(specialty.activities);
    const byId = Object.fromEntries(client.map((a) => [a.id, a.basePrice]));
    expect(byId['jard-pkg-cesped']).toBe(80000);
    expect(byId['jard-pkg-maleza']).toBe(85000);
    expect(byId['jard-pkg-riego']).toBe(95000);
    expect(byId['jard-pkg-poda']).toBe(110000);
    expect(new Set(Object.values(byId)).size).toBeGreaterThan(1);
  });

  test('precio “desde” de oficios respeta piso y paquetes', () => {
    const pricing = normalizePricing(DEFAULT_PRICING);
    expect(getServiceFromPrice(pricing, 'jardineria')).toBeGreaterThanOrEqual(80000);
    expect(getServiceFromPrice(pricing, 'gasfiter')).toBeGreaterThanOrEqual(80000);
    expect(getServiceFromPrice(pricing, 'electrico')).toBeGreaterThanOrEqual(80000);
  });

  test('mañana aplica −10% sobre base de trabajo', () => {
    const preview = calculateVisitPricing({}, 'tomorrow', {
      valorBase: 100000,
      horaSolicitud: '10:00',
      timeZone: 'America/Santiago'
    });
    expect(preview.visitTotal).toBe(90000);
    expect(preview.adjustmentAmount).toBe(-10000);
  });
});

describe('Flujo C · Materiales ≥ $10.000 (catálogo + store)', () => {
  test('catálogo gasfiter incluye sanitario cobrable y teflón incluido', () => {
    const gas = getEnabledMaterialsCatalog(DEFAULT_MATERIALS_CATALOG, { serviceId: 'gasfiter' });
    expect(gas.length).toBeGreaterThan(40);
    const wc = gas.find((m) => m.id === 'mat-inodoro-basico');
    const teflon = gas.find((m) => m.id === 'mat-teflon');
    expect(wc.marketPrice).toBeGreaterThanOrEqual(10000);
    expect(teflon.marketPrice).toBeLessThan(10000);
  });

  test('propuesta WC → pending → approve → payment_pending → pago → comprando', () => {
    seedJob({ techStatus: 'diagnostico' });

    const proposed = store.submitMaterialsPurchase(JOB_ID, TECH_ID, {
      catalogItems: [{ catalogId: 'mat-inodoro-basico', qty: 1 }],
      description: 'Cambio de WC por fuga'
    });
    expect(proposed.error).toBeUndefined();
    expect(proposed.included).toBe(false);
    expect(proposed.materialsPurchase.status).toBe('pending');
    expect(proposed.request.techStatus).toBe('materiales_pendiente');
    expect(proposed.materialsPurchase.estimatedAmount).toBeGreaterThanOrEqual(10000);

    const approved = store.respondMaterialsPurchase(JOB_ID, CLIENT_ID, 'approved');
    expect(approved.error).toBeUndefined();
    expect(approved.materialsPurchase.status).toBe('payment_pending');
    expect(approved.additionalCharge).toBeTruthy();
    expect(approved.additionalCharge.status).toBe('pending');
    expect(approved.additionalCharge.reason).toBe('materials_approx');
    expect(approved.request.techStatus).toBe('materiales_pendiente');

    // Simula que el técnico intenta cerrar sin que el cliente haya pagado
    const req = store.requests.find((r) => r.id === JOB_ID);
    req.techStatus = 'comprando';
    const blockedClose = store.completeSiteWork(JOB_ID, TECH_ID, {
      workNotes: 'Intenté cerrar sin pago',
      photoEnd: 'data:image/jpeg;base64,yy'
    });
    expect(blockedClose.error).toMatch(/pago|producto|cliente|aprox/i);

    const paid = store.markAdditionalPaymentApproved(JOB_ID, 'pay-test-mat-1');
    expect(paid.additionalCharge.status).toBe('approved');
    expect(paid.techStatus).toBe('comprando');
    expect(paid.siteReport.materialsPurchase.status).toBe('approved');
  });

  test('insumo < $10.000 queda incluido y pasa a comprando sin cobro', () => {
    seedJob({ techStatus: 'diagnostico' });
    const result = store.submitMaterialsPurchase(JOB_ID, TECH_ID, {
      catalogItems: [{ catalogId: 'mat-teflon', qty: 1 }],
      description: 'Cinta teflón'
    });
    expect(result.error).toBeUndefined();
    expect(result.included).toBe(true);
    expect(result.materialsPurchase.status).toBe('included');
    expect(result.request.techStatus).toBe('comprando');
    expect(result.request.additionalCharge).toBeFalsy();
  });

  test('técnico no puede “reparar” con producto pendiente de OK', () => {
    seedJob({
      techStatus: 'diagnostico',
      siteReport: {
        arrivedAt: new Date().toISOString(),
        diagnosis: 'ok',
        materials: [],
        materialsPurchase: {
          status: 'pending',
          estimatedAmount: 89000,
          description: 'WC',
          billable: true
        }
      }
    });
    const result = store.setSiteAction(JOB_ID, TECH_ID, 'reparar');
    expect(result.error).toMatch(/aprobación|producto|cliente/i);
  });

  test('técnico no puede “reparar” con cobro aproximado pendiente', () => {
    seedJob({
      techStatus: 'diagnostico',
      additionalCharge: {
        id: 'ajuste-x',
        status: 'pending',
        reason: 'materials_approx',
        amountDue: 89000
      },
      siteReport: {
        arrivedAt: new Date().toISOString(),
        diagnosis: 'ok',
        materials: [],
        materialsPurchase: {
          status: 'payment_pending',
          estimatedAmount: 89000,
          description: 'WC',
          billable: true
        }
      }
    });
    const result = store.setSiteAction(JOB_ID, TECH_ID, 'reparar');
    expect(result.error).toMatch(/pagar|pago|aprox/i);
  });

  test('cliente pide más detalle → clarification y técnico puede reenviar', () => {
    seedJob({ techStatus: 'diagnostico' });
    store.submitMaterialsPurchase(JOB_ID, TECH_ID, {
      catalogItems: [{ catalogId: 'mat-griferia-basica', qty: 1 }],
      description: 'Grifería estándar'
    });
    const detail = store.respondMaterialsPurchase(JOB_ID, CLIENT_ID, 'need_details');
    expect(detail.needDetails).toBe(true);
    expect(detail.materialsPurchase.status).toBe('clarification_pending');
    expect(detail.request.techStatus).toBe('diagnostico');

    const again = store.submitMaterialsPurchase(JOB_ID, TECH_ID, {
      catalogItems: [{ catalogId: 'mat-griferia-lavamanos-premium', qty: 1 }],
      description: 'Grifería premium cromada'
    });
    expect(again.error).toBeUndefined();
    expect(again.materialsPurchase.status).toBe('pending');
  });
});

describe('Flujo D · Recargo por comuna (Ñuñoa hub)', () => {
  test('Ñuñoa 0%, Providencia 5%, Vitacura 15% sobre base', () => {
    const cfg = normalizeZonePricing({});
    expect(cfg.mode).toBe('commune');
    expect(communePercent(cfg, 'nunoa')).toBe(0);
    expect(communePercent(cfg, 'providencia')).toBe(5);
    expect(communePercent(cfg, 'vitacura')).toBe(15);

    const nunoa = applyZonePricing(100000, { zonePricing: cfg }, {
      communeCode: 'nunoa',
      communeName: 'Ñuñoa'
    });
    expect(nunoa.valorBase).toBe(100000);
    expect(nunoa.zone.adjustmentAmount).toBe(0);

    const prov = applyZonePricing(100000, { zonePricing: cfg }, {
      communeCode: 'providencia',
      communeName: 'Providencia'
    });
    expect(prov.valorBase).toBe(105000);
    expect(prov.zone.communePercent).toBe(5);
  });

  test('migración: config vieja sin tabla → mode commune y oferta off', () => {
    const legacy = normalizeZonePricing({
      enabled: true,
      distance: { mode: 'bands', freeKm: 3 },
      supply: { enabled: true }
    });
    expect(legacy.mode).toBe('commune');
    expect(legacy.supply.enabled).toBe(false);
    expect(legacy.communes.length).toBeGreaterThan(3);
  });
});

describe('Flujo E · Agenda pedidos programados (mañana / pasado)', () => {
  test('tiers diferidos se detectan', () => {
    expect(isDeferredUrgencyTier('tomorrow')).toBe(true);
    expect(isDeferredUrgencyTier('two_days')).toBe(true);
    expect(isDeferredUrgencyTier('scheduled')).toBe(true);
    expect(isDeferredUrgencyTier('immediate')).toBe(false);
    expect(isDeferredUrgencyTier('today')).toBe(false);
  });

  test('propuesta de visita válida para mañana', () => {
    const ymd = defaultVisitYmdForTier('tomorrow');
    const slot = TIME_SLOTS[2];
    const parsed = parseLocalDateTimeToIso(ymd, slot);
    expect(parsed.error).toBeUndefined();
    const validated = validateProposedVisit(
      { urgencyTier: 'tomorrow' },
      { proposedVisitAt: parsed.iso }
    );
    expect(validated.error).toBeUndefined();
    expect(validated.iso).toBeTruthy();
    expect(validated.label).toBeTruthy();
  });

  test('scheduleFields marca needsSchedule si no hay visita confirmada', () => {
    const fields = scheduleFields({
      urgencyTier: 'tomorrow',
      scheduleStatus: null,
      proposedVisitAt: null,
      scheduledVisitAt: null
    });
    expect(fields.needsSchedule).toBe(true);

    const confirmed = scheduleFields({
      urgencyTier: 'tomorrow',
      scheduleStatus: 'confirmed',
      scheduledVisitAt: new Date(Date.now() + 86400000).toISOString()
    });
    expect(confirmed.needsSchedule).toBe(false);
  });

  test('rechaza visita en el pasado', () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    const result = validateProposedVisit(
      { urgencyTier: 'tomorrow' },
      { proposedVisitAt: past }
    );
    expect(result.error).toMatch(/pasado/i);
  });
});

describe('Flujo F · Preview materiales no inventa precios', () => {
  test('solo catálogo conocido; fake fuera', () => {
    const preview = normalizeMaterialsPreview([
      { catalogId: 'mat-inodoro-basico', qty: 1 },
      { catalogId: 'mat-no-existe', qty: 1, unitPrice: 999999 }
    ], DEFAULT_MATERIALS_CATALOG);
    expect(preview).toHaveLength(1);
    expect(sumMaterialsPreview(preview)).toBe(preview[0].lineTotal);
  });
});

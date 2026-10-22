'use strict';

const {
  normalizePricing,
  resolveCancellationTier,
  getCancellationFeeClp,
  DEFAULT_PRICING
} = require('../lib/pricing');

describe('Política de cancelación', () => {
  test('escalones: gratis · camino $10.000 · llegó $15.000 · diagnóstico $30.000', () => {
    const cfg = normalizePricing({});
    expect(cfg.cancellations.beforeAccepted).toBe(0);
    expect(cfg.cancellations.afterTechAccepted).toBe(0);
    expect(cfg.cancellations.enRoute).toBe(10000);
    expect(cfg.cancellations.onSiteVerified).toBe(15000);
    expect(cfg.cancellations.afterDiagnosis).toBe(30000);
  });

  test('el default viejo $15.000 / $20.000 baja a la tabla nueva', () => {
    const cfg = normalizePricing({
      cancellations: {
        beforeAccepted: 0,
        afterTechAccepted: 0,
        enRoute: 15000,
        onSiteVerified: 20000,
        afterDiagnosis: 30000
      }
    });
    expect(cfg.cancellations.enRoute).toBe(10000);
    expect(cfg.cancellations.onSiteVerified).toBe(15000);
  });

  test('no pisa un monto custom distinto a la tabla vieja', () => {
    const cfg = normalizePricing({
      cancellations: { enRoute: 12000, onSiteVerified: 18000, afterDiagnosis: 30000 }
    });
    expect(cfg.cancellations.enRoute).toBe(12000);
    expect(cfg.cancellations.onSiteVerified).toBe(18000);
  });

  test('tier y cargo según avance', () => {
    const pricing = DEFAULT_PRICING;
    expect(resolveCancellationTier({})).toBe('beforeAccepted');
    expect(getCancellationFeeClp(pricing, {})).toBe(0);
    expect(resolveCancellationTier({ techStatus: 'aceptado' })).toBe('afterTechAccepted');
    expect(getCancellationFeeClp(pricing, { techStatus: 'aceptado' })).toBe(0);
    expect(resolveCancellationTier({ techStatus: 'en_camino' })).toBe('enRoute');
    expect(getCancellationFeeClp(pricing, { techStatus: 'en_camino' })).toBe(10000);
    expect(resolveCancellationTier({ techStatus: 'en_sitio' })).toBe('onSiteVerified');
    expect(getCancellationFeeClp(pricing, { techStatus: 'en_sitio' })).toBe(15000);
    expect(resolveCancellationTier({ techStatus: 'diagnostico' })).toBe('onSiteVerified');
    expect(getCancellationFeeClp(pricing, { techStatus: 'diagnostico' })).toBe(15000);
    expect(resolveCancellationTier({ techStatus: 'presupuesto_pendiente' })).toBe('afterDiagnosis');
    expect(getCancellationFeeClp(pricing, { techStatus: 'presupuesto_pendiente' })).toBe(30000);
  });
});

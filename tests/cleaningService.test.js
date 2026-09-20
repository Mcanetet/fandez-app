'use strict';

const {
  isPerM2Service,
  isCleaningService,
  resolveM2QuoteBase,
  normalizeCleaningFactors,
  applyCleaningSurcharge,
  CLEANING_RATE_M2
} = require('../lib/serviceCatalogData');

describe('servicio limpieza', () => {
  test('es servicio por m²', () => {
    expect(isPerM2Service('limpieza')).toBe(true);
    expect(isCleaningService('limpieza')).toBe(true);
  });

  test('cotiza $1.500 / m² con mínimo de trabajo', () => {
    const activity = { id: 'lim-hogar', pricingUnit: 'm2', pricePerM2: 1500, minM2: 20, basePrice: 1500 };
    expect(resolveM2QuoteBase(activity, 20, { serviceId: 'limpieza' })).toBe(30000);
    expect(resolveM2QuoteBase(activity, 40, { serviceId: 'limpieza' })).toBe(60000);
    expect(CLEANING_RATE_M2).toBe(1500);
  });

  test('mascotas y post-evento suman +15% c/u', () => {
    const both = normalizeCleaningFactors({ hasPets: true, postEvent: true });
    expect(both.surchargePct).toBeCloseTo(0.3);
    expect(applyCleaningSurcharge(60000, both)).toBe(78000);

    const pets = normalizeCleaningFactors({ hasPets: true });
    expect(applyCleaningSurcharge(60000, pets)).toBe(69000);

    const post = normalizeCleaningFactors({ postEvent: true });
    expect(applyCleaningSurcharge(60000, post)).toBe(69000);
  });
});

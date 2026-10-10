'use strict';

/**
 * Flujo producto ≥ $10.000 en diagnóstico:
 * catálogo (ej. sanitario) → cobrable → cliente aprueba y paga antes de continuar.
 */
const {
  DEFAULT_MATERIALS_CATALOG,
  normalizeMaterialsPreview,
  sumMaterialsPreview,
  findMaterialInCatalog
} = require('../lib/materials/catalog');

const THRESHOLD = 10000;

describe('productos diagnóstico ≥ $10.000', () => {
  test('sanitario / WC básico supera el umbral y sale del catálogo', () => {
    const wc = findMaterialInCatalog(DEFAULT_MATERIALS_CATALOG, 'mat-inodoro-basico');
    expect(wc).toBeTruthy();
    expect(wc.marketPrice).toBeGreaterThanOrEqual(THRESHOLD);
    expect(wc.specialtyIds).toContain('gasfiter');
  });

  test('propuesta de catálogo con WC suma monto cobrable al cliente', () => {
    const preview = normalizeMaterialsPreview(
      [{ catalogId: 'mat-inodoro-basico', qty: 1 }],
      DEFAULT_MATERIALS_CATALOG
    );
    expect(preview).toHaveLength(1);
    expect(preview[0].name).toMatch(/WC|Inodoro/i);
    const total = sumMaterialsPreview(preview);
    expect(total).toBeGreaterThanOrEqual(THRESHOLD);
    expect(total).toBe(preview[0].unitPrice);
  });

  test('insumo menor a $10.000 (teflón) queda bajo umbral — incluido en servicio', () => {
    const preview = normalizeMaterialsPreview(
      [{ catalogId: 'mat-teflon', qty: 1 }],
      DEFAULT_MATERIALS_CATALOG
    );
    expect(sumMaterialsPreview(preview)).toBeLessThan(THRESHOLD);
  });

  test('grifería estándar es cobrable (≥ umbral)', () => {
    const preview = normalizeMaterialsPreview(
      [{ catalogId: 'mat-griferia-basica', qty: 1 }],
      DEFAULT_MATERIALS_CATALOG
    );
    expect(sumMaterialsPreview(preview)).toBeGreaterThanOrEqual(THRESHOLD);
  });

  test('no acepta productos inventados fuera del catálogo', () => {
    const preview = normalizeMaterialsPreview(
      [{ catalogId: 'mat-inventado-xyz', qty: 1, name: 'Fake', unitPrice: 50000 }],
      DEFAULT_MATERIALS_CATALOG
    );
    expect(preview).toHaveLength(0);
    expect(sumMaterialsPreview(preview)).toBe(0);
  });
});

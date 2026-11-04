'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  inspectCaf,
  allocateFolio,
  remainingThreshold,
  cafExpiresOn,
  addMonthsYmd
} = require('../lib/sii-dte/folio/caf');
const { shouldNotify, alertKeys, formatDigest } = require('../lib/sii-dte/jobs/cafAlerts');

function caf({ from = 1, to = 100, fa = '2026-09-01', type = 33 } = {}) {
  return {
    dteType: type,
    folioFrom: from,
    folioTo: to,
    authorizedAt: fa
  };
}

function writeCounter(dir, lastUsed) {
  const file = path.join(dir, 'caf.folio');
  fs.writeFileSync(file, String(lastUsed));
  return file;
}

describe('SII DTE · avisos CAF (Res. Ex. 58/2017)', () => {
  test('vigencia 6 meses desde FA', () => {
    expect(addMonthsYmd('2026-04-21', 6)).toBe('2026-10-21');
    expect(cafExpiresOn(caf({ fa: '2026-04-21' }))).toBe('2026-10-21');
    expect(cafExpiresOn(caf({ fa: '' }))).toBeNull();
  });

  test('umbral de stock: 20% acotado entre 5 y 50', () => {
    expect(remainingThreshold(20)).toBe(5);
    expect(remainingThreshold(100)).toBe(20);
    expect(remainingThreshold(1000)).toBe(50);
  });

  test('stock ok no alerta', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    writeCounter(dir, 10); // siguiente 11, quedan 90 de 100
    const st = inspectCaf(caf(), path.join(dir, 'caf.folio'), new Date('2026-09-15T12:00:00-03:00'));
    expect(st.remaining).toBe(90);
    expect(st.nextFolio).toBe(11);
    expect(st.level).toBe('ok');
    expect(st.alerts).toHaveLength(0);
  });

  test('alerta folios bajos (≤20%)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    writeCounter(dir, 85); // siguiente 86, quedan 15 de 100
    const st = inspectCaf(caf(), path.join(dir, 'caf.folio'), new Date('2026-09-15T12:00:00-03:00'));
    expect(st.remaining).toBe(15);
    expect(st.level).toBe('warning');
    expect(st.alerts.some((a) => a.code === 'low_stock')).toBe(true);
  });

  test('alerta CAF por vencer (≤30 días) y urgente (≤7)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    const file = path.join(dir, 'caf.folio');
    const soon = inspectCaf(caf({ fa: '2026-04-21' }), file, new Date('2026-10-01T12:00:00-03:00'));
    expect(soon.expiresAt).toBe('2026-10-21');
    expect(soon.daysToExpiry).toBe(20);
    expect(soon.alerts.some((a) => a.code === 'expiring')).toBe(true);

    const urgent = inspectCaf(caf({ fa: '2026-04-21' }), file, new Date('2026-10-18T12:00:00-03:00'));
    expect(urgent.daysToExpiry).toBe(3);
    expect(urgent.level).toBe('critical');
    expect(urgent.alerts.some((a) => a.code === 'expiring_urgent')).toBe(true);
  });

  test('CAF vencido no asigna folio', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    const file = writeCounter(dir, 1);
    expect(() => allocateFolio(caf({ fa: '2025-01-01' }), file)).toThrow(/vencido|58/);
    try {
      allocateFolio(caf({ fa: '2025-01-01' }), file);
    } catch (err) {
      expect(err.code).toBe('CAF_EXPIRED');
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('1');
  });

  test('CAF agotado no asigna folio', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    const file = writeCounter(dir, 100);
    expect(() => allocateFolio(caf({ fa: '2026-09-01' }), file)).toThrow(/agotado/i);
    try {
      allocateFolio(caf({ fa: '2026-09-01' }), file);
    } catch (err) {
      expect(err.code).toBe('CAF_EXHAUSTED');
    }
  });

  test('allocate avanza el contador si el CAF está vigente', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    const file = writeCounter(dir, 4);
    const folio = allocateFolio(caf({ fa: '2026-09-01' }), file);
    expect(folio).toBe(5);
    expect(fs.readFileSync(file, 'utf8')).toBe('5');
  });

  test('debounce 24 h y claves por tipo+rango+código', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-'));
    writeCounter(dir, 8);
    const low = inspectCaf(
      caf({ from: 1, to: 10, fa: '2026-09-01' }),
      path.join(dir, 'caf.folio'),
      new Date('2026-09-15')
    );
    const keys = alertKeys(low).map((k) => k.key);
    expect(keys[0]).toMatch(/^33:1-10:low_stock$/);

    const now = Date.parse('2026-10-21T12:00:00Z');
    expect(shouldNotify({}, '33:1-10:low_stock', now)).toBe(true);
    expect(shouldNotify({ '33:1-10:low_stock': '2026-10-21T10:00:00Z' }, '33:1-10:low_stock', now)).toBe(false);
    expect(shouldNotify({ '33:1-10:low_stock': '2026-10-20T11:00:00Z' }, '33:1-10:low_stock', now)).toBe(true);
    expect(formatDigest([low])).toMatch(/quedan/);
  });
});

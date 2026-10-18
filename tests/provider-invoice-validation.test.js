'use strict';

process.env.NODE_ENV = 'test';

const {
  parseInvoiceAmountClp,
  validatePartnerInvoiceAmount
} = require('../lib/providerInvoiceValidation');

describe('Validación monto factura socio', () => {
  test('parsea montos con puntos o solo dígitos', () => {
    expect(parseInvoiceAmountClp(150000)).toBe(150000);
    expect(parseInvoiceAmountClp('150000')).toBe(150000);
    expect(parseInvoiceAmountClp('150.000')).toBe(150000);
    expect(parseInvoiceAmountClp(' $ 150.000 ')).toBe(150000);
    expect(parseInvoiceAmountClp('')).toBeNull();
    expect(parseInvoiceAmountClp(null)).toBeNull();
  });

  test('acepta match exacto con el total del servicio', () => {
    const r = validatePartnerInvoiceAmount(185000, 185000);
    expect(r.ok).toBe(true);
    expect(r.declared).toBe(185000);
    expect(r.expected).toBe(185000);
  });

  test('rechaza si el monto no coincide', () => {
    const r = validatePartnerInvoiceAmount(180000, 185000);
    expect(r.ok).toBe(false);
    expect(r.code || r.error).toBeTruthy();
    expect(r.declared).toBe(180000);
    expect(r.expected).toBe(185000);
    expect(r.error).toMatch(/no coincide/i);
  });

  test('rechaza monto vacío o cero', () => {
    expect(validatePartnerInvoiceAmount('', 185000).ok).toBe(false);
    expect(validatePartnerInvoiceAmount(0, 185000).ok).toBe(false);
    expect(validatePartnerInvoiceAmount(-1, 185000).ok).toBe(false);
  });

  test('formato con separadores de miles también valida', () => {
    expect(validatePartnerInvoiceAmount('185.000', 185000).ok).toBe(true);
  });
});

describe('Plantilla mismatch factura socio', () => {
  test('existe template provider.invoice_amount_mismatch', () => {
    const { TEMPLATES } = require('../lib/notifications');
    expect(typeof TEMPLATES['provider.invoice_amount_mismatch']).toBe('function');
    const tpl = TEMPLATES['provider.invoice_amount_mismatch']({
      provider: { name: 'Socio Demo' },
      request: { id: 'req-1', serviceName: 'Gasfitería' },
      declaredAmount: 180000,
      expectedAmount: 185000,
      difference: -5000
    });
    expect(tpl.subject).toMatch(/no cuadra/i);
    expect(tpl.text).toMatch(/185/);
    expect(tpl.text).toMatch(/diferencia/i);
  });
});

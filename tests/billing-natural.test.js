'use strict';

const { validateBilling } = require('../lib/billing');

describe('Facturación persona natural', () => {
  test('puede pagar con nombre y email, sin RUT', () => {
    const result = validateBilling({
      type: 'natural',
      legalName: 'Ana Pérez',
      invoiceEmail: 'ana@test.cl'
    });
    expect(result.ok).toBe(true);
  });

  test('empresa sigue pidiendo RUT, giro y dirección', () => {
    const result = validateBilling({
      type: 'empresa',
      legalName: 'Spa Demo',
      invoiceEmail: 'facturas@demo.cl'
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/RUT/i);
  });
});

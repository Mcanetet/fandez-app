'use strict';

process.env.NODE_ENV = 'test';
process.env.DTE_PROVIDER = 'sii_direct';
process.env.SII_ENVIRONMENT = 'sandbox';
process.env.SII_DTE_DRY_RUN = 'true';

const {
  calculateCommissionInvoiceAmounts,
  generateCommissionInvoice,
  buildIdempotencyHash
} = (() => {
  const amounts = require('../lib/sii-dte/amounts');
  const gen = require('../lib/sii-dte/generateCommissionInvoice');
  const idem = require('../lib/sii-dte/idempotency');
  return {
    calculateCommissionInvoiceAmounts: amounts.calculateCommissionInvoiceAmounts,
    generateCommissionInvoice: gen.generateCommissionInvoice,
    buildIdempotencyHash: idem.buildIdempotencyHash
  };
})();

describe('SII DTE · comisión Fandez', () => {
  test('desglosa IVA incluido 19% sobre appTotal', () => {
    const a = calculateCommissionInvoiceAmounts({
      commissionClp: 15000,
      cardFeeClp: 3800,
      appTotal: 18800
    });
    expect(a.total).toBe(18800);
    expect(a.neto + a.iva).toBe(18800);
    expect(a.neto).toBe(Math.round(18800 / 1.19));
    expect(a.lines.length).toBe(2);
  });

  test('idempotency hash estable', () => {
    const h1 = buildIdempotencyHash({
      requestId: 'req-1',
      phase: 'fandez_margin',
      total: 18800,
      receptorRut: '76.123.456-7',
      environment: 'sandbox'
    });
    const h2 = buildIdempotencyHash({
      requestId: 'req-1',
      phase: 'fandez_margin',
      total: 18800,
      receptorRut: '76123456-7',
      environment: 'sandbox'
    });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test('generateCommissionInvoice dry-run crea documento idempotente', async () => {
    const partner = {
      id: 'prov-1',
      name: 'Socio Demo',
      email: 'socio@example.com',
      providerContract: {
        legalEntity: { rut: '76.111.222-3', legalName: 'Socio Demo SpA', giro: 'Gasfitería' }
      }
    };
    const first = await generateCommissionInvoice({
      requestId: 'req-sii-test-1',
      partner,
      commissionClp: 15000,
      cardFeeClp: 3500,
      appTotal: 18500,
      phase: 'fandez_margin'
    });
    expect(first.error).toBeUndefined();
    expect(first.success).toBe(true);
    expect(first.dryRun).toBe(true);
    expect(first.document.dteType).toBe(33);
    expect(first.document.total).toBe(18500);
    expect(first.document.siiStatus).toBe('signed');
    expect(first.document.pdfUrl).toMatch(/\/documentos\/tributarios\/sii\//);

    const second = await generateCommissionInvoice({
      requestId: 'req-sii-test-1',
      partner,
      commissionClp: 15000,
      cardFeeClp: 3500,
      appTotal: 18500,
      phase: 'fandez_margin'
    });
    expect(second.idempotent).toBe(true);
    expect(second.document.id).toBe(first.document.id);
  });
});

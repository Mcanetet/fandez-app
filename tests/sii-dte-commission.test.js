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

describe('SII DTE · factura manual', () => {
  const { generateManualInvoice } = require('../lib/sii-dte/generateManualInvoice');
  const { calculateManualInvoiceAmounts } = require('../lib/sii-dte/amounts');

  test('calculateManualInvoiceAmounts con glosa', () => {
    const a = calculateManualInvoiceAmounts({
      totalClp: 11900,
      description: 'Ajuste comisión'
    });
    expect(a.total).toBe(11900);
    expect(a.neto + a.iva).toBe(11900);
    expect(a.lines[0].name).toBe('Ajuste comisión');
  });

  test('generateManualInvoice dry-run', async () => {
    const result = await generateManualInvoice({
      receptor: {
        rut: '76.999.888-7',
        name: 'Cliente Manual SpA',
        giro: 'Comercio',
        address: 'Providencia 100',
        commune: 'Providencia',
        city: 'Santiago',
        email: 'billing@example.com'
      },
      totalClp: 25000,
      description: 'Servicios varios Fandez',
      issuedBy: 'test@fandez.cl'
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.document.phase).toBe('manual');
    expect(result.document.meta.manual).toBe(true);
    expect(result.document.total).toBe(25000);
    expect(result.document.receptorRut).toMatch(/76\.?999\.?888-7/i);
  });

  test('generateManualInvoice nota de crédito 61 dry-run', async () => {
    const { generateCreditNote } = require('../lib/sii-dte/generateManualInvoice');
    const result = await generateCreditNote({
      receptor: {
        rut: '76.999.888-7',
        name: 'Cliente Manual SpA',
        giro: 'Comercio'
      },
      totalClp: 18500,
      description: 'Anulación comisión',
      refFolio: 100001,
      refDate: '2026-03-01',
      refCode: 1,
      refReason: 'Anula documento de referencia'
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.document.dteType).toBe(61);
    expect(result.document.phase).toBe('credit_note');
    expect(result.document.meta.reference.folio).toBe(100001);
    expect(result.document.meta.reference.code).toBe(1);
  });

  test('nota de crédito sin folio referencia falla', async () => {
    const result = await generateManualInvoice({
      dteType: 61,
      receptor: { rut: '76.999.888-7', name: 'X SpA' },
      totalClp: 1000
    });
    expect(result.error).toMatch(/folio/i);
  });

  test('generatePurchaseInvoice 46 dry-run (chatarra)', async () => {
    const { generatePurchaseInvoice } = require('../lib/sii-dte/generateManualInvoice');
    const result = await generatePurchaseInvoice({
      receptor: {
        rut: '12.345.678-5',
        name: 'Juan Vendedor',
        giro: 'Particular',
        address: 'Calle 1',
        commune: 'Puente Alto',
        city: 'Santiago'
      },
      totalClp: 150000,
      description: 'Compra de chatarra / materiales'
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.document.dteType).toBe(46);
    expect(result.document.phase).toBe('purchase_invoice');
    expect(result.document.meta.kind).toBe('factura_compra');
    expect(result.document.total).toBe(150000);
  });

  test('generateLiquidationInvoice 43 dry-run', async () => {
    const { generateLiquidationInvoice } = require('../lib/sii-dte/generateManualInvoice');
    const { normalizeDteType, dteKindLabel } = require('../lib/sii-dte/dteTypes');
    expect(normalizeDteType(43)).toBe(43);
    expect(dteKindLabel(43)).toBe('liquidacion_factura');

    const result = await generateLiquidationInvoice({
      receptor: {
        rut: '76.111.222-3',
        name: 'Socio Mandante SpA',
        giro: 'Servicios técnicos',
        address: 'Ñuñoa 50',
        commune: 'Ñuñoa',
        city: 'Santiago'
      },
      totalClp: 18800,
      description: 'Liquidación comisión Fandez',
      liquidationBruto: 100000,
      liquidationLiquido: 81200
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.document.dteType).toBe(43);
    expect(result.document.phase).toBe('liquidation');
    expect(result.document.meta.kind).toBe('liquidacion_factura');
    expect(result.document.meta.liquidation.bruto).toBe(100000);
    expect(result.document.meta.liquidation.liquido).toBe(81200);
    expect(result.document.total).toBe(18800);
  });
});

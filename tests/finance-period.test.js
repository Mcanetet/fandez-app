'use strict';

const {
  buildIvaPeriodSummary,
  ivaFromGross,
  normalizePeriod
} = require('../lib/finance/taxPeriod');
const {
  parseBankCsv,
  parseAmountCell,
  parseDateCell
} = require('../lib/finance/reconciliation');

describe('Finance · IVA período y cartola CSV', () => {
  test('normalizePeriod y ivaFromGross', () => {
    expect(normalizePeriod('2026-03')).toBe('2026-03');
    expect(ivaFromGross(11900)).toBe(1900);
  });

  test('buildIvaPeriodSummary débito − crédito = a pagar', () => {
    const summary = buildIvaPeriodSummary({
      period: '2026-03',
      pricing: { ivaRate: 0.19, laborCommissionRate: 0.15, commissionIvaIncluded: true },
      requests: [
        {
          id: 'r1',
          paymentStatus: 'approved',
          status: 'completed',
          completedAt: '2026-03-10T12:00:00.000Z',
          serviceName: 'Gasfitería',
          financials: { ivaOnFees: 1900, feesBeforeIva: 10000, appTotal: 11900 }
        },
        {
          id: 'r2',
          paymentStatus: 'approved',
          status: 'completed',
          completedAt: '2026-02-10T12:00:00.000Z',
          financials: { ivaOnFees: 5000, appTotal: 30000 }
        }
      ],
      purchaseInvoices: [
        {
          id: 'pc1',
          issuedAt: '2026-03-05',
          supplierName: 'Insumos SPA',
          folio: '100',
          taxAmount: 400,
          totalAmount: 2400,
          netAmount: 2000
        }
      ],
      dteDocs: []
    });
    expect(summary.ivaDebito).toBe(1900);
    expect(summary.ivaCredito).toBe(400);
    expect(summary.ivaPagar).toBe(1500);
    expect(summary.completedCount).toBe(1);
    expect(summary.status).toBe('a_pagar');
  });

  test('parseBankCsv cartola chilena con cargo/abono', () => {
    const csv = [
      'Fecha;Descripcion;Cargo;Abono;Saldo',
      '15/03/2026;Transferencia Mercado Pago;;45000;100000',
      '16/03/2026;Comision mantencion;990;;99010'
    ].join('\n');
    const parsed = parseBankCsv(csv);
    expect(parsed.success).toBe(true);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].amount).toBe(45000);
    expect(parsed.rows[0].date).toBe('2026-03-15');
    expect(parsed.rows[1].amount).toBe(-990);
    expect(parsed.rows[1].category).toBe('fee');
  });

  test('parseAmountCell formatos CL', () => {
    expect(parseAmountCell('1.234.567')).toBe(1234567);
    expect(parseAmountCell('1.234,50')).toBe(1235);
    expect(parseDateCell('05/03/2026')).toBe('2026-03-05');
  });
});

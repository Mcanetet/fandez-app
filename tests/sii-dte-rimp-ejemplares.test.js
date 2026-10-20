'use strict';

process.env.NODE_ENV = 'test';

const {
  renderCommissionInvoiceHtml,
  supportsCedible,
  LEYENDA_CEDIBLE
} = require('../lib/sii-dte/pdf/render');

function baseDoc(dteType) {
  return {
    id: 'sii-test-rimp',
    folio: 100001,
    dteType,
    emitterRut: '76.000.000-0',
    receptorRut: '76.111.222-3',
    receptorName: 'Cliente Demo SpA',
    neto: 10000,
    iva: 1900,
    total: 11900,
    signedAt: '2026-03-19T12:00:00.000Z',
    environment: 'sandbox',
    siiStatus: 'signed',
    requestId: 'req-rimp',
    meta: {
      dryRun: true,
      emitterName: 'Fandez SpA',
      emitterGiro: 'Intermediacion',
      emitterAddress: 'Santiago',
      receptorGiro: 'Servicios',
      receptorAddress: 'Providencia',
      receptorCommune: 'Providencia',
      receptorCity: 'Santiago',
      lines: [{ name: 'Servicio', qty: 1, unitNeto: 10000, neto: 10000 }]
    }
  };
}

describe('SII DTE · RIMP ejemplares', () => {
  test('soporta cedible en 33/43, no en 61/46', () => {
    expect(supportsCedible(33)).toBe(true);
    expect(supportsCedible(43)).toBe(true);
    expect(supportsCedible(61)).toBe(false);
    expect(supportsCedible(46)).toBe(false);
  });

  test('factura 33 incluye tributario y cedible con leyenda', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(33));
    expect(html).toContain('EJEMPLAR TRIBUTARIO');
    expect(html).toContain('EJEMPLAR CEDIBLE');
    expect(html).toContain(LEYENDA_CEDIBLE);
    expect(html).toContain('data-exemplar="tributario"');
    expect(html).toContain('data-exemplar="cedible"');
    expect(html).toContain('Acuse de recibo');
    expect((html.match(/class="sheet/g) || []).length).toBe(2);
  });

  test('nota de crédito 61 solo ejemplar tributario', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(61));
    expect(html).toContain('EJEMPLAR TRIBUTARIO');
    expect(html).not.toContain('EJEMPLAR CEDIBLE');
    expect(html).not.toContain('CEDIBLE CON SU FIRMA');
    expect((html.match(/class="sheet/g) || []).length).toBe(1);
  });
});

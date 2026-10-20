'use strict';

process.env.NODE_ENV = 'test';

const {
  renderCommissionInvoiceHtml,
  supportsCedible,
  normalizeExemplar,
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

  test('normalizeExemplar: un archivo = un ejemplar', () => {
    expect(normalizeExemplar(undefined, 33)).toBe('tributario');
    expect(normalizeExemplar('cedible', 33)).toBe('cedible');
    expect(normalizeExemplar('cedible', 61)).toBe('tributario');
  });

  test('tributario: pie EJEMPLAR TRIBUTARIO, sin leyenda cedible', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(33), { exemplar: 'tributario' });
    expect(html).toContain('EJEMPLAR TRIBUTARIO');
    expect(html).toContain('data-exemplar="tributario"');
    expect(html).not.toContain('COPIA CEDIBLE');
    expect(html).not.toContain(LEYENDA_CEDIBLE);
    expect((html.match(/class="sheet/g) || []).length).toBe(1);
  });

  test('cedible: COPIA CEDIBLE abajo con leyenda Ley 19.983', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(33), { exemplar: 'cedible' });
    expect(html).toContain('COPIA CEDIBLE');
    expect(html).toContain(LEYENDA_CEDIBLE);
    expect(html).toContain('Acuse de recibo');
    expect(html).toContain('data-exemplar="cedible"');
    expect(html.indexOf('Timbre Electrónico')).toBeLessThan(html.indexOf('COPIA CEDIBLE'));
    expect((html.match(/class="sheet/g) || []).length).toBe(1);
  });

  test('nota de crédito ignora pedido de cedible', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(61), { exemplar: 'cedible' });
    expect(html).toContain('EJEMPLAR TRIBUTARIO');
    expect(html).not.toContain('COPIA CEDIBLE');
  });
});

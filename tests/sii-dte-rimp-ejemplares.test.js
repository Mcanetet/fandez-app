'use strict';

process.env.NODE_ENV = 'test';

const {
  renderCommissionInvoiceHtml,
  supportsCedible,
  normalizeExemplar,
  LEYENDA_CEDIBLE,
  LEYENDA_DESTINO_CEDIBLE,
  TEXTO_ACUSE,
  docTypeLabel,
  formatResLine
} = require('../lib/sii-dte/pdf/render');

function baseDoc(dteType) {
  return {
    id: 'sii-test-rimp',
    folio: 100001,
    dteType,
    emitterRut: '78.494.038-1',
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
      emitterName: 'Gestión Integral y Servicios Fandez SpA',
      emitterGiro: 'Intermediación de servicios del hogar',
      emitterAddress: 'Santiago',
      emitterCommune: 'Santiago',
      emitterCity: 'Santiago',
      receptorGiro: 'Servicios',
      receptorAddress: 'Providencia 100',
      receptorCommune: 'Providencia',
      receptorCity: 'Santiago',
      lines: [{ name: 'Servicio', qty: 1, unitNeto: 10000, neto: 10000 }]
    }
  };
}

describe('SII DTE · RIMP Chile', () => {
  test('nombres oficiales SII en español', () => {
    expect(docTypeLabel(33)).toBe('FACTURA ELECTRÓNICA');
    expect(docTypeLabel(61)).toBe('NOTA DE CRÉDITO ELECTRÓNICA');
    expect(docTypeLabel(46)).toBe('FACTURA DE COMPRA ELECTRÓNICA');
    expect(docTypeLabel(43)).toBe('LIQUIDACIÓN FACTURA ELECTRÓNICA');
  });

  test('soporta cedible en 33/43/46, no en 61', () => {
    expect(supportsCedible(33)).toBe(true);
    expect(supportsCedible(43)).toBe(true);
    expect(supportsCedible(46)).toBe(true);
    expect(supportsCedible(61)).toBe(false);
  });

  test('Res. N de AAAA bajo el timbre', () => {
    expect(formatResLine('80', '2024-06-01')).toBe('Res. 80 de 2024');
  });

  test('tributario: sin CEDIBLE ni acuse (ejemplar sin destino)', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(33), { exemplar: 'tributario' });
    expect(html).toContain('FACTURA ELECTRÓNICA');
    expect(html).toContain('lang="es-CL"');
    expect(html).toContain('S.I.I. —');
    expect(html).toContain('Comuna:');
    expect(html).toContain('Timbre Electrónico SII');
    expect(html).toContain('Res.');
    expect(html).toContain('Verifique documento: www.sii.cl');
    expect(html).not.toContain(LEYENDA_DESTINO_CEDIBLE);
    expect(html).not.toContain('Acuse de Recibo');
    expect((html.match(/class="sheet/g) || []).length).toBe(1);
  });

  test('cedible: Acuse oficial + CEDIBLE abajo a la derecha', async () => {
    const html = await renderCommissionInvoiceHtml(baseDoc(33), { exemplar: 'cedible' });
    const body = html.split('<body>')[1] || html;
    expect(body).toContain('Acuse de Recibo');
    expect(body).toContain(TEXTO_ACUSE);
    expect(body).toContain(LEYENDA_CEDIBLE);
    expect(body).toContain(`class="destino-cedible">${LEYENDA_DESTINO_CEDIBLE}`);
    expect(body.indexOf('class="cap"')).toBeLessThan(body.indexOf('destino-cedible'));
    expect(body).toContain('data-exemplar="cedible"');
  });

  test('NC no admite cedible', async () => {
    expect(normalizeExemplar('cedible', 61)).toBe('tributario');
    const html = await renderCommissionInvoiceHtml(baseDoc(61), { exemplar: 'cedible' });
    const body = html.split('<body>')[1] || html;
    expect(body).toContain('NOTA DE CRÉDITO ELECTRÓNICA');
    expect(body).not.toContain('Acuse de Recibo');
    expect(body).not.toContain('class="destino-cedible"');
  });
});


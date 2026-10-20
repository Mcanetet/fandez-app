'use strict';

process.env.NODE_ENV = 'test';
process.env.DTE_PROVIDER = 'sii_direct';
process.env.SII_ENVIRONMENT = 'sandbox';
process.env.SII_DTE_DRY_RUN = 'true';

const {
  normalizeSetCase,
  buildReferenciasXml
} = require('../lib/sii-dte/xml/referencia');
const { buildEnvioDte } = require('../lib/sii-dte/xml/dte33');
const { buildIdempotencyHash } = require('../lib/sii-dte/idempotency');
const { generateManualInvoice } = require('../lib/sii-dte/generateManualInvoice');
const { generateCertificationSet } = require('../lib/sii-dte/generateCertificationSet');

describe('SII DTE · referencia SET', () => {
  test('normalizeSetCase desde objeto y string', () => {
    expect(normalizeSetCase({ setId: '1221626', caseNumber: 2 })).toEqual({
      setId: '1221626',
      caseNumber: 2,
      razonRef: 'CASO 1221626-2'
    });
    expect(normalizeSetCase('CASO 1221626-3').razonRef).toBe('CASO 1221626-3');
    expect(normalizeSetCase(null)).toBeNull();
  });

  test('buildReferenciasXml pone SET primero y luego NC', () => {
    const xml = buildReferenciasXml({
      folio: 100,
      issuedAt: '2026-03-19T12:00:00.000Z',
      setCase: { setId: '1221626', caseNumber: 1 },
      reference: {
        folio: 99,
        dteType: 33,
        date: '2026-03-18',
        code: 1,
        reason: 'Anula documento de referencia'
      }
    });
    expect(xml).toMatch(/<NroLinRef>1<\/NroLinRef><TpoDocRef>SET<\/TpoDocRef>/);
    expect(xml).toMatch(/<RazonRef>CASO 1221626-1<\/RazonRef>/);
    expect(xml).toMatch(/<NroLinRef>2<\/NroLinRef><TpoDocRef>33<\/TpoDocRef>/);
    expect(xml).toMatch(/<CodRef>1<\/CodRef>/);
  });

  test('idempotency distingue setCase', () => {
    const a = buildIdempotencyHash({
      requestId: 'r1', total: 1000, receptorRut: '1-9', setCase: 'CASO 1-1'
    });
    const b = buildIdempotencyHash({
      requestId: 'r1', total: 1000, receptorRut: '1-9', setCase: 'CASO 1-2'
    });
    expect(a).not.toBe(b);
  });
});

describe('SII DTE · EnvioDTE multi', () => {
  test('buildEnvioDte acepta varios Documentos y SubTotDTE', () => {
    const docs = [
      '<Documento ID="F1T33"><Encabezado/></Documento>',
      '<Documento ID="F2T33"><Encabezado/></Documento>',
      '<Documento ID="F3T61"><Encabezado/></Documento>'
    ];
    const xml = buildEnvioDte({
      emitter: { rut: '76.000.000-0', name: 'Fandez' },
      documentoFirmadoXml: docs,
      setDteId: 'Set1221626',
      subTotales: [
        { dteType: 33, count: 2 },
        { dteType: 61, count: 1 }
      ],
      caratula: { resolutionDate: '2024-01-01', resolutionNumber: '0' }
    });
    expect(xml).toContain('ID="Set1221626"');
    expect(xml.match(/<DTE version="1.0">/g)).toHaveLength(3);
    expect(xml).toContain('<TpoDTE>33</TpoDTE><NroDTE>2</NroDTE>');
    expect(xml).toContain('<TpoDTE>61</TpoDTE><NroDTE>1</NroDTE>');
    expect(xml).toContain('<RutReceptor>60803000-K</RutReceptor>');
  });
});

describe('SII DTE · set certificación', () => {
  const receptor = {
    rut: '76.999.888-7',
    name: 'Cliente Set SpA',
    giro: 'Servicios',
    address: 'Santiago 1',
    commune: 'Santiago',
    city: 'Santiago'
  };

  test('manual con setId/caso incluye referencia SET en XML', async () => {
    const result = await generateManualInvoice({
      receptor,
      totalClp: 11900,
      description: 'Item set',
      setId: '1221626',
      caseNumber: 1,
      force: true,
      requestId: `set-ref-test-${Date.now()}`
    });
    expect(result.error).toBeUndefined();
    const xml = result.document.meta.documentoFirmadoXml || result.document.xmlContent;
    expect(xml).toMatch(/TpoDocRef>SET</);
    expect(xml).toMatch(/CASO 1221626-1/);
    expect(result.document.meta.setCase.razonRef).toBe('CASO 1221626-1');
  });

  test('generateCertificationSet dry-run empaqueta varios DTE', async () => {
    const result = await generateCertificationSet({
      setId: '1221626',
      issuedBy: 'test@fandez.cl',
      cases: [
        {
          caseNumber: 1,
          dteType: 33,
          receptor,
          lines: [{ name: 'Item AFECTO', qty: 1, unitNeto: 10000 }]
        },
        {
          caseNumber: 2,
          dteType: 33,
          receptor,
          lines: [{ name: 'Otro', qty: 2, unitNeto: 5000 }]
        }
      ]
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].setCase).toBe('CASO 1221626-1');
    expect(result.documents[1].setCase).toBe('CASO 1221626-2');
    const envio = result.document.xmlContent;
    expect(envio).toContain('ID="Set1221626"');
    expect(envio.match(/<DTE version="1.0">/g)).toHaveLength(2);
    expect(envio).toMatch(/<TpoDTE>33<\/TpoDTE><NroDTE>2<\/NroDTE>/);
  });

  test('generateCertificationSet exige setId y cases', async () => {
    expect((await generateCertificationSet({})).error).toMatch(/ID del set/i);
    expect((await generateCertificationSet({ setId: '1' })).error).toMatch(/caso/i);
  });
});

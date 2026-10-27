'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fandez-caf-'));
process.env.SII_SECRETS_DIR = dir;
process.env.FANDEZ_RUT = '78.494.038-1';

const { saveCafUpload, assertCafXml } = require('../lib/sii-dte/folio/cafStore');

function sampleCaf({ type = 33, rut = '78494038-1', from = 1, to = 80 } = {}) {
  return `<?xml version="1.0"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rut}</RE>
      <TD>${type}</TD>
      <RNG><D>${from}</D><H>${to}</H></RNG>
      <FA>2026-10-01</FA>
    </DA>
  </CAF>
  <RSASK>-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKx
-----END RSA PRIVATE KEY-----</RSASK>
</AUTORIZACION>`;
}

describe('Admin · subida de CAF prueba / productivo', () => {
  test('rechaza un archivo que no es CAF', () => {
    expect(() => assertCafXml('<nota>hola</nota>')).toThrow(/CAF/);
  });

  test('guarda prueba y productivo en carpetas distintas', () => {
    const testXml = sampleCaf({ type: 33, from: 1, to: 20 });
    const prodXml = sampleCaf({ type: 33, from: 100, to: 180 });
    const testSaved = saveCafUpload({ xml: testXml, environment: 'sandbox', emitterRut: '78494038-1' });
    const prodSaved = saveCafUpload({ xml: prodXml, environment: 'productivo', emitterRut: '78494038-1' });
    expect(testSaved.file).toBe('sandbox/caf-33.xml');
    expect(prodSaved.file).toBe('production/caf-33.xml');
    expect(testSaved.folioTo).toBe(20);
    expect(prodSaved.folioFrom).toBe(100);
    expect(fs.existsSync(path.join(dir, 'sandbox', 'caf-33.xml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'production', 'caf-33.xml'))).toBe(true);
  });

  test('detecta NC 61 y rechaza RUT ajeno', () => {
    const nc = saveCafUpload({
      xml: sampleCaf({ type: 61, from: 1, to: 10 }),
      environment: 'sandbox',
      emitterRut: '78494038-1'
    });
    expect(nc.dteType).toBe(61);
    expect(nc.label).toBe('NC 61');
    expect(() => saveCafUpload({
      xml: sampleCaf({ rut: '76111111-1' }),
      environment: 'sandbox',
      emitterRut: '78494038-1'
    })).toThrow(/RUT/);
  });
});

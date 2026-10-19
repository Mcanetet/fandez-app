'use strict';

const { lookupLocal, toHyphenRut } = require('../lib/sii-dte/rutLookup');

describe('rutLookup local', () => {
  test('toHyphenRut', () => {
    expect(toHyphenRut('76.494.038-1')).toBe('76494038-1');
  });

  test('encuentra socio por RUT', () => {
    const hit = lookupLocal('76.111.222-3', {
      users: [{
        role: 'provider',
        id: 'p1',
        name: 'Socio Demo',
        companyRut: '76.111.222-3',
        companyName: 'Socio Demo SpA',
        giro: 'Gasfitería',
        email: 'socio@example.com'
      }],
      dteDocs: []
    });
    expect(hit?.found).toBe(true);
    expect(hit.source).toBe('fandez_partner');
    expect(hit.name).toMatch(/Socio Demo/i);
  });

  test('encuentra DTE previo', () => {
    const hit = lookupLocal('12.345.678-5', {
      users: [],
      dteDocs: [{
        receptorRut: '12345678-5',
        receptorName: 'Juan Vendedor',
        meta: { partnerEmail: 'a@b.cl', receptorGiro: 'Particular' }
      }]
    });
    expect(hit?.found).toBe(true);
    expect(hit.source).toBe('fandez_dte');
    expect(hit.name).toBe('Juan Vendedor');
  });
});

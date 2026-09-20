'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const briefs = require('../lib/serviceBriefs');

test('emptyAnswers tiene bloques A–F', () => {
  const a = briefs.emptyAnswers();
  assert.ok('a_razon_social' in a);
  assert.ok('b_packs' in a);
  assert.ok('c_tarifa_base' in a);
  assert.ok('d_campos_obligatorios' in a);
  assert.ok('e_cancelaciones' in a);
  assert.ok('f_split_ok' in a);
});

test('upsertBrief guarda y genera prompt', async () => {
  const result = await briefs.upsertBrief({
    companyName: 'Test Limpieza SpA',
    rubro: 'Limpieza',
    audience: 'B2C',
    answers: {
      a_cobertura: 'Providencia',
      c_tarifa_base: '45000',
      f_split_ok: 'Sí'
    }
  }, { userId: 'test-admin' });

  assert.equal(result.error, undefined);
  assert.ok(result.brief.id.startsWith('brief-'));
  assert.match(result.brief.promptText, /BRIEF SERVICIO FANDEZ/);
  assert.match(result.brief.promptText, /Test Limpieza SpA/);
  assert.match(result.brief.promptText, /45000/);

  const list = await briefs.listBriefs({ limit: 20 });
  assert.ok(list.some((b) => b.id === result.brief.id));

  await briefs.deleteBrief(result.brief.id);
});

test('upsertBrief exige empresa', async () => {
  const result = await briefs.upsertBrief({ companyName: '  ' });
  assert.equal(result.error, 'Indica la empresa o nombre del socio');
});

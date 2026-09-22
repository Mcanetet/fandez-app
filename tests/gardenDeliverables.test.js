'use strict';

const assert = require('assert');
const {
  buildGardenDeliverablesChecklist,
  applyGardenDeliverableUpload,
  assertGardenDeliverablesReady,
  gardenDeliverablesProgress
} = require('../lib/gardenDeliverables');

function ok(label) {
  console.log(`✓ ${label}`);
}

{
  const list = buildGardenDeliverablesChecklist({
    serviceTypes: ['diseno'],
    designAddons: ['riego', 'renders']
  });
  assert.ok(list.some((d) => d.id === 'diseno_planimetria'));
  assert.ok(list.some((d) => d.id === 'diseno_riego'));
  assert.ok(list.some((d) => d.id === 'diseno_renders'));
  assert.ok(!list.some((d) => d.id === 'diseno_iluminacion'));
  assert.ok(!list.some((d) => d.id === 'construccion_avance'));
  ok('checklist diseño + addons');
}

{
  const list = buildGardenDeliverablesChecklist({
    serviceTypes: ['construccion', 'mantencion'],
    designAddons: []
  });
  assert.ok(list.some((d) => d.id === 'construccion_avance'));
  assert.ok(list.some((d) => d.id === 'construccion_entrega'));
  assert.ok(list.some((d) => d.id === 'mantencion_informe'));
  assert.ok(list.some((d) => d.id === 'mantencion_evidencia'));
  ok('checklist construcción + mantención');
}

{
  const request = {
    gardenIntake: { serviceTypes: ['diseno'], designAddons: [] },
    gardenDeliverables: buildGardenDeliverablesChecklist({
      serviceTypes: ['diseno'],
      designAddons: []
    })
  };
  const gate = assertGardenDeliverablesReady(request);
  assert.strictEqual(gate.ok, false);
  const up = applyGardenDeliverableUpload(request, {
    deliverableId: 'diseno_planimetria',
    fileUrl: '/uploads/requests/x/plano.pdf',
    fileName: 'plano.pdf'
  });
  assert.strictEqual(up.success, true);
  assert.strictEqual(up.progress.complete, true);
  assert.strictEqual(assertGardenDeliverablesReady(request).ok, true);
  ok('bloqueo y carga de planimetría');
}

{
  const list = buildGardenDeliverablesChecklist({
    serviceTypes: ['mantencion'],
    designAddons: []
  });
  const p = gardenDeliverablesProgress(list);
  assert.strictEqual(p.done, 0);
  assert.strictEqual(p.total, 2);
  ok('progreso pendiente');
}

console.log('gardenDeliverables tests OK');

'use strict';

const assert = require('assert');
const {
  buildGardenDeliverablesChecklist,
  applyGardenDeliverableUpload,
  clientReviewDeliverable,
  partnerReviewDeliverable,
  assertGardenDeliverablesReady,
  gardenDeliverablesProgress,
  CLIENT_STATUS
} = require('../lib/gardenDeliverables');

function ok(label) {
  console.log(`✓ ${label}`);
}

{
  const list = buildGardenDeliverablesChecklist({
    serviceTypes: ['diseno'],
    designAddons: ['riego', 'renders']
  });
  assert.ok(list.some((d) => d.id === 'diseno_levantamiento'));
  assert.ok(list.some((d) => d.id === 'diseno_anteproyecto'));
  assert.ok(list.some((d) => d.id === 'diseno_planimetria'));
  assert.ok(list.some((d) => d.id === 'diseno_riego'));
  assert.ok(list.some((d) => d.id === 'diseno_renders'));
  assert.ok(!list.some((d) => d.id === 'diseno_iluminacion'));
  assert.ok(!list.some((d) => d.id === 'construccion_avance'));
  ok('checklist diseño + addons + hitos');
}

{
  const list = buildGardenDeliverablesChecklist({
    serviceTypes: ['construccion', 'mantencion'],
    designAddons: []
  });
  assert.ok(list.some((d) => d.id === 'construccion_inicio'));
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
  assert.strictEqual(assertGardenDeliverablesReady(request).ok, false);

  // Levantamiento requiere 2 archivos
  applyGardenDeliverableUpload(request, {
    deliverableId: 'diseno_levantamiento',
    fileUrl: '/u/1.jpg',
    fileName: '1.jpg'
  });
  let item = request.gardenDeliverables.find((d) => d.id === 'diseno_levantamiento');
  assert.strictEqual(item.clientStatus, CLIENT_STATUS.none);
  applyGardenDeliverableUpload(request, {
    deliverableId: 'diseno_levantamiento',
    fileUrl: '/u/2.jpg',
    fileName: '2.jpg'
  });
  item = request.gardenDeliverables.find((d) => d.id === 'diseno_levantamiento');
  assert.strictEqual(item.clientStatus, CLIENT_STATUS.awaiting);
  assert.strictEqual(item.files.length, 2);

  let rev = clientReviewDeliverable(request, {
    deliverableId: 'diseno_levantamiento',
    accept: true
  });
  assert.strictEqual(rev.success, true);
  item = request.gardenDeliverables.find((d) => d.id === 'diseno_levantamiento');
  assert.strictEqual(item.clientStatus, CLIENT_STATUS.accepted);

  // Anteproyecto bloqueado hasta aceptar levantamiento — ya aceptado
  applyGardenDeliverableUpload(request, {
    deliverableId: 'diseno_anteproyecto',
    fileUrl: '/u/ant.pdf',
    fileName: 'ant.pdf'
  });
  clientReviewDeliverable(request, { deliverableId: 'diseno_anteproyecto', accept: true });

  applyGardenDeliverableUpload(request, {
    deliverableId: 'diseno_planimetria',
    fileUrl: '/u/plano.pdf',
    fileName: 'plano.pdf'
  });
  clientReviewDeliverable(request, { deliverableId: 'diseno_planimetria', accept: true });

  assert.strictEqual(assertGardenDeliverablesReady(request).ok, true);
  ok('flujo validación cliente + multi-archivo + unlock');
}

{
  const request = {
    gardenIntake: { serviceTypes: ['construccion'], designAddons: [] },
    gardenDeliverables: buildGardenDeliverablesChecklist({
      serviceTypes: ['construccion'],
      designAddons: []
    })
  };
  applyGardenDeliverableUpload(request, {
    deliverableId: 'construccion_inicio',
    fileUrl: '/a.jpg',
    requirePartnerReview: true
  });
  applyGardenDeliverableUpload(request, {
    deliverableId: 'construccion_inicio',
    fileUrl: '/b.jpg',
    requirePartnerReview: true
  });
  const item = request.gardenDeliverables.find((d) => d.id === 'construccion_inicio');
  assert.strictEqual(item.partnerStatus, 'awaiting_partner');
  partnerReviewDeliverable(request, {
    deliverableId: 'construccion_inicio',
    approve: true
  });
  const after = request.gardenDeliverables.find((d) => d.id === 'construccion_inicio');
  assert.strictEqual(after.clientStatus, CLIENT_STATUS.awaiting);
  const p = gardenDeliverablesProgress(request.gardenDeliverables);
  assert.strictEqual(p.done, 0);
  ok('vista previa socio antes del cliente');
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

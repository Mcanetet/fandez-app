'use strict';

const assert = require('assert');
const {
  normalizeGardenIntake,
  formatGardenIntakeSummary,
  GARDEN_INTAKE_MIN_M2,
  GARDEN_EVAL_VISIT_CLP
} = require('../lib/gardenIntake');

function ok(label) {
  console.log(`✓ ${label}`);
}

{
  const bad = normalizeGardenIntake({ serviceTypes: [] }, { squareMeters: 120 });
  assert.strictEqual(bad.ok, false);
  ok('exige tipo de servicio');
}

{
  const bad = normalizeGardenIntake({
    serviceTypes: ['diseno'],
    locationSector: 'Vitacura',
    propertyType: 'residencial',
    hasDigitalPlan: true,
    acceptTechnicalVisit: true,
    acceptPaymentTerms: true
  }, { squareMeters: 120 });
  assert.strictEqual(bad.ok, false);
  assert.match(bad.error, /plano/i);
  ok('exige plano si marca sí');
}

{
  const res = normalizeGardenIntake({
    serviceTypes: ['diseno', 'construccion'],
    locationSector: 'Chicureo',
    propertyType: 'condominio',
    hasDigitalPlan: false,
    siteVisitOk: true,
    designAddons: ['riego', 'renders'],
    constructionScope: 'desde_cero',
    acceptTechnicalVisit: true,
    acceptPaymentTerms: true
  }, { squareMeters: GARDEN_INTAKE_MIN_M2 });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.intake.serviceTypes, ['diseno', 'construccion']);
  assert.strictEqual(res.intake.evalVisitPrice, GARDEN_EVAL_VISIT_CLP);
  assert.ok(formatGardenIntakeSummary(res.intake).includes('Valle Parraguez'));
  ok('normaliza diseño + construcción');
}

{
  const res = normalizeGardenIntake({
    serviceTypes: ['mantencion'],
    locationSector: 'Las Condes',
    propertyType: 'comercial',
    hasDigitalPlan: true,
    maintenanceFrequency: 'semanal',
    acceptTechnicalVisit: true,
    acceptPaymentTerms: true
  }, { squareMeters: 250, planFileUrl: '/uploads/requests/x/plano.pdf' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.intake.maintenanceFrequency, 'semanal');
  assert.strictEqual(res.intake.planFileUrl, '/uploads/requests/x/plano.pdf');
  ok('mantención con plano y frecuencia');
}

console.log('gardenIntake tests OK');

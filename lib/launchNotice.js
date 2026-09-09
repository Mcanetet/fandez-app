/**
 * Soft launch: septiembre = reclutamiento de socios; octubre = operación.
 * El aviso se oculta solo a partir del 1 de octubre (hora Chile).
 */
'use strict';

const OPERATIONS_START_ISO = '2026-10-01T00:00:00-03:00';

function isPreOperations(now = Date.now()) {
  return now < Date.parse(OPERATIONS_START_ISO);
}

module.exports = {
  OPERATIONS_START_ISO,
  isPreOperations
};

'use strict';

const crypto = require('crypto');

/**
 * Hash estable para no emitir dos DTE ante reintentos del mismo hecho económico.
 * Incluye request, fase, total y RUT receptor.
 */
function buildIdempotencyHash({
  requestId,
  phase = 'fandez_margin',
  dteType = 33,
  total,
  receptorRut,
  environment = 'sandbox',
  refFolio = ''
}) {
  const payload = [
    String(requestId || ''),
    String(phase || ''),
    String(dteType || 33),
    String(Math.round(Number(total) || 0)),
    String(receptorRut || '').replace(/\./g, '').toUpperCase(),
    String(environment || ''),
    String(refFolio || '')
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = { buildIdempotencyHash };

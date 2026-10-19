/**
 * Tipos DTE soportados por el módulo sii-direct.
 */
'use strict';

const SUPPORTED = new Set([33, 43, 46, 61]);

function normalizeDteType(raw, fallback = 33) {
  const n = parseInt(raw, 10);
  if (SUPPORTED.has(n)) return n;
  return fallback;
}

function dteKindLabel(dteType) {
  const t = normalizeDteType(dteType);
  if (t === 61) return 'nota_credito';
  if (t === 46) return 'factura_compra';
  if (t === 43) return 'liquidacion_factura';
  return 'factura';
}

function dtePhase(dteType, manual = false) {
  const t = normalizeDteType(dteType);
  if (t === 61) return 'credit_note';
  if (t === 46) return 'purchase_invoice';
  if (t === 43) return manual ? 'liquidation' : 'fandez_liquidation';
  return manual ? 'manual' : 'fandez_margin';
}

function defaultLineName(dteType) {
  const t = normalizeDteType(dteType);
  if (t === 61) return 'Nota de crédito Fandez';
  if (t === 46) return 'Compra de chatarra / materiales';
  if (t === 43) return 'Liquidación comisión Fandez';
  return 'Servicios Fandez';
}

function dryRunHint(dteType) {
  const t = normalizeDteType(dteType);
  if (t === 61) {
    return 'Dry-run / sandbox sin cert+CAF 61. Configura SII_CAF_61_PATH (+ cert) y SII_DTE_DRY_RUN=false para enviar al SII.';
  }
  if (t === 46) {
    return 'Dry-run / sandbox sin cert+CAF 46. Configura SII_CAF_46_PATH (+ cert) y SII_DTE_DRY_RUN=false para enviar al SII.';
  }
  if (t === 43) {
    return 'Dry-run / sandbox sin cert+CAF 43. Configura SII_CAF_43_PATH (+ cert) y SII_DTE_DRY_RUN=false para enviar al SII.';
  }
  return 'Dry-run / sandbox sin cert+CAF reales. Configura SII_CERT_PATH, SII_CERT_PASSWORD y SII_CAF_33_PATH y SII_DTE_DRY_RUN=false para enviar al SII.';
}

function shortTypeLabel(dteType) {
  const t = normalizeDteType(dteType);
  if (t === 61) return 'NC 61';
  if (t === 46) return 'FC 46';
  if (t === 43) return 'LF 43';
  return 'FV 33';
}

module.exports = {
  SUPPORTED,
  normalizeDteType,
  dteKindLabel,
  dtePhase,
  defaultLineName,
  dryRunHint,
  shortTypeLabel
};

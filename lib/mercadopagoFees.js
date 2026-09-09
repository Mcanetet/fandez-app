/**
 * Costo de cobrar con Mercado Pago (Chile) y traer el dinero a valor presente.
 * El cliente no ve este cargo: se descuenta al liquidar al socio.
 *
 * Tasa online publicada (1 cuota / débito-crédito al contado): 3,19% + IVA.
 * En cuotas MP descuenta un extra (valor presente); Admin puede ajustar la tabla.
 */

'use strict';

const DEFAULT_MP_ONLINE_RATE = 0.0319;
const DEFAULT_IVA = 0.19;

/** Extra sobre la tasa online para dejar el cobro en valor presente (sin IVA). */
const DEFAULT_PRESENT_VALUE_EXTRA = {
  1: 0,
  3: 0.032,
  6: 0.068,
  9: 0.102,
  12: 0.148
};

function toRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n > 1 ? n / 100 : n;
}

const ALLOWED_MAX_INSTALLMENTS = [1, 3, 6, 9, 12];
/** Tope de cuotas en crédito. 3 = 1, 2 o 3; débito sigue en 1 pago. */
const DEFAULT_MAX_CARD_INSTALLMENTS = 3;

function installmentsKey(installments) {
  const n = parseInt(installments, 10);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return ALLOWED_MAX_INSTALLMENTS.reduce((best, k) => (Math.abs(k - n) < Math.abs(best - n) ? k : best), 1);
}

function normalizeMaxCardInstallments(value, fallback = DEFAULT_MAX_CARD_INSTALLMENTS) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return installmentsKey(n);
}

function readGatewayInstallments(payload) {
  if (!payload || typeof payload !== 'object') return 1;
  const n = parseInt(
    payload.installments
      ?? payload.installments_number
      ?? payload.installmentsNumber
      ?? payload.installments_quantity,
    10
  );
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function normalizeMpFees(raw, ivaRate = DEFAULT_IVA) {
  const onlineRate = toRate(raw?.mpOnlineRatePercent ?? raw?.onlineRate, DEFAULT_MP_ONLINE_RATE);
  const extras = { ...DEFAULT_PRESENT_VALUE_EXTRA };
  const src = raw?.mpPresentValueExtra || raw?.presentValueExtra || {};
  [1, 3, 6, 9, 12].forEach((k) => {
    if (src[k] != null || src[String(k)] != null) {
      extras[k] = toRate(src[k] ?? src[String(k)], extras[k]);
    }
  });
  const iva = Number.isFinite(Number(ivaRate)) ? Number(ivaRate) : DEFAULT_IVA;
  return {
    onlineRate,
    ivaRate: iva,
    presentValueExtra: extras,
    /** Tasa efectiva IVA incluido, 1 cuota (lo que cuesta cobrar al contado). */
    cashRateIvaIncluded: onlineRate * (1 + iva)
  };
}

/**
 * @param {number} amount CLP
 * @param {{ installments?: number, mpOnlineRatePercent?: number, mpPresentValueExtra?: object, ivaRate?: number }} [opts]
 */
function mercadoPagoPresentValueCost(amount, opts = {}) {
  const cfg = normalizeMpFees(opts, opts.ivaRate);
  const key = installmentsKey(opts.installments);
  const extra = cfg.presentValueExtra[key] || 0;
  const rateIvaIncluded = (cfg.onlineRate + extra) * (1 + cfg.ivaRate);
  const n = Math.max(0, Number(amount) || 0);
  return {
    installments: key,
    rateNet: cfg.onlineRate + extra,
    rateIvaIncluded,
    amount: Math.round(n * rateIvaIncluded)
  };
}

function effectiveCardFeePercent(opts = {}) {
  return Math.round(mercadoPagoPresentValueCost(100000, opts).rateIvaIncluded * 10000) / 100;
}

module.exports = {
  DEFAULT_MP_ONLINE_RATE,
  DEFAULT_PRESENT_VALUE_EXTRA,
  DEFAULT_MAX_CARD_INSTALLMENTS,
  ALLOWED_MAX_INSTALLMENTS,
  normalizeMpFees,
  normalizeMaxCardInstallments,
  mercadoPagoPresentValueCost,
  effectiveCardFeePercent,
  installmentsKey,
  readGatewayInstallments
};

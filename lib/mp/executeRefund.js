/**
 * Ejecuta devolución en Mercado Pago (misma tarjeta).
 * Usado por admin (aprobación) y por auto-refund sin retención.
 */
const mp = require('../mercadopago');

/**
 * Auto-refund solo si no hay retención y es cancelación en búsqueda / sin técnico.
 * Con retención o servicio avanzado → queda en cola admin.
 */
function canAutoExecuteMpRefund(request) {
  if (!request) return false;
  if (String(request.refundDestination || 'card').toLowerCase() === 'credit') return false;
  const amount = Math.max(0, parseInt(request.refundAmount, 10) || 0);
  if (amount < 1) return false;
  const retention = Math.max(0, parseInt(request.cancellationFeeCharged, 10) || 0);
  if (retention > 0) return false;

  const reason = String(request.cancelReason || '');
  const autoReasons = new Set([
    'client_cancelled_search',
    'client_cancelled_scheduled',
    'no_provider_available',
    'auto_expired_unassigned'
  ]);
  if (autoReasons.has(reason)) return true;

  const tier = String(request.cancellationTier || '');
  if (!request.providerId && (tier === 'beforeAccepted' || tier === '' || tier === 'afterTechAccepted')) {
    return true;
  }
  return false;
}

/**
 * @param {object} store
 * @param {string} requestId
 * @param {{ actor?: string, notes?: string, req?: object, auto?: boolean }} opts
 */
async function executeMpRefund(store, requestId, opts = {}) {
  const actor = opts.actor || (opts.auto ? 'system:auto-refund' : 'admin');
  const prepared = store.prepareMpRefundExecution(requestId);
  if (prepared.error) {
    return { success: false, error: prepared.error };
  }

  if (!mp.isConfigured() || !mp.getAccessToken()) {
    return {
      success: false,
      softFail: true,
      error: 'Mercado Pago no está configurado. La devolución queda pendiente de aprobación admin.'
    };
  }

  const { request, amount } = prepared;
  const noteBase = opts.notes
    || (opts.auto
      ? `Auto-devolución MP (sin retención) · ${store.formatCLP(amount)}`
      : `Devolución MP · ${store.formatCLP(amount)}`);

  store.updateRefundStatus(request.id, {
    status: 'processing',
    notes: noteBase
  }, actor);

  try {
    const paymentId = await mp.resolvePaymentIdForRequest(request);
    if (!paymentId) {
      // Soft: vuelve a cola admin sin marcar fallida definitiva.
      store.updateRefundStatus(request.id, {
        status: 'requested',
        notes: 'Sin payment_id de Mercado Pago. Revisar en admin / panel MP.'
      }, actor);
      return {
        success: false,
        softFail: true,
        error: 'No encontramos el pago en Mercado Pago (falta payment_id).'
      };
    }

    // Si la API entrega fee_details, recalcula: paid − retención − 15% − fee tarjeta.
    let liveAmount = amount;
    try {
      const paymentInfo = await mp.getPaymentInfo(paymentId);
      const apiFee = mp.extractMpFeeAmount?.(paymentInfo);
      if (apiFee != null && typeof store.refineRefundAmountWithMpFee === 'function') {
        const refined = store.refineRefundAmountWithMpFee(request.id, apiFee);
        if (refined?.success && refined.refundAmount != null) {
          liveAmount = refined.refundAmount;
          Object.assign(request, {
            refundAmount: refined.refundAmount,
            refundBreakdown: refined.breakdown || request.refundBreakdown,
            mpFeeAmount: apiFee
          });
        }
      }
    } catch (feeErr) {
      console.warn('[mp/executeRefund] no se pudo leer fee MP:', feeErr.message);
    }

    if (liveAmount < 1) {
      const zeroed = store.updateRefundStatus(request.id, {
        status: 'not_applicable',
        notes: 'Tras comisión Fandez (15%) y costo tarjeta + IVA no queda monto a devolver.'
      }, actor);
      return {
        success: true,
        skipped: true,
        refund: zeroed.refund || { id: request.id, refundAmount: 0, refundStatus: 'not_applicable' },
        mp: { paymentId, refundId: null, status: 'skipped', amount: 0 }
      };
    }

    const paidAmount = Math.round(Number(request.visitPricePaid || request.amountDue || 0));
    const refundAmount = liveAmount >= paidAmount && paidAmount > 0 ? null : liveAmount;
    const mpRefund = await mp.createPaymentRefund({
      paymentId,
      amount: refundAmount,
      idempotencyKey: `fandez-refund-${request.id}-${liveAmount}`
    });

    const mpRefundId = mpRefund?.id != null ? String(mpRefund.id) : null;
    const mpStatus = String(mpRefund?.status || '').toLowerCase();
    const ok = !mpStatus
      || ['approved', 'authorized', 'in_process', 'processed', 'refunded'].includes(mpStatus)
      || Number(mpRefund?.amount || 0) > 0
      || Boolean(mpRefundId);

    if (!ok) {
      store.updateRefundStatus(request.id, {
        status: 'failed',
        notes: `MP respondió sin confirmar: ${mpStatus || 'sin estado'}`,
        externalRef: mpRefundId,
        mpPaymentId: paymentId,
        mpRefundId
      }, actor);
      return {
        success: false,
        error: `Mercado Pago no confirmó la devolución (${mpStatus || 'sin estado'}).`
      };
    }

    const result = store.updateRefundStatus(request.id, {
      status: 'paid',
      notes: `${noteBase}${liveAmount !== amount ? ` · ajustado a ${store.formatCLP(liveAmount)}` : ''}`,
      externalRef: mpRefundId,
      mpPaymentId: paymentId,
      mpRefundId
    }, actor);

    if (typeof store.logSecurityEvent === 'function') {
      store.logSecurityEvent(
        'refund_mp_executed',
        `${request.id} mp=${paymentId} refund=${mpRefundId} amt=${liveAmount} by ${actor}${opts.auto ? ' (auto)' : ''}`,
        opts.req || { session: { user: { email: actor } } }
      );
    }

    return {
      success: true,
      refund: result.refund,
      request: result.request || request,
      mp: {
        paymentId,
        refundId: mpRefundId,
        status: mpStatus || 'ok',
        amount: liveAmount
      }
    };
  } catch (err) {
    const msg = mp.formatMercadoPagoError?.(err) || err.message || 'Error al devolver en Mercado Pago';
    store.updateRefundStatus(request.id, {
      status: 'failed',
      notes: String(msg).slice(0, 500)
    }, actor);
    console.error('[mp/executeRefund]', msg);
    return { success: false, error: msg };
  }
}

/**
 * Si corresponde, ejecuta auto-refund. Nunca lanza: deja cola admin si falla suave.
 */
async function maybeAutoRefundAfterCancel(store, request, opts = {}) {
  if (!canAutoExecuteMpRefund(request)) {
    return { attempted: false, success: false };
  }
  const result = await executeMpRefund(store, request.id, {
    ...opts,
    auto: true,
    actor: opts.actor || 'system:auto-refund',
    notes: opts.notes || `Auto-devolución MP · sin retención · ${store.formatCLP(request.refundAmount || 0)}`
  });
  return { attempted: true, ...result };
}

module.exports = {
  canAutoExecuteMpRefund,
  executeMpRefund,
  maybeAutoRefundAfterCancel
};

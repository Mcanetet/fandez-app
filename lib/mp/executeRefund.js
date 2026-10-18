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

    const paidAmount = Math.round(Number(request.visitPricePaid || request.amountDue || 0));
    const refundAmount = amount >= paidAmount && paidAmount > 0 ? null : amount;
    const mpRefund = await mp.createPaymentRefund({
      paymentId,
      amount: refundAmount,
      idempotencyKey: `fandez-refund-${request.id}-${amount}`
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
      notes: noteBase,
      externalRef: mpRefundId,
      mpPaymentId: paymentId,
      mpRefundId
    }, actor);

    if (typeof store.logSecurityEvent === 'function') {
      store.logSecurityEvent(
        'refund_mp_executed',
        `${request.id} mp=${paymentId} refund=${mpRefundId} by ${actor}${opts.auto ? ' (auto)' : ''}`,
        opts.req || { session: { user: { email: actor } } }
      );
    }

    return {
      success: true,
      refund: result.refund,
      request: result.request || store.getRequestById?.(request.id) || request,
      mp: {
        paymentId,
        refundId: mpRefundId,
        status: mpStatus || 'ok',
        amount
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

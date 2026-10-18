/**
 * Cuando la boleta/factura del socio no cuadra con el total del servicio:
 * 1) Mensaje al socio (email + push)
 * 2) Alerta al admin (ops inbox + founder alerts)
 */
'use strict';

const notifications = require('./notifications');
const founderAlerts = require('./agents/founderAlerts');
const appMode = require('./appMode');

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

/**
 * @param {object} opts
 * @param {object} opts.request
 * @param {object} [opts.provider]
 * @param {number|null} opts.declaredAmount
 * @param {number} opts.expectedAmount
 * @param {object} [opts.store]
 */
async function alertPartnerInvoiceAmountMismatch({
  request,
  provider,
  declaredAmount,
  expectedAmount,
  store = null
} = {}) {
  if (!request) return { skipped: true, reason: 'no_request' };

  const declared = declaredAmount == null ? null : Math.round(Number(declaredAmount));
  const expected = Math.round(Number(expectedAmount) || 0);
  const diff = declared != null && expected > 0 ? declared - expected : null;
  const providerName = provider?.name || request.providerName || 'Socio';
  const jobLabel = request.serviceName || request.id;

  // Persistir intento en el plan (auditoría / panel).
  if (request.providerInvoicePlan) {
    const plan = request.providerInvoicePlan;
    plan.lastMismatchAt = new Date().toISOString();
    plan.lastDeclaredAmount = declared;
    plan.mismatchCount = (plan.mismatchCount || 0) + 1;
    try {
      const repository = require('../models/repository');
      repository.persist(() => repository.saveRequest(request), `mismatch factura ${request.id}`);
    } catch (_) { /* optional */ }
  }

  // 1) Mensaje al socio
  let partnerNotify = null;
  try {
    partnerNotify = await notifications.sendEvent('provider.invoice_amount_mismatch', {
      request,
      provider,
      to: provider?.email || null,
      phone: provider?.phone || null,
      userId: provider?.id || request.providerId,
      declaredAmount: declared,
      expectedAmount: expected,
      difference: diff,
      meta: {
        declaredAmount: declared,
        expectedAmount: expected,
        difference: diff
      }
    });
  } catch (err) {
    console.warn('[invoice-mismatch] partner notify:', err.message);
  }

  try {
    const webPush = require('./webPush');
    const targetId = provider?.id || request.providerId;
    if (targetId) {
      await webPush.notifyUsers([targetId], {
        title: 'Monto de factura no cuadra',
        body: declared != null
          ? `Declaraste ${formatCLP(declared)}; el total del servicio es ${formatCLP(expected)}. Corrige e inténtalo de nuevo.`
          : `El monto debe ser exactamente ${formatCLP(expected)} (100% del servicio).`,
        url: `/proveedor/trabajo/${request.id}`
      });
    }
  } catch (err) {
    console.warn('[invoice-mismatch] partner push:', err.message);
  }

  // 2) Alerta admin
  let adminAlert = null;
  try {
    const adminBase = appMode.getAdminBasePath();
    const bodyLines = [
      `El socio ${providerName} subió (o intentó registrar) un documento cuyo monto no coincide con el total del servicio.`,
      '',
      `Pedido: ${request.id}`,
      `Servicio: ${jobLabel}`,
      `Cliente: ${request.clientName || '—'}`,
      `Monto declarado: ${declared != null ? formatCLP(declared) : '(vacío)'}`,
      `Total servicio esperado: ${formatCLP(expected)}`,
      diff != null ? `Diferencia: ${formatCLP(diff)}` : null,
      `Intentos de mismatch: ${request.providerInvoicePlan?.mismatchCount || 1}`,
      '',
      'No se registró el documento ni se emitió la factura de comisión Fandez.'
    ].filter(Boolean);

    adminAlert = await founderAlerts.notifyInstant({
      agent: 'Sofía',
      severity: 'high',
      title: `Factura socio ≠ total · ${jobLabel}`,
      body: bodyLines.join('\n'),
      link: `${adminBase}/app?tab=ops&request=${encodeURIComponent(request.id)}`,
      dedupeKey: `invoice-mismatch-${request.id}-${declared}-${expected}`,
      store
    });
  } catch (err) {
    console.warn('[invoice-mismatch] admin alert:', err.message);
  }

  try {
    const appStore = store || require('../models/store');
    if (typeof appStore.logSecurityEvent === 'function') {
      appStore.logSecurityEvent(
        'provider_invoice_amount_mismatch',
        JSON.stringify({
          requestId: request.id,
          providerId: provider?.id || request.providerId,
          declaredAmount: declared,
          expectedAmount: expected,
          difference: diff
        }),
        null
      );
    }
  } catch (_) { /* optional */ }

  return { partnerNotify, adminAlert };
}

module.exports = {
  alertPartnerInvoiceAmountMismatch,
  formatCLP
};

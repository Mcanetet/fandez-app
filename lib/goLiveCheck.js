/**
 * Chequeos de preparación para soft launch (sin exponer secretos).
 */
const appMode = require('./appMode');
const mp = require('./mercadopago');
const cardCheckout = require('./payments/cardCheckout');
const gateways = require('./payments/gateways');

function runGoLiveChecks(storeRef) {
  const errors = [...appMode.assertSecureBoot()];
  const warnings = [];
  const info = [];

  const mode = appMode.getMode();
  const nodeProd = process.env.NODE_ENV === 'production';

  if (nodeProd && appMode.isDemoMode()) {
    warnings.push({
      code: 'app_mode_demo',
      message: 'APP_MODE=demo en servidor con NODE_ENV=production. Los clientes pueden pagar en modo demo.',
      action: 'Cambia APP_MODE=production en Hostinger y reinicia.'
    });
  }

  if (appMode.isProductionMode()) {
    if (!mp.isConfigured()) {
      const pricing = storeRef?.getPricingConfig?.() || {};
      const hasGateway = cardCheckout.isAnyCardGatewayConfigured(pricing);
      if (!hasGateway) {
        errors.push('APP_MODE=production pero no hay pasarela de pago (MP/Transbank/PayPal) configurada.');
      }
    }
    if (mp.isConfigured() && !process.env.MP_WEBHOOK_SECRET) {
      warnings.push({
        code: 'mp_webhook_secret',
        message: 'Mercado Pago activo sin MP_WEBHOOK_SECRET. El webhook no valida firma y los pagos pueden no confirmarse solos.',
        action: 'Panel MP → Webhooks → copiar clave a MP_WEBHOOK_SECRET.'
      });
    }
    if (mp.isConfigured() && !process.env.MP_PAYER_EMAIL) {
      warnings.push({
        code: 'mp_payer_email',
        message: 'Falta MP_PAYER_EMAIL. Mercado Pago puede rechazar preferencias en producción.',
        action: 'Define un email válido del comercio en MP_PAYER_EMAIL.'
      });
    }
    if (process.env.MP_SANDBOX === 'true') {
      warnings.push({
        code: 'mp_sandbox',
        message: 'MP_SANDBOX=true en modo producción.',
        action: 'Quita MP_SANDBOX o ponlo en false para cobros reales.'
      });
    }
  }

  const mailer = require('./mailer');
  if (!mailer.isConfigured()) {
    warnings.push({
      code: 'smtp_missing',
      message: 'SMTP no configurado. OTP y comprobantes por email fallarán.',
      action: 'Configura SMTP_HOST, SMTP_USER, SMTP_PASS.'
    });
  }

  if (storeRef?.isReady?.()) {
    const diag = storeRef.getOperationalDiagnostics();
    const high = diag.issues.filter((i) => i.severity === 'high');
    if (high.length) {
      warnings.push({
        code: 'operational_issues',
        message: `${high.length} pedido(s) con problema operativo activo (pago o muro).`,
        action: 'Admin → Diagnóstico operativo.'
      });
    }
    info.push({ operational: diag.summary });
  }

  const pricing = storeRef?.getPricingConfig?.() || {};
  const activeGw = gateways.getActiveCardGateway(pricing);
  info.push({
    appMode: mode,
    paymentGateway: activeGw?.id || null,
    mercadopago: mp.isConfigured(),
    databaseReady: Boolean(storeRef?.isReady?.())
  });

  return {
    ok: errors.length === 0,
    softLaunchReady: errors.length === 0 && warnings.filter((w) => w.code === 'app_mode_demo').length === 0,
    errors,
    warnings,
    info
  };
}

module.exports = { runGoLiveChecks };

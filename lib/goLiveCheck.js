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
    if (mp.isCredentialPairMismatch?.()) {
      warnings.push({
        code: 'mp_credential_mismatch',
        message: 'MP_PUBLIC_KEY y MP_ACCESS_TOKEN no son del mismo tipo (p. ej. TEST vs producción). Los pagos Brick fallan con "Card Token not found".',
        action: 'Mercado Pago → Tu app → Credenciales de prueba: copia Public Key y Access Token del mismo bloque a Hostinger.'
      });
    }
    if (mp.isConfigured() && !mp.isEmbedCheckoutAvailable() && process.env.MP_CHECKOUT_REDIRECT !== 'true') {
      warnings.push({
        code: 'mp_public_key',
        message: 'Falta MP_PUBLIC_KEY o hay mismatch de credenciales. El checkout embebido no está disponible.',
        action: 'Panel MP → Credenciales → Public Key + Access Token del mismo par → Hostinger + reinicio.'
      });
    }
    const mpPk = mp.getPublicKey();
    const mpTok = String(process.env.MP_ACCESS_TOKEN || '').trim();
    if (mpPk && mpTok && mpPk === mpTok) {
      warnings.push({
        code: 'mp_public_key_same_as_token',
        message: 'MP_PUBLIC_KEY es igual al Access Token. Deben ser dos valores distintos del panel de Mercado Pago.',
        action: 'Copia solo la Public Key (no el Access Token) a MP_PUBLIC_KEY.'
      });
    }
    if (process.env.MP_SANDBOX === 'true') {
      warnings.push({
        code: 'mp_sandbox',
        message: 'MP_SANDBOX=true en modo producción.',
        action: 'Quita MP_SANDBOX o ponlo en false para cobros reales.'
      });
      if (!process.env.MP_TEST_PUBLIC_KEY && !process.env.MP_PUBLIC_KEY_TEST) {
        warnings.push({
          code: 'mp_test_public_key',
          message: 'En sandbox conviene MP_TEST_PUBLIC_KEY + MP_TEST_ACCESS_TOKEN (Credenciales de prueba). Si MP_PUBLIC_KEY es de producción, verás «Unauthorized use of live credentials».',
          action: 'Hostinger: añade MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN del panel Pruebas.'
        });
      }
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
    mercadopagoEmbed: mp.isEmbedCheckoutAvailable(),
    mercadopagoSandbox: mp.usesSandboxPayments?.() || false,
    mercadopagoTestPublicKey: Boolean(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST),
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

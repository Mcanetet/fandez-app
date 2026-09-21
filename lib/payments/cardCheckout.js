const gateways = require('./gateways');
const transbank = require('../transbank');
const mp = require('../mercadopago');
const paypal = require('../paypal');

function isAnyCardGatewayConfigured(pricingConfig) {
  return gateways.isCardPaymentAvailable(pricingConfig);
}

async function createCardPayment({ request, service, baseUrl, pricingConfig, gatewayId }) {
  let gateway = null;

  if (gatewayId) {
    const status = gateways.getGatewayStatus(pricingConfig);
    gateway = status[gatewayId]?.enabled ? status[gatewayId] : null;
  }
  if (!gateway) {
    gateway = gateways.getActiveCardGateway(pricingConfig);
  }
  if (!gateway) {
    // Sin credenciales: flujo demo (evita trabar cobros de materiales/ajustes).
    // Con credenciales reales este branch no se alcanza.
    console.warn('[cardCheckout] sin pasarela configurada — modo demo');
    return { mode: 'demo' };
  }

  if (gateway.id === 'transbank') {
    const session = await transbank.createTransaction({ request, baseUrl });
    return {
      mode: 'transbank',
      gateway: 'transbank',
      token: session.token,
      paymentUrl: session.url,
      buyOrder: session.buyOrder,
      redirectPath: `/pagos/transbank/iniciar?ref=${encodeURIComponent(request.id)}${request.additionalChargeId ? `&charge=${encodeURIComponent(request.additionalChargeId)}` : ''}`
    };
  }

  if (gateway.id === 'mercadopago') {
    const preference = await mp.createPreference({
      request,
      service,
      baseUrl,
      maxInstallments: pricingConfig?.maxCardInstallments
    });
    if (!preference) {
      console.warn('[cardCheckout] preferencia MP falló — modo demo');
      return { mode: 'demo' };
    }
    const checkoutUrl = process.env.MP_SANDBOX === 'true'
      ? (preference.sandbox_init_point || preference.init_point)
      : (preference.init_point || preference.sandbox_init_point);
    if (!checkoutUrl) {
      console.warn('[cardCheckout] preferencia MP sin init_point — modo demo');
      return { mode: 'demo' };
    }
    return {
      mode: 'mercadopago',
      gateway: 'mercadopago',
      preferenceId: preference.id,
      checkoutUrl
    };
  }

  if (gateway.id === 'paypal') {
    const order = await paypal.createOrder({ request, service, baseUrl });
    return {
      mode: 'paypal',
      gateway: 'paypal',
      orderId: order.orderId,
      checkoutUrl: order.approveUrl
    };
  }

  console.warn('[cardCheckout] pasarela desconocida — modo demo');
  return { mode: 'demo' };
}

module.exports = {
  isAnyCardGatewayConfigured,
  createCardPayment
};

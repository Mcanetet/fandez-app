const CARD_GATEWAY_IDS = ['transbank', 'mercadopago', 'paypal'];

function maskConfigured(value) {
  return Boolean(value && String(value).trim());
}

function isGatewayCredentialsReady(id) {
  const transbank = require('../transbank');
  if (id === 'transbank') return transbank.isConfigured();
  if (id === 'mercadopago') {
    const mp = require('../mercadopago');
    return mp.isConfigured() && Boolean(mp.getAccessToken());
  }
  if (id === 'paypal') {
    const paypal = require('../paypal');
    return paypal.isConfigured();
  }
  return false;
}

function getGatewayDefinitions() {
  return {
    transbank: {
      id: 'transbank',
      label: 'Transbank Webpay Plus',
      supports: ['card']
    },
    mercadopago: {
      id: 'mercadopago',
      label: 'Mercado Pago',
      supports: ['card']
    },
    paypal: {
      id: 'paypal',
      label: 'PayPal',
      supports: ['card']
    },
    transfer: {
      id: 'transfer',
      label: 'Transferencia bancaria',
      supports: ['transfer']
    }
  };
}

function getGatewayStatus(pricingConfig) {
  const { normalizePricing } = require('../pricing');
  const cfg = normalizePricing(pricingConfig);
  const defs = getGatewayDefinitions();
  const result = {};

  CARD_GATEWAY_IDS.forEach((id) => {
    const adminEnabled = cfg.paymentGateways?.[id]?.enabled !== false;
    const configured = isGatewayCredentialsReady(id);
    result[id] = {
      ...defs[id],
      configured,
      adminEnabled,
      enabled: adminEnabled && configured,
      sortOrder: cfg.paymentGateways?.[id]?.sortOrder || 99,
      ready: configured,
      statusLabel: !adminEnabled
        ? 'Desactivada en admin'
        : (configured ? 'Lista' : 'Sin credenciales')
    };
  });

  result.transfer = {
    ...defs.transfer,
    configured: true,
    adminEnabled: cfg.transferEnabled !== false,
    enabled: cfg.transferEnabled !== false,
    sortOrder: 0,
    ready: true,
    statusLabel: cfg.transferEnabled !== false ? 'Activa' : 'Desactivada en admin'
  };

  return result;
}

function getEnabledCardGateways(pricingConfig) {
  const status = getGatewayStatus(pricingConfig);
  return CARD_GATEWAY_IDS
    .map((id) => status[id])
    .filter((g) => g.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getActiveCardGateway(pricingConfig) {
  const enabled = getEnabledCardGateways(pricingConfig);
  return enabled[0] || null;
}

function isCardPaymentAvailable(pricingConfig) {
  const { normalizePricing } = require('../pricing');
  const cfg = normalizePricing(pricingConfig);
  if (cfg.cardEnabled === false) return false;
  return Boolean(getActiveCardGateway(pricingConfig));
}

module.exports = {
  CARD_GATEWAY_IDS,
  getGatewayDefinitions,
  getGatewayStatus,
  getEnabledCardGateways,
  getActiveCardGateway,
  isCardPaymentAvailable
};

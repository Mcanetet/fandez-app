/**
 * Estado de pasarela Mercado Pago para el panel Admin → Seguridad.
 * Sin secretos: solo flags y prefijos.
 */
'use strict';

function buildMpPaymentStatus(storeRef = null) {
  const mp = require('./mercadopago');
  const gateways = require('./payments/gateways');
  let store = storeRef;
  if (!store) {
    try { store = require('../models/store'); } catch (_) { store = null; }
  }
  const pricing = typeof store?.getPricingConfig === 'function' ? store.getPricingConfig() : {};
  const creds = mp.getCredentialAdminStatus();
  const activeGw = gateways.getActiveCardGateway(pricing);
  return {
    ...creds,
    gatewayReady: Boolean(activeGw),
    activeGateway: activeGw?.id || null,
    embedReady: Boolean(mp.isEmbedCheckoutAvailable()),
    configured: Boolean(mp.isConfigured()),
    checkoutMode: mp.isEmbedCheckoutAvailable()
      ? 'brick'
      : (mp.isConfigured() ? 'checkout_pro' : 'none')
  };
}

function credentialsLabel(st) {
  if (!st) return 'Sin datos';
  if (st.accessTokenConfigured && st.publicKeyConfigured) {
    const kind = st.profile === 'live' ? 'LIVE listas' : 'TEST listas';
    return st.publicKeyPrefix ? `${kind} · ${st.publicKeyPrefix}` : kind;
  }
  if (st.productionEnvPresent && st.profile === 'test') return 'Bloqueadas (fase demo)';
  if (st.accessTokenConfigured && !st.publicKeyConfigured) return 'Falta MP_PUBLIC_KEY';
  if (!st.accessTokenConfigured && st.publicKeyConfigured) return 'Falta MP_ACCESS_TOKEN';
  return 'Faltan en .env';
}

function checkoutLabel(st) {
  if (!st) return 'Sin datos';
  if (st.embedReady) return `Sí · Brick (${st.activeGateway || 'mercadopago'})`;
  if (st.gatewayReady || st.configured) return `Parcial · Checkout Pro (${st.activeGateway || 'mercadopago'})`;
  return 'No · sin pasarela usable';
}

module.exports = {
  buildMpPaymentStatus,
  credentialsLabel,
  checkoutLabel
};

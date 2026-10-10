/**
 * Mercado Pago — fachada pública.
 * Implementación en lib/mp/* (credenciales, Preference, Payment Brick → /v1/payments, webhook).
 */
const credentials = require('./mp/credentials');
const client = require('./mp/client');
const preferences = require('./mp/preferences');
const payments = require('./mp/payments');
const methods = require('./mp/methods');
const webhook = require('./mp/webhook');
const errors = require('./mp/errors');

module.exports = {
  isConfigured: credentials.isConfigured,
  getPublicKey: credentials.getPublicKey,
  getAccessToken: credentials.getAccessToken,
  isCredentialPairMismatch: credentials.isCredentialPairMismatch,
  usesSandboxPayments: credentials.usesSandboxPayments,
  getCredentialAdminStatus: credentials.getCredentialAdminStatus,
  isSandboxMissingTestPublicKey: credentials.isSandboxMissingTestPublicKey,
  isSandboxMissingTestAccessToken: credentials.isSandboxMissingTestAccessToken,
  isEmbedCheckoutAvailable: credentials.isEmbedCheckoutAvailable,
  getLegacySandboxPair: credentials.getLegacySandboxPair,
  resolveSandboxCredentialPair: credentials.resolveSandboxCredentialPair,

  resetClient: client.resetClient,
  refreshClientFromEnv: client.refreshClientFromEnv,

  createPreference: preferences.createPreference,
  buildPreferencePaymentMethods: preferences.buildPreferencePaymentMethods,

  createCardPaymentFromToken: payments.createCardPaymentFromToken,
  getPaymentInfo: payments.getPaymentInfo,
  searchPaymentsByReference: payments.searchPaymentsByReference,

  listCardPaymentMethods: methods.listCardPaymentMethods,
  probeAccessTokenKind: methods.probeAccessTokenKind,

  verifyWebhookSignature: webhook.verifyWebhookSignature,

  formatMercadoPagoError: errors.formatMercadoPagoError,
  paymentErrorForClient: errors.paymentErrorForClient,
  isUnauthorizedLiveCredentialsError: errors.isUnauthorizedLiveCredentialsError
};

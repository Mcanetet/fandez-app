const { MercadoPagoConfig } = require('mercadopago');
const { getAccessToken } = require('./credentials');

let mpClient = null;
let mpClientToken = '';

function resetClient() {
  mpClient = null;
  mpClientToken = '';
}

function getClient() {
  const token = getAccessToken();
  if (!token) {
    resetClient();
    return null;
  }
  if (!mpClient || mpClientToken !== token) {
    mpClient = new MercadoPagoConfig({ accessToken: token });
    mpClientToken = token;
  }
  return mpClient;
}

function refreshClientFromEnv() {
  resetClient();
  return getClient();
}

module.exports = { getClient, resetClient, refreshClientFromEnv };

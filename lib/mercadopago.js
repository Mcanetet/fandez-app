const crypto = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { normalizeMaxCardInstallments, DEFAULT_MAX_CARD_INSTALLMENTS } = require('./mercadopagoFees');

let mpClient = null;

function isConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

function cleanCredential(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '');
}

function getPublicKey() {
  const candidates = [
    process.env.MP_PUBLIC_KEY,
    process.env.MERCADOPAGO_PUBLIC_KEY,
    process.env.MP_PUBLISHABLE_KEY,
    process.env.MP_TEST_PUBLIC_KEY
  ];
  for (const value of candidates) {
    const key = cleanCredential(value);
    if (key) return key;
  }
  return '';
}

function isEmbedCheckoutAvailable() {
  if (process.env.MP_CHECKOUT_REDIRECT === 'true') return false;
  return isConfigured() && Boolean(getPublicKey());
}

function getClient() {
  if (!isConfigured()) return null;
  if (!mpClient) {
    mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  }
  return mpClient;
}

function buildPreferencePaymentMethods(maxInstallments) {
  const installments = normalizeMaxCardInstallments(maxInstallments);
  return {
    installments,
    default_installments: 1
  };
}

async function createPreference({ request, service, baseUrl, maxInstallments }) {
  const client = getClient();
  if (!client) return null;

  const preferenceApi = new Preference(client);
  const amount = Number(request.amountDue ?? request.estimatedVisit);
  const reference = request.paymentReference || request.id;
  const chargeQuery = request.additionalChargeId
    ? `&charge=${encodeURIComponent(request.additionalChargeId)}`
    : '';
  const title = request.additionalChargeId
    ? `Fandez — Ajuste de servicio: ${service.name}`
    : `Fandez — Visita técnica: ${service.name}`;

  const result = await preferenceApi.create({
    body: {
      items: [{
        id: reference,
        title,
        description: request.address,
        quantity: 1,
        unit_price: amount,
        currency_id: 'CLP'
      }],
      payer: {
        name: request.clientName,
        email: process.env.MP_PAYER_EMAIL || 'test@test.com'
      },
      payment_methods: buildPreferencePaymentMethods(
        maxInstallments != null ? maxInstallments : DEFAULT_MAX_CARD_INSTALLMENTS
      ),
      back_urls: {
        success: `${baseUrl}/pagos/exito?ref=${request.id}${chargeQuery}`,
        failure: `${baseUrl}/pagos/error?ref=${request.id}${chargeQuery}`,
        pending: `${baseUrl}/pagos/pendiente?ref=${request.id}${chargeQuery}`
      },
      auto_return: 'approved',
      external_reference: reference,
      notification_url: `${baseUrl}/pagos/webhook`,
      statement_descriptor: 'FANDEZ'
    }
  });

  return {
    id: result.id,
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point
  };
}

async function getPaymentInfo(paymentId) {
  const client = getClient();
  if (!client) return null;
  const paymentApi = new Payment(client);
  return paymentApi.get({ id: paymentId });
}

async function searchPaymentsByReference(reference) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token || !reference) return [];
  try {
    const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (_) {
    return [];
  }
}

function verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }) {
  if (!secret) return true;
  const sig = String(xSignature || '');
  const reqId = String(xRequestId || '');
  const id = String(dataId || '').toLowerCase();
  if (!sig || !id) return false;

  const parts = Object.fromEntries(
    sig.split(',').map((part) => {
      const [key, ...val] = part.trim().split('=');
      return [key, val.join('=')];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  let manifest = `id:${id};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function createCardPaymentFromToken({ request, service, baseUrl, formData, payerEmail }) {
  const client = getClient();
  if (!client || !formData?.token) return null;

  const paymentApi = new Payment(client);
  const amount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  if (!amount || amount < 1) return null;

  const reference = request.paymentReference || request.id;
  const body = {
    transaction_amount: amount,
    token: formData.token,
    description: request.additionalChargeId
      ? `Fandez — Ajuste de servicio: ${service?.name || 'Servicio'}`
      : `Fandez — Visita técnica: ${service?.name || 'Servicio'}`,
    installments: Math.max(1, Number(formData.installments || 1)),
    payment_method_id: formData.payment_method_id,
    payer: {
      email: String(payerEmail || formData.payer?.email || process.env.MP_PAYER_EMAIL || '').trim()
        || 'cliente@fandez.cl'
    },
    external_reference: reference,
    notification_url: `${baseUrl.replace(/\/$/, '')}/pagos/webhook`,
    statement_descriptor: 'FANDEZ'
  };
  if (formData.issuer_id) body.issuer_id = formData.issuer_id;

  return paymentApi.create({ body });
}

module.exports = {
  isConfigured,
  getPublicKey,
  isEmbedCheckoutAvailable,
  createPreference,
  createCardPaymentFromToken,
  getPaymentInfo,
  searchPaymentsByReference,
  verifyWebhookSignature,
  buildPreferencePaymentMethods
};

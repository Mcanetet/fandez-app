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

function normalizeBrickFormData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.token) return raw;
  if (raw.formData?.token) return raw.formData;
  return raw;
}

function normalizeRutNumber(value) {
  return String(value || '')
    .replace(/\./g, '')
    .replace(/\s/g, '')
    .trim();
}

function buildPayerFromBrick(formData, payerEmail, billing) {
  const email = String(
    payerEmail || formData?.payer?.email || process.env.MP_PAYER_EMAIL || ''
  ).trim() || 'cliente@fandez.cl';

  const payer = { email };

  let identification = formData?.payer?.identification;
  if (!identification?.number && formData?.identification?.number) {
    identification = formData.identification;
  }
  if (!identification?.number && billing?.rut) {
    identification = { type: 'RUT', number: billing.rut };
  }

  if (identification?.type && identification?.number) {
    payer.identification = {
      type: String(identification.type).trim(),
      number: normalizeRutNumber(identification.number)
    };
  }

  const holderName = formData?.cardholderName
    || formData?.payer?.name
    || formData?.payer?.first_name
    || billing?.legalName;
  if (holderName) {
    const parts = String(holderName).trim().split(/\s+/).filter(Boolean);
    payer.first_name = parts[0] || String(holderName).trim();
    if (parts.length > 1) payer.last_name = parts.slice(1).join(' ');
  }

  return payer;
}

function formatMercadoPagoError(err) {
  if (!err) return 'Error al procesar el pago. Intenta de nuevo.';
  if (String(err.message || '').startsWith('MP_VALIDATION:')) {
    return err.message.replace(/^MP_VALIDATION:\s*/, '');
  }

  const cause = err.cause;
  if (Array.isArray(cause) && cause.length) {
    const text = cause
      .map((c) => c.description || c.message || c.code)
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  const body = err.apiResponse?.body || err.response?.body || err.body;
  if (body?.message) return String(body.message);
  if (Array.isArray(body?.cause) && body.cause.length) {
    const text = body.cause.map((c) => c.description || c.code).filter(Boolean).join(' ');
    if (text) return text;
  }

  if (err.message && err.message !== 'undefined') return err.message;
  return 'Error al procesar el pago. Intenta de nuevo.';
}

async function createCardPaymentFromToken({ request, service, baseUrl, formData, payerEmail, billing }) {
  const client = getClient();
  const brick = normalizeBrickFormData(formData);
  if (!client || !brick?.token) return null;

  const paymentApi = new Payment(client);
  const amount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  if (!amount || amount < 1) return null;

  const paymentMethodId = brick.payment_method_id || brick.paymentMethodId;
  if (!paymentMethodId) {
    throw new Error('MP_VALIDATION: No se recibió el tipo de tarjeta. Recarga e intenta de nuevo.');
  }

  const payer = buildPayerFromBrick(brick, payerEmail, billing);
  if (!payer.identification?.number) {
    throw new Error('MP_VALIDATION: Falta el RUT del titular de la tarjeta.');
  }

  const reference = request.paymentReference || request.id;
  const body = {
    transaction_amount: amount,
    token: brick.token,
    description: request.additionalChargeId
      ? `Fandez — Ajuste de servicio: ${service?.name || 'Servicio'}`
      : `Fandez — Visita técnica: ${service?.name || 'Servicio'}`,
    installments: Math.max(1, Number(brick.installments || 1)),
    payment_method_id: paymentMethodId,
    payer,
    external_reference: reference,
    notification_url: `${baseUrl.replace(/\/$/, '')}/pagos/webhook`,
    statement_descriptor: 'FANDEZ'
  };

  const issuerId = brick.issuer_id || brick.issuerId;
  if (issuerId) body.issuer_id = issuerId;

  return paymentApi.create({
    body,
    requestOptions: {
      idempotencyKey: `fandez-${reference}-${amount}-${body.installments}`
    }
  });
}

module.exports = {
  isConfigured,
  getPublicKey,
  isEmbedCheckoutAvailable,
  createPreference,
  createCardPaymentFromToken,
  formatMercadoPagoError,
  getPaymentInfo,
  searchPaymentsByReference,
  verifyWebhookSignature,
  buildPreferencePaymentMethods
};

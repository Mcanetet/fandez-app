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

function usesSandboxPayments() {
  if (process.env.MP_SANDBOX === 'true') return true;
  try {
    return require('./appMode').isDemoMode();
  } catch (_) {
    return false;
  }
}

function getPublicKey() {
  const sandbox = usesSandboxPayments();
  if (sandbox) {
    const testPk = cleanCredential(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST);
    if (testPk) return testPk;
    const legacyPk = cleanCredential(process.env.MP_PUBLIC_KEY);
    if (legacyPk && inferMpKeyMode(legacyPk) === 'test') return legacyPk;
    return '';
  }
  const candidates = [
    process.env.MP_PUBLIC_KEY,
    process.env.MERCADOPAGO_PUBLIC_KEY,
    process.env.MP_PUBLISHABLE_KEY
  ];
  for (const value of candidates) {
    const key = cleanCredential(value);
    if (key) return key;
  }
  return '';
}

function isSandboxMissingTestPublicKey() {
  if (!usesSandboxPayments()) return false;
  if (cleanCredential(process.env.MP_TEST_PUBLIC_KEY || process.env.MP_PUBLIC_KEY_TEST)) {
    return false;
  }
  const legacyPk = cleanCredential(process.env.MP_PUBLIC_KEY);
  if (legacyPk && inferMpKeyMode(legacyPk) === 'test') return false;
  return Boolean(legacyPk) || !getPublicKey();
}

function getAccessToken() {
  const sandbox = usesSandboxPayments();
  if (sandbox) {
    const testToken = cleanCredential(
      process.env.MP_TEST_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST
    );
    if (testToken) return testToken;
  }
  return cleanCredential(process.env.MP_ACCESS_TOKEN);
}

function inferMpKeyMode(value) {
  const v = cleanCredential(value);
  if (!v) return null;
  if (v.startsWith('TEST-')) return 'test';
  if (v.startsWith('APP_USR-')) return 'app_usr';
  if (v.startsWith('APP-')) return 'app';
  return 'other';
}

function isCredentialPairMismatch() {
  const pk = getPublicKey();
  const tok = getAccessToken();
  if (!pk || !tok) return false;
  const pkMode = inferMpKeyMode(pk);
  const tokMode = inferMpKeyMode(tok);
  if (pkMode === 'test' && tokMode && tokMode !== 'test') return true;
  if (tokMode === 'test' && pkMode && pkMode !== 'test') return true;
  return false;
}

function isEmbedCheckoutAvailable() {
  if (process.env.MP_CHECKOUT_REDIRECT === 'true') return false;
  if (isCredentialPairMismatch()) return false;
  if (isSandboxMissingTestPublicKey()) return false;
  return isConfigured() && Boolean(getPublicKey());
}

function getClient() {
  if (!isConfigured()) return null;
  if (!mpClient) {
    mpClient = new MercadoPagoConfig({ accessToken: getAccessToken() });
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

function formatChileRutForMp(value) {
  const raw = normalizeRutNumber(value).toUpperCase().replace(/-/g, '');
  if (raw.length < 2) return raw;
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

function resolvePayerEmailForMp(preferredEmail, brickEmail) {
  let email = String(preferredEmail || brickEmail || process.env.MP_PAYER_EMAIL || '').trim();
  if (!email) email = 'cliente@fandez.cl';

  if (process.env.MP_SANDBOX !== 'true') return email;

  const blocked = new Set(
    [process.env.MP_PAYER_EMAIL, process.env.ADMIN_EMAIL, process.env.SUPPORT_EMAIL, 'soporte@fandez.cl']
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (blocked.has(email.toLowerCase())) {
    return `comprador.test.${Date.now()}@testuser.com`;
  }
  return email;
}

function buildPayerFromBrick(formData, payerEmail, billing) {
  const email = resolvePayerEmailForMp(payerEmail, formData?.payer?.email);
  const payer = { email };

  let identification = formData?.payer?.identification;
  if (!identification?.number && formData?.identification?.number) {
    identification = formData.identification;
  }
  if (!identification?.number && billing?.rut) {
    identification = { type: 'RUT', number: billing.rut };
  }

  if (identification?.type && identification?.number) {
    const idType = String(identification.type).trim();
    const idNumber = idType.toUpperCase() === 'RUT'
      ? formatChileRutForMp(identification.number)
      : normalizeRutNumber(identification.number);
    payer.identification = { type: idType, number: idNumber };
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
  const fallback = 'Error al procesar el pago. Intenta de nuevo.';
  if (!err) return fallback;

  const msg = err.message || err.error || '';
  if (/unauthorized use of live credentials/i.test(String(msg))) {
    return 'Credenciales de producción en modo prueba: usa Public Key y Access Token de «Credenciales de prueba» en Hostinger (o define MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN).';
  }
  if (/card token not found/i.test(String(msg))) {
    return 'Token de tarjeta no válido: MP_PUBLIC_KEY y MP_ACCESS_TOKEN deben ser del mismo par en Mercado Pago (ambos de prueba o ambos de producción, misma aplicación). Vuelve a cargar la página e intenta con 1 cuota.';
  }
  if (String(msg).startsWith('MP_VALIDATION:')) {
    return String(msg).replace(/^MP_VALIDATION:\s*/, '');
  }

  const cause = err.cause;
  if (Array.isArray(cause) && cause.length) {
    const text = cause
      .map((c) => c.description || c.message || (c.code != null ? String(c.code) : ''))
      .filter(Boolean)
      .join('. ');
    if (text) {
      if (/unauthorized use of live credentials/i.test(text)) {
        return 'Credenciales de producción en modo prueba: usa Public Key y Access Token de «Credenciales de prueba» en Hostinger (o define MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN).';
      }
      if (/card token not found/i.test(text)) {
        return 'Token de tarjeta no válido: MP_PUBLIC_KEY y MP_ACCESS_TOKEN deben ser del mismo par en Mercado Pago (ambos de prueba o ambos de producción, misma aplicación). Vuelve a cargar la página e intenta con 1 cuota.';
      }
      return text;
    }
  }

  const body = err.apiResponse?.body || err.response?.body || err.body;
  if (Array.isArray(body?.cause) && body.cause.length) {
    const text = body.cause.map((c) => c.description || c.code).filter(Boolean).join('. ');
    if (text) return String(text);
  }
  if (body?.message) return String(body.message);

  if (msg && msg !== 'undefined') return String(msg);
  if (err.status && err.error) return `${err.error} (HTTP ${err.status})`;
  return fallback;
}

async function createCardPaymentFromToken({ request, service, baseUrl, formData, payerEmail, billing }) {
  if (isCredentialPairMismatch()) {
    throw new Error('MP_VALIDATION: Las credenciales de Mercado Pago no coinciden (Public Key vs Access Token). Revisa Hostinger.');
  }

  const client = getClient();
  const brick = normalizeBrickFormData(formData);
  if (!client || !brick?.token) return null;

  const paymentApi = new Payment(client);
  const serverAmount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  const brickAmount = Math.round(Number(brick.transaction_amount ?? 0));
  const amount = brickAmount >= 1 ? brickAmount : serverAmount;
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

  try {
    return await paymentApi.create({
      body,
      requestOptions: {
        idempotencyKey: crypto.randomUUID()
      }
    });
  } catch (err) {
    const detail = formatMercadoPagoError(err);
    console.error('[mercadopago] payment.create failed', detail, err?.cause || err);
    throw err;
  }
}

module.exports = {
  isConfigured,
  getPublicKey,
  getAccessToken,
  isCredentialPairMismatch,
  usesSandboxPayments,
  isSandboxMissingTestPublicKey,
  isEmbedCheckoutAvailable,
  createPreference,
  createCardPaymentFromToken,
  formatMercadoPagoError,
  getPaymentInfo,
  searchPaymentsByReference,
  verifyWebhookSignature,
  buildPreferencePaymentMethods
};

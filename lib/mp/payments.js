const crypto = require('crypto');
const { Payment } = require('mercadopago');
const {
  getAccessToken,
  usesSandboxPayments,
  resolveSandboxCredentialPair,
  isCredentialPairMismatch,
  isSandboxMissingTestAccessToken
} = require('./credentials');
const { getClient, refreshClientFromEnv } = require('./client');
const { formatMercadoPagoError } = require('./errors');
const { resolvePayerEmailForMp } = require('./preferences');

function normalizeRutNumber(value) {
  return String(value || '').replace(/\./g, '').replace(/\s/g, '').trim();
}

function formatChileRutForMp(value) {
  const raw = normalizeRutNumber(value).toUpperCase().replace(/-/g, '');
  if (raw.length < 2) return raw;
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

function normalizeBrickFormData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let data = raw;
  if (!raw.token && raw.formData && typeof raw.formData === 'object') {
    data = { ...raw, ...raw.formData };
  }
  if (!data?.token) return null;

  const paymentMethodId = data.payment_method_id || data.paymentMethodId || null;
  let paymentType = String(
    data.payment_type_id || data.paymentType || data.selectedPaymentMethod || ''
  ).toLowerCase();
  if (paymentType === 'creditcard') paymentType = 'credit_card';
  if (paymentType === 'debitcard') paymentType = 'debit_card';
  if (paymentType === 'prepaidcard') paymentType = 'prepaid_card';

  let installments = Math.max(1, Number(data.installments || 1) || 1);
  if (paymentType === 'prepaid_card' || paymentType === 'debit_card') installments = 1;

  return {
    ...data,
    payment_method_id: paymentMethodId,
    payment_type_id: paymentType || data.payment_type_id || null,
    installments
  };
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

/** Checkout API: token del Payment Brick → POST /v1/payments */
async function createCardPaymentFromToken({ request, service, baseUrl, formData, payerEmail, billing }) {
  if (isCredentialPairMismatch()) {
    throw new Error('MP_VALIDATION: Public Key y Access Token no son del mismo par. Revisa Hostinger.');
  }
  if (usesSandboxPayments()) {
    const pair = resolveSandboxCredentialPair();
    if (pair.source === 'prod_in_demo_blocked' || pair.source === 'test_token_duplicates_prod') {
      throw new Error(`MP_VALIDATION: ${pair.blockedReason}`);
    }
    if (pair.source !== 'mp_test' && pair.source !== 'legacy') {
      throw new Error('MP_VALIDATION: En demo faltan MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN.');
    }
  }
  if (usesSandboxPayments() && isSandboxMissingTestAccessToken()) {
    throw new Error('MP_VALIDATION: Falta MP_TEST_ACCESS_TOKEN (mismo bloque que la Public Key de prueba).');
  }

  const client = refreshClientFromEnv();
  const brick = normalizeBrickFormData(formData);
  if (!client || !brick?.token) return null;

  const serverAmount = Math.round(Number(request.amountDue ?? request.estimatedVisit ?? 0));
  const brickAmount = Math.round(Number(brick.transaction_amount ?? 0));
  const amount = brickAmount >= 1 ? brickAmount : serverAmount;
  if (!amount || amount < 1) return null;

  const paymentMethodId = brick.payment_method_id || brick.paymentMethodId;
  if (!paymentMethodId) {
    throw new Error('MP_VALIDATION: No se recibió el tipo de tarjeta (Visa/MC/Amex). Recarga e intenta de nuevo.');
  }
  // Visa Chile a veces llega como prepaid_card; payment_method_id sigue siendo "visa".

  const payer = buildPayerFromBrick(brick, payerEmail, billing);
  if (!payer.identification?.number) {
    throw new Error('MP_VALIDATION: Falta el RUT del titular de la tarjeta.');
  }

  const paymentType = String(brick.payment_type_id || brick.paymentType || '').toLowerCase();
  let installments = Math.max(1, Number(brick.installments || 1) || 1);
  if (paymentType === 'prepaid_card' || paymentType === 'debit_card') installments = 1;

  const reference = request.paymentReference || request.id;
  const body = {
    transaction_amount: amount,
    token: brick.token,
    description: request.additionalChargeId
      ? `Fandez — Ajuste de servicio: ${service?.name || 'Servicio'}`
      : `Fandez — Visita técnica: ${service?.name || 'Servicio'}`,
    installments,
    payment_method_id: paymentMethodId,
    payer,
    external_reference: reference,
    notification_url: `${String(baseUrl || '').replace(/\/$/, '')}/pagos/webhook`,
    statement_descriptor: 'FANDEZ'
  };

  const issuerId = brick.issuer_id || brick.issuerId;
  if (issuerId) body.issuer_id = issuerId;

  try {
    return await new Payment(client).create({
      body,
      requestOptions: { idempotencyKey: crypto.randomUUID() }
    });
  } catch (err) {
    console.error('[mp/payments] create failed', formatMercadoPagoError(err), err?.cause || err);
    throw err;
  }
}

async function getPaymentInfo(paymentId) {
  const client = getClient();
  if (!client) return null;
  return new Payment(client).get({ id: paymentId });
}

async function searchPaymentsByReference(reference) {
  const token = getAccessToken();
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

module.exports = {
  createCardPaymentFromToken,
  getPaymentInfo,
  searchPaymentsByReference,
  normalizeBrickFormData,
  buildPayerFromBrick
};

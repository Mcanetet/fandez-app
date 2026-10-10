const { Preference } = require('mercadopago');
const { normalizeMaxCardInstallments, DEFAULT_MAX_CARD_INSTALLMENTS } = require('../mercadopagoFees');
const { refreshClientFromEnv } = require('./client');

function buildPreferencePaymentMethods(maxInstallments) {
  const installments = Math.max(1, normalizeMaxCardInstallments(maxInstallments) || 1);
  return { installments, default_installments: 1 };
}

function resolvePayerEmailForMp(preferredEmail, fallback) {
  let email = String(preferredEmail || fallback || process.env.MP_PAYER_EMAIL || '').trim();
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

/** Checkout Pro — redirect. Sin excluded_* (todas las marcas de la cuenta). */
async function createPreference({ request, service, baseUrl, maxInstallments }) {
  const client = refreshClientFromEnv();
  if (!client) return null;

  const amount = Math.round(Number(request.amountDue ?? request.estimatedVisit) || 0);
  const reference = request.paymentReference || request.id;
  const chargeQuery = request.additionalChargeId
    ? `&charge=${encodeURIComponent(request.additionalChargeId)}`
    : '';
  const title = request.additionalChargeId
    ? `Fandez — Ajuste de servicio: ${service.name}`
    : `Fandez — Visita técnica: ${service.name}`;

  const result = await new Preference(client).create({
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
        name: request.clientName || 'Cliente Fandez',
        email: resolvePayerEmailForMp(
          request.clientEmail,
          process.env.MP_PAYER_EMAIL || 'cliente@fandez.cl'
        )
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

module.exports = {
  createPreference,
  buildPreferencePaymentMethods,
  resolvePayerEmailForMp
};

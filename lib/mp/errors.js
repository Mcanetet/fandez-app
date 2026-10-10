const { usesSandboxPayments } = require('./credentials');

function formatMercadoPagoError(err) {
  const fallback = 'Error al procesar el pago. Intenta de nuevo.';
  if (!err) return fallback;

  const msg = err.message || err.error || '';
  if (/unauthorized use of live credentials/i.test(String(msg))) {
    return 'Credenciales de producción en modo prueba: usa Public Key y Access Token de «Credenciales de prueba» (MP_TEST_*).';
  }
  if (/card token not found/i.test(String(msg))) {
    return 'Token de tarjeta no válido: Public Key y Access Token deben ser del mismo par. Recarga e intenta con 1 cuota.';
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
        return 'Credenciales de producción en modo prueba: usa Public Key y Access Token de «Credenciales de prueba» (MP_TEST_*).';
      }
      if (/card token not found/i.test(text)) {
        return 'Token de tarjeta no válido: Public Key y Access Token deben ser del mismo par. Recarga e intenta con 1 cuota.';
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

function isUnauthorizedLiveCredentialsError(err) {
  const raw = `${formatMercadoPagoError(err)} ${err?.message || ''} ${JSON.stringify(err?.cause || '')}`;
  return /unauthorized use of live credentials/i.test(raw);
}

function paymentErrorForClient(err) {
  const raw = formatMercadoPagoError(err);
  if (isUnauthorizedLiveCredentialsError(err) || /unauthorized use of live credentials/i.test(raw)) {
    const sandbox = usesSandboxPayments();
    return {
      error: sandbox
        ? 'Mercado Pago rechazó el cobro: el Access Token actual es de producción.'
        : 'Estás usando tarjetas de prueba en modo productivo.',
      errorTitle: sandbox ? 'Claves de prueba incorrectas' : 'Mercado Pago · modo productivo',
      errorDetail: sandbox
        ? 'Copia Public Key + Access Token del bloque «Credenciales de prueba» a MP_TEST_* en Hostinger. Titular APRO, RUT 123456789.'
        : 'En Admin activa Productivo 2.0 y usa MP_PUBLIC_KEY + MP_ACCESS_TOKEN de producción.',
      code: 'mp_live_credentials_in_test'
    };
  }
  if (/MP_VALIDATION:/i.test(raw) || /Falta MP_TEST/i.test(raw)) {
    return {
      error: raw.replace(/^MP_VALIDATION:\s*/i, ''),
      errorTitle: 'Revisa la configuración de pago',
      errorDetail: 'Para producción: Productivo 2.0 + credenciales live.'
    };
  }
  if (/card token not found/i.test(raw)) {
    return {
      error: 'La tarjeta no coincidió con la app de Mercado Pago.',
      errorTitle: 'Vuelve a intentar',
      errorDetail: 'Recarga la página. Public Key y Access Token del mismo par. 1 cuota.'
    };
  }
  return {
    error: raw,
    errorTitle: 'Pago no completado',
    errorDetail: ''
  };
}

module.exports = {
  formatMercadoPagoError,
  isUnauthorizedLiveCredentialsError,
  paymentErrorForClient
};

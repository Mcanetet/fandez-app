/**
 * Enrutado de intenciones Sofía: servicio → socio, pagos → admin interno.
 * Sin WhatsApp/Meta hacia clientes.
 */
const { ROUTING_PROMPT } = require('./sofiaPrompts');

const PAYMENT_PATTERNS = [
  /\bpago(s)?\b/i,
  /\bpagar\b/i,
  /\bcobro(s)?\b/i,
  /\bcobr[oaá](r|ron|ndo|do|da)?\b/i,
  /\bfactura(s)?\b/i,
  /\bboleta(s)?\b/i,
  /\btransferencia(s)?\b/i,
  /\btarjeta\b/i,
  /\bmercado\s*pago\b/i,
  /\bwebpay\b/i,
  /\breembolso\b/i,
  /\bdevoluci[oó]n\b/i,
  /\bcargo\b/i,
  /\bdoble\s+cobro\b/i,
  /\bcomprobante\b/i,
  /\bvoucher\b/i,
  /\bno\s+me\s+cobr/i,
  /\bprecio\s+(mal|incorrecto|cobrado)/i
];

const SERVICE_PATTERNS = [
  /\bt[eé]cnico\b/i,
  /\bvisita\b/i,
  /\binstalaci[oó]n\b/i,
  /\breparaci[oó]n\b/i,
  /\bfiltraci[oó]n\b/i,
  /\binund/i,
  /\bolor\s+a\s+gas\b/i,
  /\bfuga\s+de\s+gas\b/i,
  /\bchispas?\b/i,
  /\bno\s+(me\s+)?(funciona|prende|enciende)\b/i,
  /\burgente\b/i,
  /\bemergencia\b/i,
  /\bpresupuesto\b/i,
  /\bcotizaci[oó]n\b/i,
  /\bgasfiter/i,
  /\belectric/i,
  /\bcerradur/i,
  /\bcaldera/i,
  /\bgenerador/i,
  /\bpintura\b/i,
  /\bpintar\b/i,
  /\bespecialista\b/i,
  /\bsocio\b/i,
  /\ben\s+terreno\b/i
];

const SAFETY_PATTERNS = [
  /\bolor\s+a\s+gas\b/i,
  /\bfuga\s+de\s+gas\b/i,
  /\binund/i,
  /\bchispas?\b/i,
  /\bhumo\b/i,
  /\bincendio\b/i,
  /\belectrocuci/i,
  /\bcorriente\s+(en\s+)?(el\s+)?agua\b/i,
  /\bpersona\s+atrapad/i
];

function classifyTopic(text) {
  const raw = String(text || '');
  if (PAYMENT_PATTERNS.some((re) => re.test(raw))) return 'payment';
  if (SAFETY_PATTERNS.some((re) => re.test(raw)) || SERVICE_PATTERNS.some((re) => re.test(raw))) return 'service';
  return 'general';
}

function looksLikeSafetyEmergency(text) {
  return SAFETY_PATTERNS.some((re) => re.test(String(text || '')));
}

module.exports = {
  classifyTopic,
  looksLikeSafetyEmergency,
  ROUTING_PROMPT,
  PAYMENT_PATTERNS,
  SERVICE_PATTERNS,
  SAFETY_PATTERNS
};

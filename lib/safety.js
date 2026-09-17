/**
 * Protocolo de seguridad personal (cliente ↔ técnico/socio).
 * Distinto de emergencias del hogar (gas/fuego) que maneja Sofía.
 */

'use strict';

const SAFETY_CATEGORIES = [
  { id: 'unsafe_feeling', label: 'Me siento inseguro/a', priority: 'alta', severity: 'S2' },
  { id: 'harassment', label: 'Acoso o conducta indebida', priority: 'critica', severity: 'S1' },
  { id: 'theft', label: 'Robo o hurto', priority: 'critica', severity: 'S1' },
  { id: 'assault_threat', label: 'Amenaza o agresión', priority: 'critica', severity: 'S1' },
  { id: 'fraud', label: 'Fraude o cobro indebido', priority: 'alta', severity: 'S2' },
  { id: 'property_damage', label: 'Daño a la propiedad', priority: 'media', severity: 'S3' },
  { id: 'other_safety', label: 'Otro problema de seguridad', priority: 'alta', severity: 'S2' }
];

const EMERGENCY_NUMBERS = {
  carabineros: { code: '133', label: 'Carabineros' },
  bomberos: { code: '132', label: 'Bomberos' },
  samu: { code: '131', label: 'SAMU' }
};

/** Patrones de seguridad interpersonal (no hogar). */
const PERSONAL_SAFETY_PATTERNS = [
  /\bme\s+siento\s+insegur/i,
  /\binsegur[oa]\s+con\s+(el|la|este|esta)\s+t[eé]cnic/i,
  /\bacos(o|ando|ada|ado)\b/i,
  /\bamenaz(a|ó|ando)\b/i,
  /\bagresi[oó]n\b/i,
  /\bme\s+(toc[oó]|tocaron|agarr)/i,
  /\brob(o|aron|ado)\b/i,
  /\bhurto\b/i,
  /\bviolencia\b/i,
  /\bpeligroso\b/i,
  /\bno\s+me\s+(siento\s+)?segur/i,
  /\bllamar\s+(a\s+)?(carabineros|la\s+polic[ií]a|133)\b/i,
  /\bdenunciar\b/i
];

function getCategory(id) {
  return SAFETY_CATEGORIES.find((c) => c.id === id) || SAFETY_CATEGORIES[SAFETY_CATEGORIES.length - 1];
}

function looksLikePersonalSafety(text) {
  return PERSONAL_SAFETY_PATTERNS.some((re) => re.test(String(text || '')));
}

function buildSafetyReplyEs() {
  return [
    'Tu seguridad es primero. Si hay riesgo inmediato, llama al **133 (Carabineros)**.',
    'En la visita activa usa el botón **Me siento inseguro** para alertar a Fandez (queda registro con hora y pedido).',
    'También puedes reportar desde el servicio sin cancelar. Un humano revisará el caso.',
    '',
    '132 Bomberos · 131 SAMU · 133 Carabineros.'
  ].join('\n');
}

module.exports = {
  SAFETY_CATEGORIES,
  EMERGENCY_NUMBERS,
  PERSONAL_SAFETY_PATTERNS,
  getCategory,
  looksLikePersonalSafety,
  buildSafetyReplyEs
};

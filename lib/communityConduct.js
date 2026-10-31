/**
 * Convivencia Fandez: sexo, violencia y lenguaje en chats y fotos.
 * El usuario puede reportar y bloquear; el servidor rechaza texto explícito.
 */
'use strict';

const REASONS = [
  { id: 'ugc_sex', label: 'Contenido sexual', safetyId: 'ugc_sex', priority: 'alta', severity: 'S2' },
  { id: 'ugc_violence', label: 'Violencia', safetyId: 'ugc_violence', priority: 'critica', severity: 'S1' },
  { id: 'ugc_language', label: 'Lenguaje ofensivo', safetyId: 'ugc_language', priority: 'media', severity: 'S3' }
];

const SEX_PATTERNS = [
  /\b(nudes?|pack\s+de\s+fotos|porn[oa]?|xxx|onlyfans)\b/i,
  /\b(sexo\s+expl[ií]cito|contenido\s+sexual|video\s+sexual)\b/i,
  /\b(pendeja\s+rica|mandame\s+fotos?\s+desnud)/i
];

const VIOLENCE_PATTERNS = [
  /\b(te\s+voy\s+a\s+matar|te\s+mato|amenaza\s+de\s+muerte)\b/i,
  /\b(te\s+parto\s+la\s+cara|te\s+voy\s+a\s+pegar|te\s+voy\s+a\s+romper)\b/i,
  /\b(dispar(o|arte)|te\s+apu[nñ]al)/i
];

const LANGUAGE_PATTERNS = [
  /\b(puta|puto|mierda|culiao|culiá|conchetumadre|conchesumadre|hijueputa|maric[oó]n)\b/i,
  /\b(fuck|shit|bitch|asshole|motherfucker)\b/i,
  /\b(qliao|ctm|wn\s+ql)\b/i
];

function getReason(id) {
  return REASONS.find((r) => r.id === id) || null;
}

function scanText(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { blocked: false, reasonId: null };
  if (SEX_PATTERNS.some((re) => re.test(raw))) {
    return {
      blocked: true,
      reasonId: 'ugc_sex',
      message: 'Ese mensaje no se envía: Fandez no permite contenido sexual.'
    };
  }
  if (VIOLENCE_PATTERNS.some((re) => re.test(raw))) {
    return {
      blocked: true,
      reasonId: 'ugc_violence',
      message: 'Ese mensaje no se envía: Fandez no permite amenazas ni violencia.'
    };
  }
  if (LANGUAGE_PATTERNS.some((re) => re.test(raw))) {
    return {
      blocked: true,
      reasonId: 'ugc_language',
      message: 'Ese mensaje no se envía: usa un lenguaje respetuoso.'
    };
  }
  return { blocked: false, reasonId: null };
}

module.exports = {
  REASONS,
  getReason,
  scanText,
  SEX_PATTERNS,
  VIOLENCE_PATTERNS,
  LANGUAGE_PATTERNS
};

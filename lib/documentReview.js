const fs = require('fs');
const path = require('path');
const openai = require('./aland/openai');
const { DOCUMENT_CATALOG } = require('./contracts');

const PUBLIC_ROOT = path.join(__dirname, '../public');

const KYC_EXPECTATIONS = {
  idFront: 'Cédula de identidad chilena — anverso (foto, nombre, RUN, holograma).',
  idBack: 'Cédula de identidad chilena — reverso (código, domicilio, fecha de vencimiento).',
  selfie: 'Selfie real de una persona viva, no foto de un carnet ni captura de pantalla.'
};

function emptyAiReview() {
  return {
    status: 'pending',
    authentic: null,
    confidence: null,
    reason: '',
    reviewedAt: null
  };
}

function emptyHumanReview() {
  return {
    status: 'pending',
    notes: '',
    reviewedBy: null,
    reviewedAt: null
  };
}

function emptyDocumentReview() {
  return { ai: emptyAiReview(), human: emptyHumanReview() };
}

function resolvePublicFilePath(fileUrl) {
  if (!fileUrl) return null;
  const rel = String(fileUrl).replace(/^\/+/, '').split('?')[0];
  if (!rel.startsWith('uploads/')) return null;
  const full = path.resolve(PUBLIC_ROOT, rel);
  if (!full.startsWith(path.resolve(PUBLIC_ROOT))) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

function toDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return null;
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buf = fs.readFileSync(filePath);
  const max = 3.5 * 1024 * 1024;
  if (buf.length > max) return null;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function parseReviewJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]);
  } catch (_) {
    return null;
  }
}

function expectationFor(docKey) {
  if (KYC_EXPECTATIONS[docKey]) return KYC_EXPECTATIONS[docKey];
  const def = DOCUMENT_CATALOG[docKey];
  if (def) return `${def.label}. ${def.hint || ''}`.trim();
  if (String(docKey).startsWith('technical_certs')) {
    return 'Certificación técnica (SEC, gas u oficio) emitida por un organismo reconocible.';
  }
  return 'Documento legal o de identidad chileno auténtico y legible.';
}

function normalizeAiStatus(parsed, { isPdf } = {}) {
  const verdict = String(parsed?.verdict || '').toLowerCase();
  const authentic = parsed?.authentic === true;
  if (verdict === 'fake' || parsed?.authentic === false && parsed?.confidence >= 0.75) {
    return { status: 'fake', authentic: false };
  }
  if (verdict === 'unreadable') {
    return { status: 'unreadable', authentic: null };
  }
  if (verdict === 'suspicious') {
    return { status: 'suspicious', authentic: null };
  }
  if (verdict === 'verified' || authentic) {
    return { status: 'verified', authentic: true };
  }
  if (isPdf) {
    return { status: 'pending_manual', authentic: null };
  }
  return { status: 'suspicious', authentic: null };
}

async function reviewIdentityDocument({ url, docKey, expectedType } = {}) {
  const reviewedAt = new Date().toISOString();
  const expected = expectedType || expectationFor(docKey);

  if (!url) {
    return {
      status: 'unreadable',
      authentic: false,
      confidence: 1,
      reason: 'No hay archivo para revisar.',
      reviewedAt
    };
  }

  if (!openai.isConfigured()) {
    return {
      status: 'pending_manual',
      authentic: null,
      confidence: null,
      reason: 'IA no configurada: el equipo debe confirmar autenticidad a mano.',
      reviewedAt
    };
  }

  const filePath = resolvePublicFilePath(url);
  const isPdf = filePath && path.extname(filePath).toLowerCase() === '.pdf';
  const dataUrl = filePath ? toDataUrl(filePath) : null;

  const system = `Eres el revisor de antecedentes de Fandez (Chile).
Debes decidir si el archivo parece un documento REAL y del TIPO esperado, o un falso / irrelevante.
Responde SOLO JSON válido:
{"authentic":true|false,"verdict":"verified"|"suspicious"|"fake"|"unreadable","confidence":0-1,"reason":"texto corto en español"}

Criterios:
- verified: se ve un documento chileno auténtico del tipo pedido, legible, sin recortes graves.
- suspicious: borroso, recortado, tipo dudoso, posible edición, o no se puede afirmar autenticidad.
- fake: claramente otro documento, selfie cuando se pide carnet, captura de WhatsApp, montaje, plantilla vacía o texto inventado.
- unreadable: no se lee nada útil.
Nunca apruebes un documento solo porque hay una foto: tiene que coincidir con el tipo esperado.
Si es PDF y no hay imagen, usa unreadable o suspicious, no verified.`;

  const userText = [
    `Tipo esperado: ${expected}`,
    `Clave interna: ${docKey || 'n/d'}`,
    isPdf ? 'El archivo es PDF.' : 'El archivo es una imagen.'
  ].join('\n');

  const userContent = dataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    : userText;

  const fallback = {
    status: 'pending_manual',
    authentic: null,
    confidence: null,
    reason: 'La IA no alcanzó a revisar a tiempo; el equipo debe confirmar.',
    reviewedAt
  };

  try {
    const work = openai.chatCompletion({
      model: process.env.DOCUMENTS_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 280,
      agent: 'compliance',
      operation: 'document_review',
      meta: { docKey, url },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    });

    const timed = await Promise.race([
      work,
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 22000))
    ]);

    if (timed?.timeout) return fallback;

    const parsed = parseReviewJson(timed.content);
    if (!parsed) {
      return {
        status: 'pending_manual',
        authentic: null,
        confidence: null,
        reason: 'La IA no devolvió un veredicto claro.',
        reviewedAt
      };
    }

    const mapped = normalizeAiStatus(parsed, { isPdf: Boolean(isPdf && !dataUrl) });
    return {
      status: mapped.status,
      authentic: mapped.authentic,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: String(parsed.reason || '').slice(0, 320) || 'Revisión automática lista.',
      reviewedAt
    };
  } catch (err) {
    return {
      status: 'pending_manual',
      authentic: null,
      confidence: null,
      reason: `No se pudo revisar con IA: ${err.message || 'error'}`,
      reviewedAt
    };
  }
}

module.exports = {
  reviewIdentityDocument,
  emptyAiReview,
  emptyHumanReview,
  emptyDocumentReview,
  expectationFor,
  resolvePublicFilePath
};

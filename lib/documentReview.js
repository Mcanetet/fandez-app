const fs = require('fs');
const path = require('path');
const openai = require('./aland/openai');
const { DOCUMENT_CATALOG } = require('./contracts');
const { resolveProviderDocPath, toServingUrl } = require('./uploads');

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
  if (!fileUrl || fileUrl === 'demo') return null;
  const serving = toServingUrl(fileUrl) || fileUrl;
  const fromProvider = resolveProviderDocPath(serving) || resolveProviderDocPath(fileUrl);
  if (fromProvider) return fromProvider;
  // Legacy: solo public/
  const rel = String(fileUrl).replace(/^\/+/, '').split('?')[0];
  if (!rel.startsWith('uploads/')) return null;
  const full = path.resolve(path.join(__dirname, '../public'), rel);
  const root = path.resolve(path.join(__dirname, '../public'));
  if (!full.startsWith(root)) return null;
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

function normalizePersonName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRut(rut) {
  const raw = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (raw.length < 2) return '';
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

function namesLikelyMatch(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return na.includes(nb) || nb.includes(na);
  const overlap = ta.filter((t) => tb.includes(t));
  return overlap.length >= 2;
}

function emptyRepresentativeMatch() {
  return {
    status: 'pending',
    validated: false,
    label: 'Representante pendiente',
    reason: '',
    carnetName: '',
    carnetRut: '',
    deedName: '',
    deedRut: '',
    declaredName: '',
    declaredRut: '',
    confidence: null,
    reviewedAt: null
  };
}

function emptyErutValidation() {
  return {
    status: 'pending',
    validated: false,
    label: 'e-RUT pendiente',
    reason: '',
    extractedRut: '',
    extractedLegalName: '',
    declaredRut: '',
    declaredLegalName: '',
    hasQrOrBarcode: null,
    qrLooksAuthentic: null,
    dataMatches: null,
    confidence: null,
    reviewedAt: null
  };
}

async function extractFieldsFromDocument({ url, docKey } = {}) {
  const reviewedAt = new Date().toISOString();
  if (!url || url === 'demo' || !openai.isConfigured()) {
    return { extractedName: '', extractedRut: '', reviewedAt };
  }
  const filePath = resolvePublicFilePath(url);
  const dataUrl = filePath ? toDataUrl(filePath) : null;
  if (!dataUrl && !(filePath && path.extname(filePath).toLowerCase() === '.pdf')) {
    return { extractedName: '', extractedRut: '', reviewedAt };
  }

  const isDeed = docKey === 'incorporation_deed';
  const system = `Eres un extractor de identidad para Fandez (Chile).
Lee el documento y responde SOLO JSON:
{"extractedName":"nombre completo visible o vacío","extractedRut":"RUT con puntos/guión o vacío","notes":"texto corto"}
${isDeed
    ? 'Prioriza el representante legal / administrador / gerente general nombrado en la escritura o extracto.'
    : 'Prioriza el nombre y RUN de la cédula de identidad.'}`;

  try {
    const userContent = dataUrl
      ? [
          { type: 'text', text: `Documento: ${docKey || 'n/d'}` },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      : `Documento PDF ${docKey}. No hay imagen; deja campos vacíos si no puedes leer.`;

    const { content } = await openai.chatCompletion({
      model: process.env.DOCUMENTS_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 180,
      agent: 'compliance',
      operation: 'identity_extract',
      meta: { docKey, url },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    });
    const parsed = parseReviewJson(content) || {};
    return {
      extractedName: String(parsed.extractedName || '').slice(0, 160),
      extractedRut: String(parsed.extractedRut || '').slice(0, 20),
      notes: String(parsed.notes || '').slice(0, 200),
      reviewedAt
    };
  } catch (_) {
    return { extractedName: '', extractedRut: '', reviewedAt };
  }
}

/**
 * Compara carnet (frente) vs escritura vs datos declarados del representante.
 * Resultado: status validated | mismatch | pending | insufficient
 */
async function validateLegalRepresentative({
  carnetUrl,
  deedUrl,
  declaredName = '',
  declaredRut = '',
  carnetHints = {},
  deedHints = {}
} = {}) {
  const reviewedAt = new Date().toISOString();
  const base = emptyRepresentativeMatch();
  base.declaredName = String(declaredName || '').trim();
  base.declaredRut = String(declaredRut || '').trim();
  base.reviewedAt = reviewedAt;

  if (!carnetUrl || carnetUrl === 'demo' || !deedUrl || deedUrl === 'demo') {
    return {
      ...base,
      status: 'insufficient',
      label: 'Falta carnet o escritura',
      reason: 'Sube carnet (frente) y escritura para validar al representante.'
    };
  }

  let carnetName = carnetHints.extractedName || '';
  let carnetRut = carnetHints.extractedRut || '';
  let deedName = deedHints.extractedName || '';
  let deedRut = deedHints.extractedRut || '';

  if (!carnetName || !deedName) {
    if (!openai.isConfigured()) {
      return {
        ...base,
        status: 'pending',
        label: 'Representante pendiente',
        reason: 'IA no configurada: valida a mano que el carnet coincida con la escritura.'
      };
    }
    const [fromCarnet, fromDeed] = await Promise.all([
      carnetName ? Promise.resolve({ extractedName: carnetName, extractedRut: carnetRut })
        : extractFieldsFromDocument({ url: carnetUrl, docKey: 'idFront' }),
      deedName ? Promise.resolve({ extractedName: deedName, extractedRut: deedRut })
        : extractFieldsFromDocument({ url: deedUrl, docKey: 'incorporation_deed' })
    ]);
    carnetName = carnetName || fromCarnet.extractedName;
    carnetRut = carnetRut || fromCarnet.extractedRut;
    deedName = deedName || fromDeed.extractedName;
    deedRut = deedRut || fromDeed.extractedRut;
  }

  base.carnetName = carnetName;
  base.carnetRut = carnetRut;
  base.deedName = deedName;
  base.deedRut = deedRut;

  if (!carnetName && !deedName) {
    return {
      ...base,
      status: 'insufficient',
      label: 'No se pudo leer',
      reason: 'No se leyó el nombre en carnet ni escritura. Revisa las fotos o valida a mano.'
    };
  }

  // Segunda pasada con ambos docs si hay API (más robusto)
  if (openai.isConfigured()) {
    try {
      const carnetPath = resolvePublicFilePath(carnetUrl);
      const deedPath = resolvePublicFilePath(deedUrl);
      const carnetData = carnetPath ? toDataUrl(carnetPath) : null;
      const deedData = deedPath ? toDataUrl(deedPath) : null;
      if (carnetData && deedData) {
        const system = `Eres el validador de representante legal de Fandez (Chile).
Compara la cédula (carnet) con la escritura/extracto de la empresa.
Responde SOLO JSON:
{"match":true|false,"confidence":0-1,"carnetName":"...","carnetRut":"...","deedName":"...","deedRut":"...","reason":"texto corto en español"}
match=true solo si es la misma persona (nombre coherente; RUT igual si ambos se leen).
Si la escritura nombra varios, elige el administrador/representante legal.`;

        const userContent = [
          {
            type: 'text',
            text: [
              `Declarado en el formulario: ${declaredName || 'n/d'} · RUT ${declaredRut || 'n/d'}`,
              'Imagen 1 = carnet frente. Imagen 2 = escritura.'
            ].join('\n')
          },
          { type: 'image_url', image_url: { url: carnetData } },
          { type: 'image_url', image_url: { url: deedData } }
        ];

        const { content } = await openai.chatCompletion({
          model: process.env.DOCUMENTS_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0,
          maxTokens: 280,
          agent: 'compliance',
          operation: 'representative_match',
          meta: { declaredName, declaredRut },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent }
          ]
        });
        const parsed = parseReviewJson(content);
        if (parsed && typeof parsed.match === 'boolean') {
          const validated = parsed.match === true;
          return {
            ...base,
            status: validated ? 'validated' : 'mismatch',
            validated,
            label: validated ? 'Representante validado' : 'Representante no coincide',
            reason: String(parsed.reason || (validated
              ? 'El representante de la escritura coincide con el carnet.'
              : 'El nombre/RUT del carnet no coincide con el de la escritura.')).slice(0, 320),
            carnetName: String(parsed.carnetName || carnetName).slice(0, 160),
            carnetRut: String(parsed.carnetRut || carnetRut).slice(0, 20),
            deedName: String(parsed.deedName || deedName).slice(0, 160),
            deedRut: String(parsed.deedRut || deedRut).slice(0, 20),
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
            reviewedAt
          };
        }
      }
    } catch (err) {
      const msg = String(err.message || '');
      if (!/api key|sk-|incorrect api|401|unauthorized/i.test(msg)) {
        // cae al matching heurístico
      }
    }
  }

  const rutCarnet = normalizeRut(carnetRut);
  const rutDeed = normalizeRut(deedRut);
  const rutDeclared = normalizeRut(declaredRut);
  const rutOk = rutCarnet && rutDeed
    ? rutCarnet === rutDeed
    : (rutCarnet && rutDeclared ? rutCarnet === rutDeclared : true);
  const nameOk = namesLikelyMatch(carnetName, deedName)
    || (declaredName && namesLikelyMatch(carnetName, declaredName) && namesLikelyMatch(deedName, declaredName));

  if (nameOk && rutOk) {
    return {
      ...base,
      status: 'validated',
      validated: true,
      label: 'Representante validado',
      reason: 'El representante de la escritura coincide con el carnet.',
      confidence: rutCarnet && rutDeed ? 0.9 : 0.75,
      reviewedAt
    };
  }

  return {
    ...base,
    status: 'mismatch',
    validated: false,
    label: 'Representante no coincide',
    reason: !nameOk
      ? `Nombres distintos: carnet «${carnetName || '—'}» vs escritura «${deedName || '—'}».`
      : `RUT distinto: carnet ${carnetRut || '—'} vs escritura ${deedRut || '—'}.`,
    confidence: 0.7,
    reviewedAt
  };
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
  const wantsIdentity = ['idFront', 'rep_id_front', 'incorporation_deed'].includes(String(docKey || ''));
  const wantsErut = String(docKey || '') === 'company_rut';

  const system = wantsErut
    ? `Eres el revisor de e-RUT / certificado RUT electrónico del SII (Chile) para Fandez.
Debes detectar falsificaciones y revisar el código QR o de barras.
Responde SOLO JSON válido:
{"authentic":true|false,"verdict":"verified"|"suspicious"|"fake"|"unreadable","confidence":0-1,"reason":"texto corto en español","extractedRut":"RUT empresa o vacío","extractedLegalName":"razón social o vacío","hasQrOrBarcode":true|false,"qrLooksAuthentic":true|false|null}

Criterios e-RUT auténtico:
- Parece documento oficial SII (membrete, tipografía, layout de certificado RUT electrónico).
- Hay un código QR y/o código de barras visible, nítido, no cortado, no pixelado extremo de captura falsa.
- No es selfie, captura de WhatsApp, PDF inventado, plantilla editada, ni otro documento (carnet, boleta, etc.).
- qrLooksAuthentic=false si el QR/barras se ve pegado, borroso a propósito, incompleto, o el documento parece montaje.
- Extrae RUT de la empresa y razón social si se leen.
- fake: claramente falso o no es e-RUT. suspicious: dudoso. verified: parece e-RUT real con QR/barras creíble.`
    : `Eres el revisor de antecedentes de Fandez (Chile).
Debes decidir si el archivo parece un documento REAL y del TIPO esperado, o un falso / irrelevante.
Responde SOLO JSON válido:
{"authentic":true|false,"verdict":"verified"|"suspicious"|"fake"|"unreadable","confidence":0-1,"reason":"texto corto en español"${wantsIdentity ? ',"extractedName":"nombre visible o vacío","extractedRut":"RUT o vacío"' : ''}}

Criterios:
- verified: se ve un documento chileno auténtico del tipo pedido, legible, sin recortes graves.
- suspicious: borroso, recortado, tipo dudoso, posible edición, o no se puede afirmar autenticidad.
- fake: claramente otro documento, selfie cuando se pide carnet, captura de WhatsApp, montaje, plantilla vacía o texto inventado.
- unreadable: no se lee nada útil.
${wantsIdentity ? '- Si es carnet o escritura, extrae nombre y RUT del titular/representante legal.' : ''}
Nunca apruebes un documento solo porque hay una foto: tiene que coincidir con el tipo esperado.
Si es PDF y no hay imagen, usa unreadable o suspicious, no verified.`;

  const userText = [
    `Tipo esperado: ${expected}`,
    `Clave interna: ${docKey || 'n/d'}`,
    isPdf ? 'El archivo es PDF.' : 'El archivo es una imagen.',
    wantsErut ? 'Prioriza: autenticidad SII + presencia y calidad del QR/código de barras.' : ''
  ].filter(Boolean).join('\n');

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
      maxTokens: wantsErut || wantsIdentity ? 360 : 280,
      agent: 'compliance',
      operation: wantsErut ? 'erut_review' : 'document_review',
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
    // e-RUT sin QR/barras creíble → no verified automático
    if (wantsErut && mapped.status === 'verified') {
      if (parsed.hasQrOrBarcode === false || parsed.qrLooksAuthentic === false) {
        mapped.status = 'suspicious';
        mapped.authentic = null;
      }
    }
    return {
      status: mapped.status,
      authentic: mapped.authentic,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: String(parsed.reason || '').slice(0, 320) || 'Revisión automática lista.',
      extractedName: String(parsed.extractedName || parsed.extractedLegalName || '').slice(0, 160),
      extractedRut: String(parsed.extractedRut || '').slice(0, 20),
      extractedLegalName: String(parsed.extractedLegalName || '').slice(0, 160),
      hasQrOrBarcode: typeof parsed.hasQrOrBarcode === 'boolean' ? parsed.hasQrOrBarcode : null,
      qrLooksAuthentic: typeof parsed.qrLooksAuthentic === 'boolean' ? parsed.qrLooksAuthentic : null,
      reviewedAt
    };
  } catch (err) {
    const msg = String(err.message || '');
    const safe = /api key|sk-|incorrect api|401|unauthorized/i.test(msg)
      ? 'Revisión automática no disponible. El equipo debe confirmar a mano.'
      : `No se pudo revisar con IA: ${msg.slice(0, 120)}`;
    return {
      status: 'pending_manual',
      authentic: null,
      confidence: null,
      reason: safe,
      reviewedAt
    };
  }
}

/**
 * Valida e-RUT: autenticidad + QR/barras + cruce con RUT/razón social declarados.
 */
async function validateCompanyErut({
  url,
  declaredRut = '',
  declaredLegalName = '',
  aiHints = {}
} = {}) {
  const reviewedAt = new Date().toISOString();
  const base = emptyErutValidation();
  base.declaredRut = String(declaredRut || '').trim();
  base.declaredLegalName = String(declaredLegalName || '').trim();
  base.reviewedAt = reviewedAt;

  if (!url || url === 'demo') {
    return {
      ...base,
      status: 'insufficient',
      label: 'Falta e-RUT',
      reason: 'Sube el e-RUT / certificado RUT de la empresa (SII).'
    };
  }

  let review = {
    status: aiHints.status || null,
    extractedRut: aiHints.extractedRut || '',
    extractedLegalName: aiHints.extractedLegalName || aiHints.extractedName || '',
    hasQrOrBarcode: aiHints.hasQrOrBarcode,
    qrLooksAuthentic: aiHints.qrLooksAuthentic,
    confidence: aiHints.confidence,
    reason: aiHints.reason || ''
  };

  const needsFresh = !review.status
    || review.status === 'pending'
    || (review.hasQrOrBarcode == null && openai.isConfigured());

  if (needsFresh) {
    review = {
      ...review,
      ...(await reviewIdentityDocument({ url, docKey: 'company_rut' }))
    };
  }

  base.extractedRut = review.extractedRut || '';
  base.extractedLegalName = review.extractedLegalName || review.extractedName || '';
  base.hasQrOrBarcode = review.hasQrOrBarcode;
  base.qrLooksAuthentic = review.qrLooksAuthentic;
  base.confidence = review.confidence;
  base.reason = review.reason || '';

  if (review.status === 'fake') {
    return {
      ...base,
      status: 'fake',
      validated: false,
      label: 'e-RUT falso o inválido',
      reason: review.reason || 'El documento no parece un e-RUT auténtico del SII.',
      dataMatches: false
    };
  }

  if (review.hasQrOrBarcode === false) {
    return {
      ...base,
      status: 'suspicious',
      validated: false,
      label: 'e-RUT sin QR/barras',
      reason: 'No se ve código QR ni de barras. El e-RUT SII debe traerlo; pide una foto más clara o el PDF original.',
      dataMatches: null
    };
  }

  if (review.qrLooksAuthentic === false) {
    return {
      ...base,
      status: 'suspicious',
      validated: false,
      label: 'QR/barras dudoso',
      reason: review.reason || 'El código QR o de barras no se ve auténtico (posible montaje o captura falsa).',
      dataMatches: null
    };
  }

  const rutDoc = normalizeRut(base.extractedRut);
  const rutDeclared = normalizeRut(base.declaredRut);
  const rutOk = !rutDoc || !rutDeclared || rutDoc === rutDeclared;
  const nameOk = !base.extractedLegalName || !base.declaredLegalName
    || namesLikelyMatch(base.extractedLegalName, base.declaredLegalName);
  const dataMatches = rutOk && nameOk;
  base.dataMatches = dataMatches;

  if (!dataMatches) {
    return {
      ...base,
      status: 'mismatch',
      validated: false,
      label: 'e-RUT no coincide',
      reason: !rutOk
        ? `RUT del e-RUT (${base.extractedRut || '—'}) ≠ RUT declarado (${base.declaredRut || '—'}).`
        : `Razón social del e-RUT («${base.extractedLegalName}») no coincide con «${base.declaredLegalName}».`
    };
  }

  if (review.status === 'verified' && (review.qrLooksAuthentic === true || review.hasQrOrBarcode === true)) {
    return {
      ...base,
      status: 'validated',
      validated: true,
      label: 'e-RUT validado',
      reason: review.reason || 'e-RUT coherente con la empresa y con QR/código de barras creíble.',
      confidence: review.confidence != null ? review.confidence : 0.85
    };
  }

  if (review.status === 'pending_manual' || review.status === 'unreadable' || !openai.isConfigured()) {
    return {
      ...base,
      status: 'pending',
      validated: false,
      label: 'e-RUT pendiente',
      reason: review.reason || 'Revisión automática incompleta; el equipo debe confirmar el e-RUT.'
    };
  }

  return {
    ...base,
    status: 'suspicious',
    validated: false,
    label: 'e-RUT en duda',
    reason: review.reason || 'El e-RUT requiere revisión humana (calidad o autenticidad dudosa).'
  };
}

module.exports = {
  reviewIdentityDocument,
  validateLegalRepresentative,
  validateCompanyErut,
  extractFieldsFromDocument,
  emptyAiReview,
  emptyHumanReview,
  emptyDocumentReview,
  emptyRepresentativeMatch,
  emptyErutValidation,
  expectationFor,
  resolvePublicFilePath,
  namesLikelyMatch,
  normalizeRut
};

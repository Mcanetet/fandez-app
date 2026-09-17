const fs = require('fs');
const path = require('path');
const openai = require('../aland/openai');
const { getAutonomyThresholds, notifyFounderAsk } = require('../founderGates');

const PUBLIC_ROOT = path.join(__dirname, '../../public');

function resolveReceiptPath(receiptUrl) {
  if (!receiptUrl) return null;
  const rel = String(receiptUrl).replace(/^\/+/, '');
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

function applyFounderGate(result, amount, pricing) {
  const thresholds = getAutonomyThresholds(pricing);
  const amt = Math.max(0, parseInt(amount, 10) || 0);
  const conf = typeof result.confidence === 'number' ? result.confidence : 0;
  const reviewedAt = result.reviewedAt || new Date().toISOString();

  if (result.status === 'rejected' || result.approved === false) {
    return { ...result, reviewedAt };
  }

  const overFounderMin = amt >= thresholds.materialsFounderReviewMinClp;
  const overAutoMax = amt > thresholds.materialsAutoApproveMaxClp;
  const lowConfidence = conf < thresholds.materialsAutoApproveMinConfidence;
  const unclear = result.status === 'pending_manual' || result.approved == null;

  if (unclear && !(overFounderMin || overAutoMax)) {
    return { ...result, status: 'pending_manual', reviewedAt };
  }

  if (overFounderMin || overAutoMax || lowConfidence || unclear) {
    const gated = {
      ...result,
      status: 'pending_founder',
      approved: null,
      reason: [
        result.reason || (unclear ? 'Pendiente de verificación' : 'IA sugirió aprobar'),
        overFounderMin || overAutoMax
          ? `Monto ${amt.toLocaleString('es-CL')} CLP requiere OK del founder (≥ ${thresholds.materialsFounderReviewMinClp.toLocaleString('es-CL')}).`
          : unclear
            ? 'Sin veredicto claro de IA; revisión founder.'
            : `Confianza IA ${(conf * 100).toFixed(0)}% bajo el mínimo; revisión founder.`
      ].join(' '),
      reviewedAt,
      founderGate: true
    };
    notifyFounderAsk({
      agent: 'Clara / Materiales',
      whatHappened: `Boleta pendiente de OK · ${amt.toLocaleString('es-CL')} CLP · ${result.reason || 'revisión IA'}`,
      recommendation: 'Revisar boleta en el pedido (admin → solicitud / materiales)',
      impact: 'Sin tu OK no se cobra al cliente ni se liquida al socio este ítem.',
      needFromYou: 'Aprobar boleta · Rechazar · Pedir nueva foto'
    }).catch(() => {});
    return gated;
  }

  return {
    ...result,
    status: 'approved',
    approved: true,
    reviewedAt
  };
}

async function reviewMaterialReceipt({
  description,
  amount,
  receiptUrl,
  serviceName,
  activityName,
  pricing = null
} = {}) {
  const reviewedAt = new Date().toISOString();
  const filePath = resolveReceiptPath(receiptUrl);

  if (!receiptUrl) {
    return {
      status: 'rejected',
      approved: false,
      confidence: 1,
      reason: 'Debes subir la boleta o factura del material.',
      reviewedAt
    };
  }

  if (!openai.isConfigured()) {
    return applyFounderGate({
      status: 'pending_manual',
      approved: null,
      confidence: null,
      reason: 'IA no configurada: queda pendiente de revisión.',
      reviewedAt
    }, amount, pricing);
  }

  const dataUrl = filePath ? toDataUrl(filePath) : null;
  const isPdf = filePath && path.extname(filePath).toLowerCase() === '.pdf';

  const system = `Eres el revisor de boletas de materiales de Fandez (Chile).
Debes decidir si la boleta/factura es válida para reembolsar materiales al socio.
Responde SOLO JSON válido:
{"approved":true|false,"confidence":0-1,"reason":"texto corto en español"}
Criterios de aprobación:
- La imagen es legible (boleta/factura, no selfie ni captura irrelevante).
- El monto visible es coherente con el monto declarado (±15% o redondeo CLP).
- El ítem o comercio es plausible para el trabajo indicado.
- Rechaza si la foto está cortada, borrosa, sin monto, o no corresponde a una boleta.
IMPORTANTE: Tu veredicto es una sugerencia; montos altos pasan a revisión del founder.`;

  const userText = [
    `Servicio: ${serviceName || 'N/D'}`,
    `Actividad: ${activityName || 'N/D'}`,
    `Material declarado: ${description || 'N/D'}`,
    `Monto declarado (CLP): ${amount}`,
    isPdf ? 'El archivo es PDF (no hay imagen); evalúa solo coherencia textual y marca pending_manual si no puedes verificar.' : ''
  ].filter(Boolean).join('\n');

  const userContent = dataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    : userText;

  try {
    const { content } = await openai.chatCompletion({
      model: process.env.MATERIALS_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 250,
      agent: 'materials',
      operation: 'receipt_review',
      meta: { description, amount, receiptUrl },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    });

    const parsed = parseReviewJson(content);
    if (!parsed || typeof parsed.approved !== 'boolean') {
      return applyFounderGate({
        status: 'pending_manual',
        approved: null,
        confidence: null,
        reason: 'La IA no devolvió un veredicto claro; revisión manual.',
        reviewedAt
      }, amount, pricing);
    }

    if (isPdf && !dataUrl) {
      return applyFounderGate({
        status: 'pending_manual',
        approved: null,
        confidence: parsed.confidence ?? null,
        reason: parsed.reason || 'PDF pendiente de revisión.',
        reviewedAt
      }, amount, pricing);
    }

    const raw = {
      status: parsed.approved ? 'approved' : 'rejected',
      approved: parsed.approved,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: String(parsed.reason || (parsed.approved ? 'Boleta aprobada' : 'Boleta rechazada')).slice(0, 280),
      reviewedAt
    };
    return applyFounderGate(raw, amount, pricing);
  } catch (err) {
    return applyFounderGate({
      status: 'pending_manual',
      approved: null,
      confidence: null,
      reason: `Error al revisar con IA: ${err.message || 'desconocido'}`,
      reviewedAt
    }, amount, pricing);
  }
}

module.exports = {
  reviewMaterialReceipt,
  resolveReceiptPath,
  applyFounderGate
};

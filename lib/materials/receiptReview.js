const fs = require('fs');
const path = require('path');
const openai = require('../aland/openai');

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

/**
 * Revisa boleta/factura de materiales con visión (si hay imagen) o texto.
 * @returns {{ status: string, approved: boolean|null, confidence: number|null, reason: string, reviewedAt: string }}
 */
async function reviewMaterialReceipt({
  description,
  amount,
  receiptUrl,
  serviceName,
  activityName
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
    return {
      status: 'pending_manual',
      approved: null,
      confidence: null,
      reason: 'IA no configurada: queda pendiente de revisión manual.',
      reviewedAt
    };
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
- Rechaza si la foto está cortada, borrosa, sin monto, o no corresponde a una boleta.`;

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
      return {
        status: 'pending_manual',
        approved: null,
        confidence: null,
        reason: 'La IA no devolvió un veredicto claro; revisión manual.',
        reviewedAt
      };
    }

    if (isPdf && !dataUrl) {
      return {
        status: 'pending_manual',
        approved: null,
        confidence: parsed.confidence ?? null,
        reason: parsed.reason || 'PDF pendiente de revisión manual.',
        reviewedAt
      };
    }

    return {
      status: parsed.approved ? 'approved' : 'rejected',
      approved: parsed.approved,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: String(parsed.reason || (parsed.approved ? 'Boleta aprobada' : 'Boleta rechazada')).slice(0, 280),
      reviewedAt
    };
  } catch (err) {
    return {
      status: 'pending_manual',
      approved: null,
      confidence: null,
      reason: `Error al revisar con IA: ${err.message || 'desconocido'}`,
      reviewedAt
    };
  }
}

module.exports = {
  reviewMaterialReceipt,
  resolveReceiptPath
};

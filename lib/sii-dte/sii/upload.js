/**
 * Empaqueta EnvioDTE en ZIP y lo envía a UploadDTE (multipart).
 */
'use strict';

const JSZip = require('jszip');

/** Códigos STATUS del UploadDTE (manual SII). */
const UPLOAD_STATUS = {
  0: 'Upload OK',
  1: 'El Sender no tiene permiso para enviar',
  2: 'Error en tamaño del archivo (muy grande o muy chico)',
  3: 'Archivo cortado (tamaño distinto al declarado)',
  5: 'No está autenticado (token inválido o Cookie TOKEN)',
  6: 'Empresa no autorizada a enviar archivos',
  7: 'Esquema inválido',
  8: 'Error en firma del documento',
  9: 'Sistema bloqueado',
  99: 'Error interno SII'
};

async function buildEnvioZip(envioXml, fileName = 'envio.xml') {
  const zip = new JSZip();
  // SII históricamente espera ISO-8859-1; enviamos buffer latin1 cuando sea posible.
  zip.file(fileName, Buffer.from(envioXml, 'latin1'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function extractTagLoose(raw, tag) {
  const t = String(tag || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = String(raw || '').match(
    new RegExp(`<(?:[\\w.-]+:)?${t}\\b[^>]*>\\s*([^<]*?)\\s*</(?:[\\w.-]+:)?${t}>`, 'i')
  );
  if (m) return String(m[1]).trim();
  // HTML a veces: TRACKID</td><td>12345 or TRACKID: 12345
  const m2 = String(raw || '').match(
    new RegExp(`${t}\\s*[:\\-=]?\\s*</?(?:td|th|b|strong|span)[^>]*>\\s*([0-9A-Za-z_-]+)`, 'i')
  );
  if (m2) return String(m2[1]).trim();
  const m3 = String(raw || '').match(new RegExp(`${t}['"\\s>:=]+([0-9]{1,12})`, 'i'));
  return m3 ? String(m3[1]).trim() : null;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpreta respuesta UploadDTE (XML RECEPCIONDTE o HTML de resultado).
 */
function parseUploadResponse(raw) {
  const text = String(raw || '');
  const plainEarly = stripHtml(text);
  const statusRaw =
    extractTagLoose(text, 'STATUS') ||
    extractTagLoose(text, 'Status') ||
    (plainEarly.match(/\bSTATUS\b\s*[:\-]?\s*(\d{1,2})\b/i) || [])[1] ||
    (plainEarly.match(/\bEstado\b\s*[:\-]?\s*(\d{1,2})\b/i) || [])[1] ||
    null;
  const trackId =
    extractTagLoose(text, 'TRACKID') ||
    extractTagLoose(text, 'TrackId') ||
    (text.match(/TRACK\s*ID\s*[:\-]?\s*([0-9]{3,})/i) || [])[1] ||
    (plainEarly.match(/\bTRACK\s*ID\b\s*[:\-]?\s*([0-9]{3,})/i) || [])[1] ||
    null;
  const status = statusRaw != null && statusRaw !== '' ? String(statusRaw).trim() : null;
  const statusNum = status != null && /^\d+$/.test(status) ? parseInt(status, 10) : null;
  const statusLabel =
    statusNum != null && UPLOAD_STATUS[statusNum] != null
      ? UPLOAD_STATUS[statusNum]
      : (status ? `código ${status}` : null);
  const plain = stripHtml(text);
  return {
    status,
    statusNum,
    statusLabel,
    trackId: trackId ? String(trackId).trim() : null,
    plain: plain.slice(0, 280),
    raw: text
  };
}

/**
 * @returns {{ trackId: string, raw: string, status: string }}
 */
async function uploadDte({
  endpoints,
  token,
  emitterRut,
  companyRut,
  zipBuffer,
  fileName = 'envio.zip'
}) {
  const boundary = `----FandezDte${Date.now()}`;
  const rutEnvia = String(emitterRut || '').replace(/\./g, '').toUpperCase();
  const rutCompany = String(companyRut || emitterRut || '').replace(/\./g, '').toUpperCase();

  const parts = [];
  function pushField(name, value) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }
  pushField('rutSender', rutEnvia.split('-')[0]);
  pushField('dvSender', rutEnvia.split('-')[1] || '');
  pushField('rutCompany', rutCompany.split('-')[0]);
  pushField('dvCompany', rutCompany.split('-')[1] || '');

  const preamble = Buffer.from(parts.join('') +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="archivo"; filename="${fileName}"\r\n` +
    `Content-Type: application/zip\r\n\r\n`, 'latin1');
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1');
  const body = Buffer.concat([preamble, zipBuffer, closing]);

  const res = await fetch(endpoints.upload, {
    method: 'POST',
    headers: {
      // User-Agent histórico que el SII acepta en UploadDTE programa-a-programa
      'User-Agent': 'Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 7.0)',
      Accept: 'image/gif, image/x-xbitmap, image/jpeg, image/pjpeg, application/vnd.ms-powerpoint, application/xml, application/xhtml+xml, */*',
      'Accept-Language': 'es-cl',
      Cookie: `TOKEN=${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body,
    redirect: 'follow'
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`SII UploadDTE HTTP ${res.status}: ${stripHtml(raw).slice(0, 300)}`);
  }

  const parsed = parseUploadResponse(raw);
  if (parsed.trackId && (parsed.statusNum == null || parsed.statusNum === 0)) {
    return { trackId: parsed.trackId, raw, status: parsed.status || '0' };
  }
  if (parsed.statusNum != null && parsed.statusNum !== 0) {
    throw new Error(
      `SII UploadDTE status ${parsed.statusNum}: ${parsed.statusLabel}` +
      (parsed.plain ? ` · ${parsed.plain.slice(0, 160)}` : '')
    );
  }
  if (parsed.trackId) {
    return { trackId: parsed.trackId, raw, status: parsed.status || '0' };
  }
  throw new Error(
    `SII UploadDTE sin TRACKID` +
    (parsed.statusLabel ? ` (${parsed.statusLabel})` : '') +
    (parsed.plain ? `: ${parsed.plain.slice(0, 220)}` : `. Respuesta: ${raw.slice(0, 300)}`)
  );
}

module.exports = {
  buildEnvioZip,
  uploadDte,
  parseUploadResponse,
  UPLOAD_STATUS
};

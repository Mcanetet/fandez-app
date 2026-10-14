/**
 * Empaqueta EnvioDTE en ZIP y lo envía a UploadDTE (multipart).
 */
'use strict';

const JSZip = require('jszip');

async function buildEnvioZip(envioXml, fileName = 'envio.xml') {
  const zip = new JSZip();
  // SII históricamente espera ISO-8859-1; enviamos buffer latin1 cuando sea posible.
  zip.file(fileName, Buffer.from(envioXml, 'latin1'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @returns {{ trackId: string, raw: string }}
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
  const rutEnvia = String(emitterRut || '').replace(/\./g, '');
  const rutCompany = String(companyRut || emitterRut || '').replace(/\./g, '');

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
    `Content-Type: application/zip\r\n\r\n`, 'utf8');
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([preamble, zipBuffer, closing]);

  const res = await fetch(endpoints.upload, {
    method: 'POST',
    headers: {
      Cookie: `TOKEN=${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`SII UploadDTE HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }
  const track =
    (raw.match(/<TRACKID>([^<]+)<\/TRACKID>/i) || [])[1] ||
    (raw.match(/TRACKID['">:=\s]+([0-9]+)/i) || [])[1];
  if (!track) {
    throw new Error(`SII UploadDTE sin TRACKID. Respuesta: ${raw.slice(0, 400)}`);
  }
  return { trackId: String(track).trim(), raw };
}

module.exports = {
  buildEnvioZip,
  uploadDte
};

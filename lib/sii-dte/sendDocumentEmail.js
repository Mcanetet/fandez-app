/**
 * Reenvío de DTE por correo (patrón facturadores Chile: link + XML).
 */
'use strict';

const company = require('../../config/company');
const mailer = require('../mailer');
const { publicPdfUrl, publicXmlUrl } = require('./storage');
const { docTypeLabel, supportsCedible, normalizeExemplar } = require('./pdf/render');
const { resolveArtifact } = require('./artifacts');
const fs = require('fs');

function formatClp(n) {
  return Math.round(Number(n) || 0).toLocaleString('es-CL');
}

function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || '').trim());
}

/**
 * @param {object} doc
 * @param {{ to: string, exemplar?: string, includeXml?: boolean, sentBy?: string }} opts
 */
async function sendDocumentEmail(doc, opts = {}) {
  const to = String(opts.to || '').trim().toLowerCase();
  if (!isValidEmail(to)) {
    return { error: 'Indica un correo válido.' };
  }

  const exemplar = normalizeExemplar(opts.exemplar, doc.dteType);
  const kind = docTypeLabel(doc.dteType).toLowerCase();
  const base = company.appUrl.replace(/\/$/, '');
  const tributarioUrl = `${base}${publicPdfUrl(doc.id, 'tributario')}`;
  const cedibleUrl = supportsCedible(doc.dteType)
    ? `${base}${publicPdfUrl(doc.id, 'cedible')}`
    : null;
  const xmlUrl = `${base}${publicXmlUrl(doc.id)}`;
  const viewUrl = exemplar === 'cedible' && cedibleUrl ? cedibleUrl : tributarioUrl;

  const subject = `${docTypeLabel(doc.dteType)} N° ${doc.folio} — ${company.name || 'Fandez'}`;
  const text = [
    `Hola,`,
    '',
    `Te enviamos la ${kind} N° ${doc.folio} por ${formatClp(doc.total)}.`,
    '',
    `Ver / imprimir (tributario): ${tributarioUrl}`,
    cedibleUrl ? `Copia cedible: ${cedibleUrl}` : null,
    `Descargar XML: ${xmlUrl}`,
    '',
    'En el visor puedes usar «Imprimir / Guardar PDF».',
    '',
    company.name || 'Fandez'
  ].filter(Boolean).join('\n');

  const html = `
    <p>Hola,</p>
    <p>Te enviamos la <strong>${esc(docTypeLabel(doc.dteType))} N° ${esc(doc.folio)}</strong>
    por <strong>$${formatClp(doc.total)}</strong>.</p>
    <p>
      <a href="${esc(viewUrl)}">Ver documento</a>
      · <a href="${esc(tributarioUrl)}">Ejemplar tributario</a>
      ${cedibleUrl ? `· <a href="${esc(cedibleUrl)}">Copia cedible</a>` : ''}
      · <a href="${esc(xmlUrl)}">Descargar XML</a>
    </p>
    <p style="color:#64748b;font-size:13px">En el visor usa <em>Imprimir / Guardar PDF</em> (como en la mayoría de facturadores electrónicos en Chile).</p>
  `;

  const attachments = [];
  if (opts.includeXml !== false) {
    const art = resolveArtifact(doc, 'xml');
    let xmlBuf = null;
    if (art.source === 'file' && art.path && fs.existsSync(art.path)) {
      xmlBuf = fs.readFileSync(art.path);
    } else if (art.source === 'db' && art.content) {
      xmlBuf = Buffer.from(art.content, 'latin1');
    }
    if (xmlBuf) {
      attachments.push({
        filename: `F${doc.folio || 0}T${doc.dteType || 33}.xml`,
        content: xmlBuf,
        contentType: 'application/xml'
      });
    }
  }

  const result = await mailer.sendMail({
    to,
    subject,
    text,
    html,
    replyTo: company.dteEmail || company.supportEmail,
    attachments: attachments.length ? attachments : undefined
  });

  if (result.error) return { error: result.error };
  return {
    success: true,
    to,
    demo: Boolean(result.demo),
    messageId: result.messageId || null,
    sentBy: opts.sentBy || null
  };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  sendDocumentEmail,
  isValidEmail
};

/**
 * TED (Timbre Electrónico Digital).
 * Firma RSA-SHA1 del nodo <DD> con la llave privada del CAF.
 *
 * Tags DD (instructivo SII):
 *  RE, TD, F, FE, RR, RSR (razón social receptor), MNT, IT1 (ítem 1), CAF, TSTED
 */
'use strict';

const forge = require('node-forge');
const { getPrivateKey } = require('../folio/caf');
const { flattenXml } = require('./xmlFlatten');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Solo caracteres representables en ISO-8859-1 (exigencia TED SII). */
function toLatin1Text(value, maxLen) {
  const cleaned = String(value ?? '')
    .normalize('NFC')
    .replace(/[^\u0000-\u00FF]/g, '')
    .trim();
  return cleaned.slice(0, maxLen);
}

function formatTsted(issuedAt) {
  // Misma zona Chile que TmstFirma del Documento (no UTC crudo del ISO).
  try {
    const d = issuedAt ? new Date(issuedAt) : new Date();
    if (Number.isNaN(d.getTime())) throw new Error('bad date');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  } catch (_) {
    const iso = String(issuedAt || new Date().toISOString());
    return iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);
  }
}

/**
 * @param {object} input
 * @param {object} caf parseado
 */
function buildTed({
  emitterRut,
  dteType = 33,
  folio,
  issuedAt,
  receptorRut,
  receptorName,
  total,
  itemName,
  caf
}) {
  const tst = formatTsted(issuedAt);
  const rsr = toLatin1Text(receptorName || 'Receptor', 40);
  const it1 = toLatin1Text(itemName || 'Servicio', 40);
  const cafXml = String(caf?.cafFragment || '').trim();
  if (!cafXml.includes('<CAF')) {
    throw new Error('CAF incompleto: falta fragmento <CAF> para el TED');
  }

  // CAF puede traer \n entre tags; el instructivo exige aplanar antes del FRMT.
  const dd = flattenXml(
    `<DD>` +
    `<RE>${xmlEscape(emitterRut)}</RE>` +
    `<TD>${dteType}</TD>` +
    `<F>${folio}</F>` +
    `<FE>${tst.slice(0, 10)}</FE>` +
    `<RR>${xmlEscape(receptorRut)}</RR>` +
    `<RSR>${xmlEscape(rsr)}</RSR>` +
    `<MNT>${Math.round(Number(total) || 0)}</MNT>` +
    `<IT1>${xmlEscape(it1)}</IT1>` +
    `${cafXml}` +
    `<TSTED>${tst}</TSTED>` +
    `</DD>`
  );

  const privateKey = getPrivateKey(caf);
  const md = forge.md.sha1.create();
  // FRMT = SHA1withRSA sobre DD aplanado en ISO-8859-1 (no UTF-8).
  md.update(Buffer.from(dd, 'latin1').toString('binary'), 'raw');
  const signature = forge.util.encode64(privateKey.sign(md));

  const ted =
    `<TED version="1.0">` +
    `${dd}` +
    `<FRMT algoritmo="SHA1withRSA">${signature}</FRMT>` +
    `</TED>`;

  return { ted, dd, signature };
}

module.exports = { buildTed, toLatin1Text, formatTsted };

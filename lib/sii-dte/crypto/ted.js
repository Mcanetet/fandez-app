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
  const iso = String(issuedAt || new Date().toISOString());
  const bare = iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
  // AAAA-MM-DDTHH:MI:SS
  return bare.slice(0, 19);
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

  const dd =
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
    `</DD>`;

  const privateKey = getPrivateKey(caf);
  const md = forge.md.sha1.create();
  md.update(dd, 'utf8');
  const signature = forge.util.encode64(privateKey.sign(md));

  const ted =
    `<TED version="1.0">` +
    `${dd}` +
    `<FRMT algoritmo="SHA1withRSA">${signature}</FRMT>` +
    `</TED>`;

  return { ted, dd, signature };
}

module.exports = { buildTed, toLatin1Text, formatTsted };

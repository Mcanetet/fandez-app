/**
 * TED (Timbre Electrónico Digital).
 * Firma RSA-SHA1 del nodo <DD> con la llave privada del CAF.
 * El contenido firmado es el XML canónico del DD (sin espacios superfluos).
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
  total,
  itemName,
  caf
}) {
  const tst = issuedAt.replace(/\.\d{3}Z$/, '').replace('Z', '');
  const dd =
    `<DD>` +
    `<RE>${xmlEscape(emitterRut)}</RE>` +
    `<TD>${dteType}</TD>` +
    `<F>${folio}</F>` +
    `<FE>${tst.slice(0, 10)}</FE>` +
    `<RR>${xmlEscape(receptorRut)}</RR>` +
    `<RSR>${xmlEscape(String(itemName || 'Servicio').slice(0, 40))}</RSR>` +
    `<MNT>${Math.round(total)}</MNT>` +
    `<IT1>${xmlEscape(String(itemName || 'Servicio').slice(0, 40))}</IT1>` +
    `${caf.cafFragment || ''}` +
    `<TSTED>${tst.slice(0, 19)}</TSTED>` +
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

module.exports = { buildTed };

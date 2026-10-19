/**
 * Helpers compartidos para nodos <Detalle> del DTE.
 */
'use strict';

const { lineQty, lineUnitNeto, lineMontoNeto } = require('../amounts');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object[]} lines
 * @param {string|null} observation — va en DscItem de la primera línea
 */
function buildDetalleXml(lines = [], observation = null) {
  const obs = String(observation || '').trim().slice(0, 1000);
  return (lines.length ? lines : []).map((line, idx) => {
    const qty = lineQty(line);
    const prc = lineUnitNeto(line);
    const monto = lineMontoNeto(line);
    const dsc = String(line.dscItem || (idx === 0 ? obs : '') || '').trim().slice(0, 1000);
    return (
      `<Detalle>` +
      `<NroLinDet>${idx + 1}</NroLinDet>` +
      `<NmbItem>${esc(line.name).slice(0, 80)}</NmbItem>` +
      (dsc ? `<DscItem>${esc(dsc)}</DscItem>` : '') +
      `<QtyItem>${qty}</QtyItem>` +
      `<PrcItem>${prc}</PrcItem>` +
      `<MontoItem>${monto}</MontoItem>` +
      `</Detalle>`
    );
  }).join('');
}

module.exports = {
  esc,
  buildDetalleXml
};

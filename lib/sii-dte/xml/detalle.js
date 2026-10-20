/**
 * Helpers compartidos para nodos <Detalle> del DTE.
 */
'use strict';

const { lineQty, lineUnitNeto, lineMontoNeto, lineDiscountMonto } = require('../amounts');

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
    const discount = lineDiscountMonto(line);
    const monto = lineMontoNeto(line);
    const dsc = String(line.dscItem || (idx === 0 ? obs : '') || '').trim().slice(0, 1000);
    const pct = discount > 0 && prc * qty > 0
      ? (Math.round((discount / (prc * qty)) * 10000) / 100).toFixed(2)
      : null;
    const qtyXml = Number.isInteger(qty) ? String(qty) : String(qty);
    return (
      `<Detalle>` +
      `<NroLinDet>${idx + 1}</NroLinDet>` +
      `<NmbItem>${esc(line.name).slice(0, 80)}</NmbItem>` +
      (dsc ? `<DscItem>${esc(dsc)}</DscItem>` : '') +
      `<QtyItem>${qtyXml}</QtyItem>` +
      `<PrcItem>${prc}</PrcItem>` +
      (discount > 0 && pct ? `<DescuentoPct>${pct}</DescuentoPct>` : '') +
      (discount > 0 ? `<DescuentoMonto>${discount}</DescuentoMonto>` : '') +
      `<MontoItem>${monto}</MontoItem>` +
      `</Detalle>`
    );
  }).join('');
}

module.exports = {
  esc,
  buildDetalleXml
};

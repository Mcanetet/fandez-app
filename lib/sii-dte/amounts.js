/**
 * Cálculo tributario Chile para Factura Electrónica (DTE 33).
 *
 * En Fandez la comisión de plataforma (15%) y el costo de pasarela ya vienen
 * IVA incluido en `appTotal`. Para el DTE 33 hay que desglosar:
 *   Total = Neto + IVA (19%)
 *   Neto  = round(Total / 1.19)
 *   IVA   = Total − Neto
 */
'use strict';

const IVA_RATE = 0.19;

/**
 * @param {{ commissionClp: number, cardFeeClp: number }} input
 * Montos IVA incluido (CLP enteros).
 */
function splitIvaIncluded(totalIvaIncluded) {
  const total = Math.max(0, Math.round(Number(totalIvaIncluded) || 0));
  const neto = Math.round(total / (1 + IVA_RATE));
  const iva = total - neto;
  return { neto, iva, total, ivaRate: IVA_RATE };
}

function brutoFromNeto(neto) {
  return Math.round(Math.max(0, Math.round(Number(neto) || 0)) * (1 + IVA_RATE));
}

function normalizeQty(raw) {
  const q = Number(raw);
  if (!Number.isFinite(q) || q <= 0) return 1;
  return Math.round(q * 1000) / 1000;
}

/**
 * Normaliza una línea manual: descripción, cantidad, neto unitario, bruto línea.
 */
function normalizeManualLine(line = {}) {
  const name = String(line?.name || line?.description || '').trim().slice(0, 80);
  if (!name) return null;

  const qty = normalizeQty(line.qty ?? line.cantidad ?? 1);
  let unitNeto = Math.max(0, Math.round(Number(line.unitNeto ?? line.precioNeto ?? line.valorNeto) || 0));
  let bruto = Math.max(0, Math.round(Number(
    line.totalIvaIncluded != null ? line.totalIvaIncluded
      : (line.bruto != null ? line.bruto : (line.valorBruto != null ? line.valorBruto : line.total))
  ) || 0));
  let netoLine = Math.max(0, Math.round(Number(line.neto) || 0));

  if (unitNeto > 0) {
    netoLine = Math.round(unitNeto * qty);
    if (!bruto) bruto = brutoFromNeto(netoLine);
  } else if (bruto > 0) {
    netoLine = Math.round(bruto / (1 + IVA_RATE));
    unitNeto = Math.max(1, Math.round(netoLine / qty));
    netoLine = Math.round(unitNeto * qty);
    bruto = brutoFromNeto(netoLine);
  } else if (netoLine > 0) {
    unitNeto = Math.max(1, Math.round(netoLine / qty));
    netoLine = Math.round(unitNeto * qty);
    bruto = brutoFromNeto(netoLine);
  } else {
    return null;
  }

  if (netoLine < 1) return null;
  return {
    name,
    qty,
    unitNeto,
    neto: netoLine,
    iva: bruto - netoLine,
    totalIvaIncluded: bruto,
    ivaRate: IVA_RATE
  };
}

/**
 * Base imponible de la factura Fandez → socio.
 * @param {{ commissionClp?: number, cardFeeClp?: number, appTotal?: number }} input
 */
function calculateCommissionInvoiceAmounts(input = {}) {
  const commissionClp = Math.max(0, Math.round(Number(input.commissionClp) || 0));
  const cardFeeClp = Math.max(0, Math.round(Number(input.cardFeeClp) || 0));
  const appTotal = Math.max(
    0,
    Math.round(Number(input.appTotal) || (commissionClp + cardFeeClp))
  );
  const split = splitIvaIncluded(appTotal);
  return {
    commissionClp,
    cardFeeClp,
    ...split,
    /** Líneas sugeridas (valores IVA incluido; el XML DTE 33 usa precio neto unitario). */
    lines: [
      {
        name: 'Comisión intermediación Fandez (IVA incluido)',
        qty: 1,
        unitNeto: splitIvaIncluded(commissionClp).neto,
        totalIvaIncluded: commissionClp,
        ...splitIvaIncluded(commissionClp)
      },
      ...(cardFeeClp > 0
        ? [{
            name: 'Costo pasarela de pagos (IVA incluido)',
            qty: 1,
            unitNeto: splitIvaIncluded(cardFeeClp).neto,
            totalIvaIncluded: cardFeeClp,
            ...splitIvaIncluded(cardFeeClp)
          }]
        : [])
    ].filter((l) => l.totalIvaIncluded > 0)
  };
}

/**
 * Factura manual (admin): total IVA incluido + glosa, o líneas libres.
 * @param {{
 *   totalClp?: number,
 *   description?: string,
 *   commissionClp?: number,
 *   cardFeeClp?: number,
 *   lines?: Array<object>
 * }} input
 */
function calculateManualInvoiceAmounts(input = {}) {
  const customLines = Array.isArray(input.lines)
    ? input.lines.map(normalizeManualLine).filter(Boolean)
    : [];

  if (customLines.length) {
    const neto = customLines.reduce((acc, l) => acc + l.neto, 0);
    const total = customLines.reduce((acc, l) => acc + l.totalIvaIncluded, 0);
    const iva = Math.max(0, total - neto);
    return {
      commissionClp: 0,
      cardFeeClp: 0,
      neto,
      iva,
      total,
      ivaRate: IVA_RATE,
      lines: customLines
    };
  }

  const commissionClp = Math.max(0, Math.round(Number(input.commissionClp) || 0));
  const cardFeeClp = Math.max(0, Math.round(Number(input.cardFeeClp) || 0));
  if (commissionClp > 0 || cardFeeClp > 0) {
    return calculateCommissionInvoiceAmounts({ commissionClp, cardFeeClp });
  }

  const totalClp = Math.max(0, Math.round(Number(input.totalClp) || 0));
  const description = String(input.description || 'Servicios Fandez').trim().slice(0, 80)
    || 'Servicios Fandez';
  if (totalClp < 1) {
    return {
      commissionClp: 0,
      cardFeeClp: 0,
      neto: 0,
      iva: 0,
      total: 0,
      ivaRate: IVA_RATE,
      lines: []
    };
  }
  const split = splitIvaIncluded(totalClp);
  return {
    commissionClp: 0,
    cardFeeClp: 0,
    ...split,
    lines: [{
      name: description,
      qty: 1,
      unitNeto: split.neto,
      totalIvaIncluded: totalClp,
      ...split
    }]
  };
}

/** Helpers para XML Detalle */
function lineQty(line) {
  return normalizeQty(line?.qty ?? 1);
}

function lineUnitNeto(line) {
  if (line?.unitNeto != null && Number(line.unitNeto) > 0) {
    return Math.round(Number(line.unitNeto) || 0);
  }
  const qty = lineQty(line);
  const neto = Math.round(Number(line?.neto) || 0);
  if (qty > 0 && neto > 0) return Math.max(0, Math.round(neto / qty));
  return neto;
}

function lineMontoNeto(line) {
  return Math.round(lineUnitNeto(line) * lineQty(line));
}

module.exports = {
  IVA_RATE,
  splitIvaIncluded,
  brutoFromNeto,
  normalizeManualLine,
  calculateCommissionInvoiceAmounts,
  calculateManualInvoiceAmounts,
  lineQty,
  lineUnitNeto,
  lineMontoNeto
};

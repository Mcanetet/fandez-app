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
 * Normaliza una línea manual: descripción, cantidad, neto unitario,
 * descuento ($ neto), IVA y bruto línea.
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
  let discountMonto = Math.max(0, Math.round(Number(
    line.discountMonto ?? line.descuento ?? line.descuentoMonto
  ) || 0));
  const discountPct = Math.max(0, Math.min(100, Number(line.discountPct ?? line.descuentoPct) || 0));

  if (unitNeto > 0) {
    const subtotal = Math.round(unitNeto * qty);
    if (!discountMonto && discountPct > 0) {
      discountMonto = Math.round(subtotal * discountPct / 100);
    }
    discountMonto = Math.min(subtotal, discountMonto);
    netoLine = Math.max(0, subtotal - discountMonto);
    bruto = brutoFromNeto(netoLine);
  } else if (bruto > 0) {
    netoLine = Math.round(bruto / (1 + IVA_RATE));
    // Sin precio unitario: reparte neto+descuento en unitario
    const subtotal = netoLine + discountMonto;
    unitNeto = Math.max(1, Math.round(subtotal / qty));
    const rebuilt = Math.round(unitNeto * qty);
    discountMonto = Math.min(rebuilt, discountMonto);
    netoLine = Math.max(0, rebuilt - discountMonto);
    bruto = brutoFromNeto(netoLine);
  } else if (netoLine > 0) {
    const subtotal = netoLine + discountMonto;
    unitNeto = Math.max(1, Math.round(subtotal / qty));
    const rebuilt = Math.round(unitNeto * qty);
    discountMonto = Math.min(rebuilt, discountMonto);
    netoLine = Math.max(0, rebuilt - discountMonto);
    bruto = brutoFromNeto(netoLine);
  } else {
    return null;
  }

  if (netoLine < 1 && discountMonto < 1) return null;
  if (netoLine < 1) return null;

  const iva = bruto - netoLine;
  const subtotalNeto = Math.round(unitNeto * qty);
  return {
    name,
    qty,
    unitNeto,
    discountMonto,
    discountPct: subtotalNeto > 0 && discountMonto > 0
      ? Math.round((discountMonto / subtotalNeto) * 10000) / 100
      : 0,
    subtotalNeto,
    neto: netoLine,
    iva,
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
    const discountTotal = customLines.reduce((acc, l) => acc + (l.discountMonto || 0), 0);
    return {
      commissionClp: 0,
      cardFeeClp: 0,
      neto,
      iva,
      total,
      discountTotal,
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
  const disc = Math.max(0, Math.round(Number(line?.discountMonto) || 0));
  if (qty > 0 && (neto + disc) > 0) return Math.max(0, Math.round((neto + disc) / qty));
  if (qty > 0 && neto > 0) return Math.max(0, Math.round(neto / qty));
  return neto;
}

function lineDiscountMonto(line) {
  const qty = lineQty(line);
  const prc = lineUnitNeto(line);
  const subtotal = Math.round(prc * qty);
  let disc = Math.max(0, Math.round(Number(line?.discountMonto ?? line?.descuento) || 0));
  const pct = Number(line?.discountPct ?? line?.descuentoPct);
  if (!disc && pct > 0) disc = Math.round(subtotal * Math.min(100, pct) / 100);
  return Math.min(subtotal, disc);
}

function lineMontoNeto(line) {
  const qty = lineQty(line);
  const prc = lineUnitNeto(line);
  return Math.max(0, Math.round(prc * qty) - lineDiscountMonto(line));
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
  lineDiscountMonto,
  lineMontoNeto
};

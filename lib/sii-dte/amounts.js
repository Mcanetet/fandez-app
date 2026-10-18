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
        totalIvaIncluded: commissionClp,
        ...splitIvaIncluded(commissionClp)
      },
      ...(cardFeeClp > 0
        ? [{
            name: 'Costo pasarela de pagos (IVA incluido)',
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
 *   lines?: Array<{ name: string, totalIvaIncluded?: number, neto?: number }>
 * }} input
 */
function calculateManualInvoiceAmounts(input = {}) {
  const customLines = Array.isArray(input.lines)
    ? input.lines
      .map((line) => {
        const name = String(line?.name || '').trim().slice(0, 80);
        const totalIvaIncluded = Math.max(
          0,
          Math.round(Number(line?.totalIvaIncluded != null ? line.totalIvaIncluded : line?.total) || 0)
        );
        if (!name || totalIvaIncluded < 1) return null;
        return {
          name,
          totalIvaIncluded,
          ...splitIvaIncluded(totalIvaIncluded)
        };
      })
      .filter(Boolean)
    : [];

  if (customLines.length) {
    const total = customLines.reduce((acc, l) => acc + l.totalIvaIncluded, 0);
    const split = splitIvaIncluded(total);
    return {
      commissionClp: 0,
      cardFeeClp: 0,
      ...split,
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
      totalIvaIncluded: totalClp,
      ...split
    }]
  };
}

module.exports = {
  IVA_RATE,
  splitIvaIncluded,
  calculateCommissionInvoiceAmounts,
  calculateManualInvoiceAmounts
};

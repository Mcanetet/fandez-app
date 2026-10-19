/**
 * Emisión manual desde Admin: Factura 33, Liquidación-Factura 43,
 * Factura de Compra 46 o Nota de Crédito 61.
 */
'use strict';

const {
  generateCommissionInvoice,
  pickPartnerBilling,
  normalizeReceptor
} = require('./generateCommissionInvoice');
const { normalizeDteType, defaultLineName, dtePhase } = require('./dteTypes');

/**
 * @param {object} input
 * @param {33|43|46|61|string} [input.dteType]
 */
async function generateManualInvoice(input = {}) {
  const dteType = normalizeDteType(input.dteType, 33);
  const partner = input.partner || {};
  let receptor = input.receptor ? normalizeReceptor(input.receptor) : null;
  if (!receptor && partner && (partner.id || partner.rut || partner.providerContract)) {
    receptor = pickPartnerBilling(partner);
  }
  if (!receptor?.rut) {
    return {
      error: dteType === 46
        ? 'Indica el RUT y nombre del vendedor (receptor de la factura de compra).'
        : (dteType === 43
          ? 'Indica el RUT y razón social del mandante (socio) de la liquidación.'
          : 'Indica el receptor (RUT y razón social) o elige un socio.')
    };
  }
  if (!receptor.name || receptor.name === 'Receptor') {
    return {
      error: dteType === 46
        ? 'Indica el nombre o razón social del vendedor.'
        : (dteType === 43
          ? 'Indica la razón social del mandante.'
          : 'Indica la razón social del receptor.')
    };
  }

  // Giro por defecto en compra a particular
  if (dteType === 46 && (!receptor.giro || receptor.giro === 'Servicios')) {
    receptor.giro = String(input.receptor?.giro || 'Particular').slice(0, 40);
  }

  const totalClp = Math.max(0, Math.round(Number(input.totalClp) || 0));
  const commissionClp = Math.max(0, Math.round(Number(input.commissionClp) || 0));
  const cardFeeClp = Math.max(0, Math.round(Number(input.cardFeeClp) || 0));
  if (totalClp < 1 && commissionClp < 1 && cardFeeClp < 1) {
    return { error: 'Indica un monto total (IVA incluido) mayor a 0.' };
  }

  if (dteType === 61) {
    const refFolio = parseInt(input.reference?.folio ?? input.refFolio, 10) || 0;
    if (refFolio < 1) {
      return { error: 'Indica el folio del documento que anula o corrige la nota de crédito.' };
    }
  }

  const requestId = String(input.requestId || '').trim()
    || `manual-${Date.now().toString(36)}`;
  const description = input.description || defaultLineName(dteType);

  return generateCommissionInvoice({
    requestId,
    partner,
    providerId: input.providerId || partner.id || null,
    receptor,
    dteType,
    totalClp: totalClp || undefined,
    description,
    commissionClp: commissionClp || undefined,
    cardFeeClp: cardFeeClp || undefined,
    lines: input.lines,
    liquidationBruto: input.liquidationBruto ?? input.brutoLiquidado,
    liquidationLiquido: input.liquidationLiquido ?? input.liquidoAPagar,
    liquidationComision: input.liquidationComision,
    reference: dteType === 61
      ? (input.reference || {
        folio: input.refFolio,
        dteType: input.refDteType || 33,
        date: input.refDate,
        code: input.refCode,
        reason: input.refReason || description
      })
      : null,
    phase: dtePhase(dteType, true),
    manual: true,
    notes: input.notes,
    issuedBy: input.issuedBy,
    force: Boolean(input.force)
  });
}

async function generateCreditNote(input = {}) {
  return generateManualInvoice({ ...input, dteType: 61 });
}

async function generatePurchaseInvoice(input = {}) {
  return generateManualInvoice({ ...input, dteType: 46 });
}

async function generateLiquidationInvoice(input = {}) {
  return generateManualInvoice({ ...input, dteType: 43 });
}

module.exports = {
  generateManualInvoice,
  generateCreditNote,
  generatePurchaseInvoice,
  generateLiquidationInvoice
};

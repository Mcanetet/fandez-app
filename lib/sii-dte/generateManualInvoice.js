/**
 * Factura 33 o Nota de Crédito 61 emitida a mano desde Admin.
 * Reutiliza el mismo pipeline de firma / TED / UploadDTE.
 */
'use strict';

const {
  generateCommissionInvoice,
  pickPartnerBilling,
  normalizeReceptor
} = require('./generateCommissionInvoice');

/**
 * @param {object} input
 * @param {33|61|string} [input.dteType]
 * @param {object} [input.partner]
 * @param {string} [input.providerId]
 * @param {object} [input.receptor]
 * @param {number} [input.totalClp] total IVA incluido
 * @param {string} [input.description] glosa
 * @param {object} [input.reference] { folio, dteType, date, code, reason }
 * @param {string} [input.requestId]
 * @param {string} [input.notes]
 * @param {string} [input.issuedBy]
 * @param {boolean} [input.force]
 */
async function generateManualInvoice(input = {}) {
  const dteType = Number(input.dteType) === 61 ? 61 : 33;
  const partner = input.partner || {};
  let receptor = input.receptor ? normalizeReceptor(input.receptor) : null;
  if (!receptor && partner && (partner.id || partner.rut || partner.providerContract)) {
    receptor = pickPartnerBilling(partner);
  }
  if (!receptor?.rut) {
    return { error: 'Indica el receptor (RUT y razón social) o elige un socio.' };
  }
  if (!receptor.name || receptor.name === 'Receptor') {
    return { error: 'Indica la razón social del receptor.' };
  }

  const totalClp = Math.max(0, Math.round(Number(input.totalClp) || 0));
  const commissionClp = Math.max(0, Math.round(Number(input.commissionClp) || 0));
  const cardFeeClp = Math.max(0, Math.round(Number(input.cardFeeClp) || 0));
  if (totalClp < 1 && commissionClp < 1 && cardFeeClp < 1) {
    return { error: 'Indica un monto total (IVA incluido) mayor a 0.' };
  }

  if (dteType === 61) {
    const refFolio = parseInt(
      input.reference?.folio ?? input.refFolio,
      10
    ) || 0;
    if (refFolio < 1) {
      return { error: 'Indica el folio de la factura (33) que anula o corrige la nota de crédito.' };
    }
  }

  const requestId = String(input.requestId || '').trim()
    || `manual-${Date.now().toString(36)}`;

  const defaultDescription = dteType === 61
    ? 'Nota de crédito Fandez'
    : 'Servicios Fandez';

  return generateCommissionInvoice({
    requestId,
    partner,
    providerId: input.providerId || partner.id || null,
    receptor,
    dteType,
    totalClp: totalClp || undefined,
    description: input.description || defaultDescription,
    commissionClp: commissionClp || undefined,
    cardFeeClp: cardFeeClp || undefined,
    lines: input.lines,
    reference: dteType === 61
      ? (input.reference || {
        folio: input.refFolio,
        dteType: input.refDteType || 33,
        date: input.refDate,
        code: input.refCode,
        reason: input.refReason || input.description || defaultDescription
      })
      : null,
    phase: dteType === 61 ? 'credit_note' : 'manual',
    manual: true,
    notes: input.notes,
    issuedBy: input.issuedBy,
    force: Boolean(input.force)
  });
}

/** Alias semántico */
async function generateCreditNote(input = {}) {
  return generateManualInvoice({ ...input, dteType: 61 });
}

module.exports = {
  generateManualInvoice,
  generateCreditNote
};

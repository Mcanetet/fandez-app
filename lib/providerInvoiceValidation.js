/**
 * Valida que la boleta/factura del socio coincida con el total del servicio
 * (lo que pagó el cliente: mano de obra + materiales).
 * Solo con match exacto (CLP entero) se puede emitir la factura Fandez
 * (15% comisión + costo pasarela/tarjeta IVA incluido).
 */
'use strict';

/**
 * Normaliza montos CLP escritos como "150000", "150.000" o "150,000".
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseInvoiceAmountClp(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  const cleaned = String(raw).trim().replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} declaredAmount monto declarado en el documento del socio
 * @param {number} expectedGrandTotal total servicio (grandTotal)
 * @returns {{ ok: true, declared: number, expected: number } | { ok: false, error: string, declared: number|null, expected: number }}
 */
function validatePartnerInvoiceAmount(declaredAmount, expectedGrandTotal) {
  const expected = Math.max(0, Math.round(Number(expectedGrandTotal) || 0));
  const declared = parseInvoiceAmountClp(declaredAmount);

  if (declared == null || declared <= 0) {
    return {
      ok: false,
      error: 'Ingresa el monto total de la boleta o factura (debe ser el 100% del servicio).',
      declared: null,
      expected
    };
  }
  if (expected <= 0) {
    return {
      ok: false,
      error: 'No hay un total de servicio para validar. Contacta a soporte.',
      declared,
      expected
    };
  }
  if (declared !== expected) {
    return {
      ok: false,
      error: `El monto del documento ($${declared.toLocaleString('es-CL')}) no coincide con el total del servicio ($${expected.toLocaleString('es-CL')}). Emite por el 100% pagado por el cliente.`,
      declared,
      expected
    };
  }
  return { ok: true, declared, expected };
}

module.exports = {
  parseInvoiceAmountClp,
  validatePartnerInvoiceAmount
};

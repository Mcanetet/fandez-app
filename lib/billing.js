const { validateRut, formatRut } = require('./rut');

function normalizeBilling(raw) {
  const type = raw?.type === 'empresa' ? 'empresa' : 'natural';
  const rutRaw = String(raw?.rut || '').trim();
  return {
    type,
    rut: rutRaw ? formatRut(rutRaw) : '',
    legalName: String(raw?.legalName || '').trim(),
    giro: String(raw?.giro || '').trim(),
    fiscalAddress: String(raw?.fiscalAddress || '').trim(),
    invoiceEmail: String(raw?.invoiceEmail || '').trim().toLowerCase()
  };
}

function validateBilling(billing) {
  const b = normalizeBilling(billing);
  const errors = [];
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.invoiceEmail);

  if (b.type === 'empresa') {
    if (!b.rut) errors.push('Ingresa el RUT');
    else if (!validateRut(b.rut)) errors.push('El RUT no es válido');
    if (!b.legalName) errors.push('Ingresa la razón social');
    if (!b.giro) errors.push('Ingresa el giro comercial');
    if (!b.fiscalAddress) errors.push('Ingresa la dirección fiscal');
  } else {
    if (b.rut && !validateRut(b.rut)) errors.push('El RUT no es válido');
    if (!b.legalName) errors.push('Ingresa el nombre para facturar');
  }

  if (!b.invoiceEmail) {
    errors.push('Ingresa el email de facturación');
  } else if (!emailOk) {
    errors.push('El email de facturación no es válido');
  }

  return { ok: errors.length === 0, errors, billing: b };
}

function getBillingLabel(billing) {
  const b = normalizeBilling(billing);
  if (!b.legalName) return null;
  if (b.type === 'empresa') return `${b.legalName} (${b.rut})`;
  return b.rut ? `${b.legalName} · ${b.rut}` : b.legalName;
}

function createBillingSnapshot(billing) {
  const result = validateBilling(billing);
  if (!result.ok) return null;
  return {
    ...result.billing,
    label: getBillingLabel(result.billing),
    capturedAt: new Date().toISOString()
  };
}

module.exports = {
  normalizeBilling,
  validateBilling,
  getBillingLabel,
  createBillingSnapshot
};

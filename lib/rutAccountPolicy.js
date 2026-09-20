/**
 * Política de RUT entre cuentas.
 *
 * Un socio puede ser también cliente (mismo RUT en facturación cliente y
 * en contrato de socio). Lo que no se permite es duplicar el mismo RUT
 * en dos cuentas del mismo propósito:
 *   - client_billing → otro cliente ya facturando con ese RUT
 *   - provider_identity → otra empresa/representante socio con ese RUT
 *
 * Demo (APP_MODE=demo) o ALLOW_SAME_RUT_ACROSS_ROLES=true: sin restricción.
 * ALLOW_SAME_RUT_ACROSS_ROLES=false: fuerza el chequeo por propósito aunque esté en demo.
 */
const { cleanRut } = require('./rut');
const appMode = require('./appMode');

function allowSameRutAcrossAccounts() {
  const flag = String(process.env.ALLOW_SAME_RUT_ACROSS_ROLES || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return appMode.isDemoMode();
}

function collectProviderRuts(user) {
  if (!user) return [];
  const out = new Set();
  const add = (value) => {
    const key = cleanRut(value);
    if (key && key.length >= 2) out.add(key);
  };
  add(user.providerContract?.legalEntity?.rut);
  add(user.providerContract?.legalRepresentative?.rut);
  return [...out];
}

function collectIdentityRuts(user) {
  if (!user) return [];
  const out = new Set();
  const add = (value) => {
    const key = cleanRut(value);
    if (key && key.length >= 2) out.add(key);
  };
  add(user.billing?.rut);
  collectProviderRuts(user).forEach((k) => out.add(k));
  return [...out];
}

function rutsForPurpose(user, purpose) {
  if (purpose === 'client_billing') {
    const key = cleanRut(user?.billing?.rut);
    return key ? [key] : [];
  }
  if (purpose === 'provider_identity') {
    return collectProviderRuts(user);
  }
  return collectIdentityRuts(user);
}

function conflictMessage(purpose) {
  if (purpose === 'client_billing') {
    return {
      errorKey: 'register.error_rut_client_conflict',
      error: 'Este RUT ya está asociado a otra cuenta de cliente.'
    };
  }
  if (purpose === 'provider_identity') {
    return {
      errorKey: 'register.error_rut_provider_conflict',
      error: 'Este RUT ya está asociado a otra cuenta de socio.'
    };
  }
  return {
    errorKey: 'register.error_rut_account_conflict',
    error: 'Este RUT ya está asociado a otra cuenta.'
  };
}

/**
 * @param {string} rut
 * @param {{ users: Array, excludeUserId?: string, purpose?: 'client_billing'|'provider_identity' }} opts
 * @returns {{ ok: true } | { ok: false, errorKey: string, error: string, conflictUserId?: string }}
 */
function assertRutAvailableForAccount(rut, { users, excludeUserId, purpose } = {}) {
  const key = cleanRut(rut);
  if (!key) return { ok: true };
  if (allowSameRutAcrossAccounts()) return { ok: true };

  const list = Array.isArray(users) ? users : [];
  const conflict = list.find((u) => {
    if (!u || (excludeUserId && u.id === excludeUserId)) return false;
    return rutsForPurpose(u, purpose).includes(key);
  });

  if (!conflict) return { ok: true };

  const msg = conflictMessage(purpose);
  return {
    ok: false,
    errorKey: msg.errorKey,
    error: msg.error,
    conflictUserId: conflict.id
  };
}

/**
 * Valida varios RUT a la vez (p. ej. empresa + representante).
 */
function assertRutsAvailableForAccount(ruts, opts) {
  for (const rut of ruts || []) {
    const result = assertRutAvailableForAccount(rut, opts);
    if (!result.ok) return result;
  }
  return { ok: true };
}

module.exports = {
  allowSameRutAcrossAccounts,
  collectIdentityRuts,
  collectProviderRuts,
  assertRutAvailableForAccount,
  assertRutsAvailableForAccount
};

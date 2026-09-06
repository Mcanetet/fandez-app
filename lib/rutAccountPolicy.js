/**
 * Política de RUT entre cuentas cliente ↔ socio.
 *
 * Demo (APP_MODE=demo): el mismo RUT puede usarse en cuentas distintas
 * (útil para pruebas; el seed demo ya comparte 12.345.678-9).
 *
 * Producción (APP_MODE=production): un RUT solo puede pertenecer a una cuenta.
 * Cliente y socio deben ser dos cuentas con RUT distintos.
 *
 * Override opcional: ALLOW_SAME_RUT_ACROSS_ROLES=true|false
 */
const { cleanRut } = require('./rut');
const appMode = require('./appMode');

function allowSameRutAcrossAccounts() {
  const flag = String(process.env.ALLOW_SAME_RUT_ACROSS_ROLES || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  return appMode.isDemoMode();
}

function collectIdentityRuts(user) {
  if (!user) return [];
  const out = new Set();
  const add = (value) => {
    const key = cleanRut(value);
    if (key && key.length >= 2) out.add(key);
  };
  add(user.billing?.rut);
  add(user.providerContract?.legalEntity?.rut);
  add(user.providerContract?.legalRepresentative?.rut);
  return [...out];
}

/**
 * @param {string} rut
 * @param {{ users: Array, excludeUserId?: string }} opts
 * @returns {{ ok: true } | { ok: false, errorKey: string, error: string, conflictUserId?: string }}
 */
function assertRutAvailableForAccount(rut, { users, excludeUserId } = {}) {
  const key = cleanRut(rut);
  if (!key) return { ok: true };
  if (allowSameRutAcrossAccounts()) return { ok: true };

  const list = Array.isArray(users) ? users : [];
  const conflict = list.find((u) => {
    if (!u || (excludeUserId && u.id === excludeUserId)) return false;
    return collectIdentityRuts(u).includes(key);
  });

  if (!conflict) return { ok: true };

  return {
    ok: false,
    errorKey: 'register.error_rut_account_conflict',
    error:
      'Este RUT ya está asociado a otra cuenta. En producción, cliente y socio deben ser cuentas distintas.',
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
  assertRutAvailableForAccount,
  assertRutsAvailableForAccount
};

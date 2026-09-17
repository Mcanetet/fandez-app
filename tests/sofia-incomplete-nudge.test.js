const {
  actionableMissing,
  providerRegisteredAt,
  isDemoProvider,
  ONE_DAY_MS
} = require('../lib/sofia/incompleteProviderNudge');

describe('Sofía — nudge registro incompleto socio', () => {
  test('detecta demo y fecha de registro', () => {
    expect(isDemoProvider({ email: 'pedro@fandez.cl', id: 'provider-pedro' })).toBe(true);
    expect(isDemoProvider({ email: 'mariela@empresa.cl', id: 'provider-xyz' })).toBe(false);
    const t = providerRegisteredAt({ memberSince: '2026-09-01' });
    expect(t).toBeTruthy();
    expect(Date.now() - t).toBeGreaterThan(ONE_DAY_MS);
  });

  test('solo pide acciones del socio (no molesta si solo espera revisión)', () => {
    const store = {
      ensureProviderFields() {},
      canProviderGoOnline() {
        return {
          ok: false,
          missing: ['contrato en revisión legal'],
          contract: { status: 'pending_review' }
        };
      }
    };
    expect(actionableMissing(store, { role: 'provider', active: true })).toEqual([]);

    const store2 = {
      ensureProviderFields() {},
      canProviderGoOnline() {
        return {
          ok: false,
          missing: ['carnet (frente)', 'contrato de socio firmado y aprobado'],
          contract: { status: 'incomplete' }
        };
      }
    };
    const miss = actionableMissing(store2, { role: 'provider', active: true });
    expect(miss).toContain('carnet (frente)');
  });
});

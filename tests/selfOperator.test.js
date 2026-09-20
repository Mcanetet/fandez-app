'use strict';

jest.mock('../lib/db', () => ({
  query: jest.fn(async () => [{ affectedRows: 1 }]),
  getPool: jest.fn(),
  raw: jest.fn(async () => undefined)
}));

const {
  USERS,
  createTechnician,
  enableSelfOperator,
  getSelfOperator,
  canTechnicianOperate
} = require('../models/store');

describe('self-operator · mismo correo socio', () => {
  const providerId = 'provider-test-self-op';

  function seedProvider(overrides = {}) {
    for (let i = USERS.length - 1; i >= 0; i -= 1) {
      const u = USERS[i];
      if (u.id === providerId || u.parentId === providerId || (u.parentIds || []).includes(providerId)) {
        USERS.splice(i, 1);
      }
    }
    const provider = {
      id: providerId,
      email: 'socio.self@example.cl',
      name: 'Socio Solo',
      role: 'provider',
      phone: '+56911111111',
      avatar: 'SS',
      specialties: ['gasfiteria'],
      active: true,
      emailVerifiedAt: new Date().toISOString(),
      verification: {
        status: 'incomplete'
      },
      locationShare: { consent: false },
      providerContract: { status: 'draft' },
      ...overrides
    };
    USERS.push(provider);
    return provider;
  }

  afterEach(() => {
    for (let i = USERS.length - 1; i >= 0; i -= 1) {
      const u = USERS[i];
      if (u.id === providerId || u.parentId === providerId || (u.parentIds || []).includes(providerId)) {
        USERS.splice(i, 1);
      }
    }
  });

  test('createTechnician con el correo del socio activa self-operator', async () => {
    seedProvider();
    const result = await createTechnician(providerId, {
      name: 'Socio Solo',
      email: 'socio.self@example.cl',
      password: 'no-se-usa-12345',
      specialties: ['gasfiteria']
    });
    expect(result.error).toBeUndefined();
    expect(result.selfOperator).toBe(true);
    expect(result.tecnico.isSelfOperator).toBe(true);
    expect(getSelfOperator(providerId)?.id).toBe(result.tecnico.id);
  });

  test('enableSelfOperator no exige KYC completo para crear el perfil', async () => {
    seedProvider();
    const result = await enableSelfOperator(providerId);
    expect(result.error).toBeUndefined();
    expect(result.tecnico.isSelfOperator).toBe(true);
    expect(canTechnicianOperate(result.tecnico).ok).toBe(false);
  });

  test('sin servicios activos no se puede agregar', async () => {
    seedProvider({ specialties: [] });
    const result = await enableSelfOperator(providerId);
    expect(result.error).toMatch(/servicio/i);
  });
});

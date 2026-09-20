'use strict';

jest.mock('../lib/db', () => ({
  query: jest.fn(async () => [{ affectedRows: 1 }]),
  getPool: jest.fn(),
  raw: jest.fn(async () => undefined)
}));

const { USERS, canTechnicianOperate, ensureTechnicianDossier } = require('../models/store');

// ensureTechnicianDossier is used via canTechnicianOperate; may not be exported
const store = require('../models/store');

describe('validación técnico · carnet + antecedentes', () => {
  const id = 'tecnico-docs-test';

  afterEach(() => {
    for (let i = USERS.length - 1; i >= 0; i -= 1) {
      if (USERS[i].id === id) USERS.splice(i, 1);
    }
  });

  test('sin foto ni estudios igual puede operar si tiene carnet y antecedentes', () => {
    const tecnico = {
      id,
      role: 'tecnico',
      active: true,
      email: 'tech-docs@example.cl',
      name: 'Tech Docs',
      parentId: 'provider-x',
      verification: {
        idCardFront: '/tmp/front.jpg',
        idCardBack: '/tmp/back.jpg',
        criminalRecord: '/tmp/antecedentes.pdf'
      }
    };
    USERS.push(tecnico);
    const check = canTechnicianOperate(tecnico);
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
  });

  test('falta antecedentes → no opera', () => {
    const tecnico = {
      id,
      role: 'tecnico',
      active: true,
      email: 'tech-docs@example.cl',
      name: 'Tech Docs',
      verification: {
        idCardFront: '/tmp/front.jpg',
        idCardBack: '/tmp/back.jpg'
      }
    };
    USERS.push(tecnico);
    const check = canTechnicianOperate(tecnico);
    expect(check.ok).toBe(false);
    expect(check.missing.join(' ')).toMatch(/antecedentes/i);
  });
});

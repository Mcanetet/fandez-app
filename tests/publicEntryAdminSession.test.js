'use strict';

/**
 * Sesión admin no debe secuestrar la app/web pública (misma cookie en el dominio).
 */
const request = require('supertest');
const { createAuthTestApp } = require('./helpers/createAuthTestApp');

describe('entrada pública con sesión admin', () => {
  let app;
  let agent;

  beforeEach(() => {
    app = createAuthTestApp();
    agent = request.agent(app);
  });

  test('GET /login con sesión admin cierra y muestra login público (no redirige a /ops)', async () => {
    await agent.post('/__test__/session').send({
      id: 'admin-1',
      email: 'admin@fandez.cl',
      name: 'Admin',
      role: 'admin'
    });
    // Marca extra que usa isAdminSessionUser
    await agent.post('/__test__/session').send({
      id: 'admin-1',
      email: 'admin@fandez.cl',
      name: 'Admin',
      role: 'admin'
    });

    const res = await agent.get('/login');
    // logoutAndRedirect → 303 a /login, luego 200 en el form público
    expect([200, 303]).toContain(res.status);
    if (res.status === 303) {
      expect(res.headers.location).toMatch(/^\/login/);
      expect(res.headers.location).not.toMatch(/\/ops-/);
      const again = await agent.get(res.headers.location);
      expect(again.status).toBe(200);
      expect(String(again.text)).toMatch(/Iniciar sesión|login/i);
      expect(String(again.text)).not.toMatch(/ops-dde/);
    } else {
      expect(String(res.text)).toMatch(/Iniciar sesión|login/i);
    }
  });

  test('GET /logout?to=public deja en home pública', async () => {
    await agent.post('/__test__/session').send({
      id: 'admin-1',
      email: 'admin@fandez.cl',
      name: 'Admin',
      role: 'admin'
    });
    const res = await agent.get('/logout?to=public');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
  });
});

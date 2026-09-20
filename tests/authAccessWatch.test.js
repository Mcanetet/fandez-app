'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const authAccessWatch = require('../lib/agents/authAccessWatch');

test('summarizeRecentFailures cuenta eventos de acceso', () => {
  const store = {
    securityLogs: [
      { event: 'registro_fail', detail: 'x', createdAt: new Date().toISOString() },
      { event: 'login_fail', detail: 'y', createdAt: new Date().toISOString() },
      { event: 'login_ok', detail: 'z', createdAt: new Date().toISOString() },
      { event: 'registro_fail', detail: 'old', createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() }
    ]
  };
  const summary = authAccessWatch.summarizeRecentFailures(store, { minutes: 60 });
  assert.equal(summary.total, 2);
  assert.equal(summary.byEvent.registro_fail, 1);
  assert.equal(summary.byEvent.login_fail, 1);
});

test('reportLoginError no alerta bajo el umbral', async () => {
  const out = await authAccessWatch.reportLoginError({
    email: `test-threshold-${Date.now()}@example.com`,
    reason: 'login_fail',
    req: { ip: '127.0.0.1', headers: {} }
  });
  assert.equal(out.skipped, true);
  assert.equal(out.reason, 'below_threshold');
});

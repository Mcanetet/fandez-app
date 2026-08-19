const florencia = require('../lib/florencia');

describe('Florencia IA', () => {
  describe('marketingRecipients()', () => {
    test('solo incluye clientes con consentimiento de marketing vigente', () => {
      const store = {
        USERS: [
          { id: 'c1', role: 'client', email: 'uno@fandez.cl', active: true },
          { id: 'c2', role: 'client', email: 'dos@fandez.cl', active: true },
          { id: 'p1', role: 'provider', email: 'socio@fandez.cl', active: true }
        ],
        consentRecords: [
          { userId: 'c1', type: 'marketing', granted: true, createdAt: '2026-01-01T00:00:00Z' },
          { userId: 'c2', type: 'marketing', granted: false, createdAt: '2026-01-01T00:00:00Z' },
          { userId: 'p1', type: 'marketing', granted: true, createdAt: '2026-01-01T00:00:00Z' }
        ]
      };
      expect(florencia.marketingRecipients(store).map((user) => user.id)).toEqual(['c1']);
    });

    test('respeta revocación o decisión posterior', () => {
      const store = {
        USERS: [{ id: 'c1', role: 'client', email: 'uno@fandez.cl', active: true }],
        consentRecords: [
          { userId: 'c1', type: 'marketing', granted: true, createdAt: '2026-01-01T00:00:00Z' },
          { userId: 'c1', type: 'marketing', granted: false, createdAt: '2026-02-01T00:00:00Z' }
        ]
      };
      expect(florencia.marketingRecipients(store)).toEqual([]);
    });
  });
});

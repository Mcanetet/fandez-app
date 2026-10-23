'use strict';

const {
  MONTHLY_CAP,
  monthKey,
  canLinkReferral,
  linkReferral,
  friendDiscountAmount,
  isFirstPaidVisit,
  shouldSettleReferrer
} = require('../lib/referrals');

describe('Referidos: enlace sin plata al registrarse', () => {
  const now = new Date('2026-10-23T12:00:00-03:00');

  test('vincula al amigo y no entrega crédito', () => {
    const user = { id: 'b', referralCode: 'BETA11' };
    const referrer = { id: 'a', referralCode: 'ALFA22' };
    const gate = canLinkReferral({
      enabled: true,
      user,
      code: 'alfa22',
      referrer,
      users: [user, referrer],
      now
    });
    expect(gate.ok).toBe(true);
    const linked = linkReferral({ user, referrer, code: 'ALFA22', now });
    expect(linked.bonus).toBe(0);
    expect(linked.deferred).toBe(true);
    expect(user.referredByUserId).toBe('a');
    expect(user.usedReferral).toBe(true);
    expect(user.creditsCLP).toBeUndefined();
  });

  test('tope de 5 amigos en el mes', () => {
    const referrer = { id: 'a', referralCode: 'ALFA22' };
    const users = [referrer];
    for (let i = 0; i < MONTHLY_CAP; i += 1) {
      users.push({
        id: `u${i}`,
        referredByUserId: 'a',
        referredAt: now.toISOString()
      });
    }
    const gate = canLinkReferral({
      enabled: true,
      user: { id: 'nuevo', referralCode: 'NUEVO1' },
      code: 'ALFA22',
      referrer,
      users,
      now
    });
    expect(gate.error).toMatch(/tope de 5/);
  });

  test('el mes usa calendario de Santiago', () => {
    expect(monthKey(new Date('2026-10-23T15:00:00Z'))).toBe('2026-10');
  });
});

describe('Referidos: descuento en la primera visita', () => {
  test('aplica $5.000 sobre el saldo de la primera visita', () => {
    const amount = friendDiscountAmount({
      enabled: true,
      user: { referredByUserId: 'a', referralFriendDiscountUsed: false },
      remaining: 45000,
      creditCLP: 5000,
      firstPaidVisit: true
    });
    expect(amount).toBe(5000);
  });

  test('no aplica si ya tuvo una visita pagada', () => {
    expect(isFirstPaidVisit([
      { id: 'old', clientId: 'b', paymentStatus: 'approved' }
    ], 'b', 'new')).toBe(false);
    expect(friendDiscountAmount({
      enabled: true,
      user: { referredByUserId: 'a' },
      remaining: 45000,
      creditCLP: 5000,
      firstPaidVisit: false
    })).toBe(0);
  });

  test('el invitador cobra al cerrar la visita pagada', () => {
    expect(shouldSettleReferrer({
      enabled: true,
      request: { paymentStatus: 'approved', status: 'completed' },
      user: { referredByUserId: 'a', referralSettled: false }
    })).toBe(true);
    expect(shouldSettleReferrer({
      enabled: true,
      request: { paymentStatus: 'pending', status: 'completed' },
      user: { referredByUserId: 'a' }
    })).toBe(false);
  });
});

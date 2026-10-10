const { getAccessToken } = require('./credentials');

/** GET /v1/payment_methods — marcas activas + logos Visa/MC/Amex. */
async function listCardPaymentMethods() {
  const token = getAccessToken();
  if (!token) return { ok: false, methods: [], brands: {}, logos: [], visa: null };

  try {
    const res = await fetch('https://api.mercadopago.com/v1/payment_methods', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      return { ok: false, methods: [], brands: {}, logos: [], visa: null, status: res.status };
    }

    const data = await res.json();
    const methods = (Array.isArray(data) ? data : [])
      .filter((m) => ['credit_card', 'debit_card', 'prepaid_card'].includes(String(m.payment_type_id || '')))
      .map((m) => ({
        id: String(m.id || ''),
        name: String(m.name || m.id || ''),
        type: String(m.payment_type_id || ''),
        status: String(m.status || ''),
        thumbnail: String(m.secure_thumbnail || m.thumbnail || ''),
        secure_thumbnail: String(m.secure_thumbnail || m.thumbnail || '')
      }));

    const isActive = (m) => m.status === 'active' || m.status === '';
    const active = methods.filter(isActive);
    const ids = new Set(active.map((m) => m.id.toLowerCase()));
    const brands = {
      visa: ids.has('visa') || ids.has('debvisa'),
      master: ids.has('master') || ids.has('debmaster'),
      amex: ids.has('amex')
    };

    const logoPrefer = ['credit_card', 'debit_card', 'prepaid_card'];
    const logoOrder = ['visa', 'master', 'amex'];
    const logoByKey = new Map();
    for (const type of logoPrefer) {
      for (const m of active.filter((x) => x.type === type && x.secure_thumbnail)) {
        const key = m.id.replace(/^deb/, '').toLowerCase();
        if (!logoOrder.includes(key)) continue;
        if (!logoByKey.has(key)) logoByKey.set(key, m);
      }
    }
    const logos = logoOrder.filter((k) => logoByKey.has(k)).map((k) => {
      const m = logoByKey.get(k);
      return { id: m.id, name: m.name, type: m.type, secure_thumbnail: m.secure_thumbnail };
    });

    const visaRows = methods.filter((m) => {
      const id = m.id.toLowerCase();
      return id === 'visa' || id === 'debvisa' || m.name.toLowerCase().includes('visa');
    });
    const visaActive = visaRows.filter(isActive);
    const visa = {
      presentInApi: visaRows.length > 0,
      active: visaActive.length > 0,
      rows: visaRows,
      activeTypes: [...new Set(visaActive.map((r) => r.type))],
      diagnosis: !visaRows.length
        ? 'Visa no aparece en /v1/payment_methods → cuenta sin Visa.'
        : (visaActive.length
          ? `Visa OK (${visaActive.map((r) => `${r.id}/${r.type}`).join(', ')}).`
          : `Visa status=${visaRows.map((r) => r.status).join(',')}.`)
    };

    const auditIds = new Set(['visa', 'debvisa', 'master', 'debmaster', 'amex']);
    const brandAudit = methods
      .filter((m) => auditIds.has(m.id.toLowerCase()))
      .map((m) => ({
        id: m.id,
        status: m.status || '(vacío)',
        payment_type_id: m.type,
        secure_thumbnail: Boolean(m.secure_thumbnail),
        thumbnail: Boolean(m.thumbnail)
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return { ok: true, methods, active, brands, logos, visa, brandAudit };
  } catch (err) {
    console.error('[mp/methods]', err?.message || err);
    return { ok: false, methods: [], brands: {}, logos: [], visa: null };
  }
}

async function probeAccessTokenKind() {
  const token = getAccessToken();
  if (!token) return { ok: false, kind: 'missing', detail: 'Sin Access Token' };
  if (token.startsWith('TEST-')) return { ok: true, kind: 'test', detail: 'Access Token prefijo TEST-' };

  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return { ok: false, kind: 'invalid', detail: `users/me HTTP ${res.status}` };
    const me = await res.json();
    const email = String(me.email || '').toLowerCase();
    const nickname = String(me.nickname || '').toLowerCase();
    const tags = Array.isArray(me.tags) ? me.tags.map(String) : [];
    const looksTest = tags.includes('test_user')
      || email.includes('testuser.com')
      || email.includes('test_user')
      || nickname.startsWith('tete')
      || nickname.includes('test');
    return {
      ok: true,
      kind: looksTest ? 'test' : 'likely_live',
      detail: looksTest
        ? 'users/me indica cuenta de prueba'
        : 'users/me no parece test_user — revisa MP_TEST_ACCESS_TOKEN',
      siteId: me.site_id || null
    };
  } catch (err) {
    return { ok: false, kind: 'error', detail: err.message || 'probe failed' };
  }
}

module.exports = { listCardPaymentMethods, probeAccessTokenKind };

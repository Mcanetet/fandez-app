#!/usr/bin/env node
/**
 * Auditoría Visa / Mastercard / Amex vía GET /v1/payment_methods.
 *
 * Uso:
 *   MP_ACCESS_TOKEN='APP_USR-…' node scripts/mp-brand-audit.js
 *   MP_TEST_ACCESS_TOKEN='TEST-…' node scripts/mp-brand-audit.js
 *
 * Imprime solo los registros que pide soporte MP (id, status, payment_type_id).
 */
'use strict';

require('dotenv').config({ path: '.env' });

async function audit(label, token) {
  if (!token) {
    console.log(`\n[${label}] sin token`);
    return;
  }
  console.log(`\n=== ${label} ===`);
  const res = await fetch('https://api.mercadopago.com/v1/payment_methods', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    console.log('HTTP', res.status, await res.text().catch(() => ''));
    return;
  }
  const data = await res.json();
  const rows = (Array.isArray(data) ? data : []).filter((m) => {
    const id = String(m.id || '').toLowerCase();
    return ['visa', 'debvisa', 'master', 'debmaster', 'amex'].includes(id);
  });
  if (!rows.length) {
    console.log('(ningún registro visa/master/amex en la respuesta)');
    return;
  }
  for (const m of rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    console.log(JSON.stringify({
      id: m.id,
      status: m.status,
      payment_type_id: m.payment_type_id,
      secure_thumbnail: Boolean(m.secure_thumbnail)
    }));
  }
}

(async () => {
  const testTok = process.env.MP_TEST_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST || '';
  const liveTok = process.env.MP_ACCESS_TOKEN || '';
  // Si pasan un solo token genérico
  const one = process.env.MP_TOKEN || '';
  if (one) await audit('token (MP_TOKEN)', one);
  await audit('prueba (MP_TEST_ACCESS_TOKEN)', testTok);
  await audit('producción (MP_ACCESS_TOKEN)', liveTok);
  if (!one && !testTok && !liveTok) {
    console.error('Define MP_TEST_ACCESS_TOKEN y/o MP_ACCESS_TOKEN (o MP_TOKEN).');
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

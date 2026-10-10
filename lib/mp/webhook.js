const crypto = require('crypto');

/** Verifica x-signature de webhooks MP. Sin secret → true (dev). */
function verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }) {
  if (!secret) return true;
  const sig = String(xSignature || '');
  const reqId = String(xRequestId || '');
  const id = String(dataId || '').toLowerCase();
  if (!sig || !id) return false;

  const parts = Object.fromEntries(
    sig.split(',').map((part) => {
      const [key, ...val] = part.trim().split('=');
      return [key, val.join('=')];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  let manifest = `id:${id};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyWebhookSignature };

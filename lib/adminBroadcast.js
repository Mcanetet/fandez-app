const mailer = require('./mailer');
const { isConfigured: smtpConfigured } = mailer;
const { transactional } = require('./emailLayout');
const company = require('../config/company');

const MAX_RECIPIENTS = 250;
const SEND_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeAudience(raw) {
  const v = String(raw || '').trim().toLowerCase();
  const map = {
    socios: 'providers',
    providers: 'providers',
    provider: 'providers',
    tecnicos: 'technicians',
    technicians: 'technicians',
    tecnico: 'technicians',
    ambos: 'providers_and_technicians',
    both: 'providers_and_technicians',
    providers_and_technicians: 'providers_and_technicians',
    clientes: 'clients',
    clients: 'clients',
    client: 'clients',
    todos: 'all',
    all: 'all',
    everyone: 'all'
  };
  return map[v] || null;
}

function userHasEmail(user) {
  return Boolean(user && String(user.email || '').trim() && user.active !== false);
}

function resolveRecipients(store, { audience, userIds = [] } = {}) {
  const ids = Array.isArray(userIds)
    ? userIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (ids.length) {
    const seen = new Set();
    const list = [];
    for (const id of ids) {
      const user = store.getUserById(id);
      if (!user || !userHasEmail(user)) continue;
      const key = String(user.email).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(user);
    }
    return list;
  }

  const aud = normalizeAudience(audience);
  if (!aud) return [];

  const users = store.USERS || [];
  const seen = new Set();
  const list = [];

  function pushUser(user) {
    if (!userHasEmail(user)) return;
    const key = String(user.email).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(user);
  }

  if (aud === 'providers') {
    users.filter((u) => u.role === 'provider').forEach(pushUser);
  } else if (aud === 'technicians') {
    users.filter((u) => u.role === 'tecnico').forEach(pushUser);
  } else if (aud === 'providers_and_technicians') {
    users.filter((u) => u.role === 'provider' || u.role === 'tecnico').forEach(pushUser);
  } else if (aud === 'clients') {
    users.filter((u) => u.role === 'client').forEach(pushUser);
  } else if (aud === 'all') {
    users.filter((u) => u.role === 'client' || u.role === 'provider' || u.role === 'tecnico').forEach(pushUser);
  }

  return list;
}

function buildHtmlBody({ subject, body, greetingName }) {
  const bodyHtml = escapeHtml(body).replace(/\n/g, '<br>');
  return transactional({
    title: subject,
    preheader: body.slice(0, 90),
    eyebrow: 'Fandez',
    heading: subject,
    greeting: greetingName ? `Hola ${greetingName},` : 'Hola,',
    bodyHtml: `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1A1814">${bodyHtml}</p>`,
    cta: { href: company.appUrl, label: 'Abrir Fandez' },
    note: 'Mensaje enviado desde el equipo Fandez. Si no esperabas este correo, contáctanos.',
    supportHint: true
  });
}

async function sendAdminBroadcast(store, options = {}) {
  const subject = String(options.subject || '').trim().slice(0, 200);
  const body = String(options.body || '').trim().slice(0, 12000);
  const audience = options.audience;
  const userIds = options.userIds;

  if (!subject) return { error: 'Indica un asunto.' };
  if (!body) return { error: 'Indica el cuerpo del mensaje.' };
  if (!normalizeAudience(audience) && !(Array.isArray(userIds) && userIds.length)) {
    return { error: 'Elige audiencia o destinatarios.' };
  }

  const recipients = resolveRecipients(store, { audience, userIds });
  if (!recipients.length) return { error: 'No hay destinatarios con correo activo.' };
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      error: `Demasiados destinatarios (${recipients.length}). Máximo ${MAX_RECIPIENTS} por envío; selecciona menos clientes o envía por grupos.`
    };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const user of recipients) {
    const html = buildHtmlBody({ subject, body, greetingName: user.name });
    const text = `${body}\n\n— Fandez\n${company.appUrl}`;
    try {
      const result = await mailer.sendMail({
        to: user.email,
        subject,
        text,
        html
      });
      if (result?.error) {
        failed += 1;
        if (errors.length < 5) errors.push(`${user.email}: ${result.error}`);
      } else {
        sent += 1;
      }
    } catch (err) {
      failed += 1;
      if (errors.length < 5) errors.push(`${user.email}: ${err.message || 'error'}`);
    }
    if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
  }

  return {
    success: true,
    audience: normalizeAudience(audience) || 'custom',
    total: recipients.length,
    sent,
    failed,
    demo: !smtpConfigured(),
    errors
  };
}

module.exports = {
  normalizeAudience,
  resolveRecipients,
  sendAdminBroadcast,
  MAX_RECIPIENTS
};

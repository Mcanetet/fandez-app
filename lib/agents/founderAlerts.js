/**
 * Avisos al founder (email):
 * - INMEDIATO: socios nuevos, SOS/seguridad, técnico que no llega / no acepta, integridad.
 * - DIARIO: estadísticas Sofía (pedidos, chats, reclamos, pendientes de aprobar).
 *
 * Env:
 *   FOUNDER_EMAILS=mcanete@fen.uchile.cl
 *   FOUNDER_DIGEST_ENABLED=true
 *   FOUNDER_DIGEST_HOUR=21   (America/Santiago, 0–23)
 */
'use strict';

const adminNotify = require('../aland/adminNotify');
const { founderEmails } = require('../founderGates');
const informes = require('../informes');
const company = require('../../config/company');

const notifiedKeys = new Map(); // key → timestamp
const DEDUPE_MS = 6 * 60 * 60 * 1000;
let digestTimer = null;
let lastDigestDate = null;

function chileNowParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10)
  };
}

function digestEnabled() {
  const v = String(process.env.FOUNDER_DIGEST_ENABLED || 'true').toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function digestHour() {
  const n = parseInt(process.env.FOUNDER_DIGEST_HOUR || '21', 10);
  if (!Number.isFinite(n)) return 21;
  return Math.min(23, Math.max(0, n));
}

function pruneDedupe(now = Date.now()) {
  for (const [k, t] of notifiedKeys) {
    if (now - t > DEDUPE_MS) notifiedKeys.delete(k);
  }
}

function shouldSendOnce(key) {
  pruneDedupe();
  if (!key) return true;
  if (notifiedKeys.has(key)) return false;
  notifiedKeys.set(key, Date.now());
  return true;
}

function recipients() {
  const list = [...founderEmails(), ...adminNotify.alertEmails()];
  return [...new Set(list)];
}

/**
 * Alerta inmediata (robo, discusión, técnico no llegó, socio nuevo, etc.).
 */
async function notifyInstant({
  agent = 'Sofía',
  severity = 'high',
  title,
  body,
  dedupeKey = null,
  link = null,
  store = null
} = {}) {
  if (!title || !body) return { skipped: true, reason: 'empty' };
  if (dedupeKey && !shouldSendOnce(dedupeKey)) {
    return { skipped: true, reason: 'deduped' };
  }

  const urgent = severity === 'critical' || severity === 's1' || severity === 'high';
  const subject = urgent
    ? `🚨 Fandez · ${agent} · ${title}`
    : `Fandez · ${agent} · ${title}`;

  const text = [
    body,
    '',
    link || (company.appUrl ? `Admin: ${String(company.appUrl).replace(/\/+$/, '')}` : null),
    `Severidad: ${severity}`,
    `Destinatarios founder: ${founderEmails().join(', ') || '(configura FOUNDER_EMAILS)'}`
  ].filter(Boolean).join('\n');

  let inboxItem = null;
  try {
    const opsInbox = require('./opsInbox');
    inboxItem = await opsInbox.enqueue({
      agent,
      severity,
      title,
      body,
      link,
      store,
      push: true,
      meta: { dedupeKey }
    });
  } catch (err) {
    console.warn('[founderAlerts] opsInbox:', err.message);
  }

  // Usa el mismo pipeline (email + telegram + ntfy), ya incluye FOUNDER_EMAILS.
  const notify = await adminNotify.notifyAdminFree({ title: subject, body: text });
  return { notify, inboxItem };
}

function countPendingApprovals(store) {
  const users = store.USERS || [];
  const providers = users.filter((u) => u.role === 'provider');
  const pendingContracts = providers.filter((u) => {
    const st = u.providerContract?.review?.status || u.providerContract?.status;
    return ['pending_review', 'submitted', 'needs_info'].includes(st);
  });
  const pendingKyc = providers.filter((u) => {
    const st = u.verification?.status;
    return st && !['approved', 'verified', 'ok'].includes(st) && st !== 'not_required';
  });
  const pendingClients = users.filter((u) =>
    u.role === 'client' && u.active !== false && !u.emailVerifiedAt
  );
  return {
    pendingContracts: pendingContracts.length,
    pendingKyc: pendingKyc.length,
    pendingEmailClients: pendingClients.length,
    contractNames: pendingContracts.slice(0, 12).map((p) => p.name || p.email)
  };
}

function formatDailyEmail(ops, approvals, census = null) {
  const m = ops.metrics || {};
  const sofia = m.sofia || {};
  const lines = [
    `Informe diario Fandez · ${ops.label || ops.date}`,
    '',
    '——— Resumen del día ———',
    `Pedidos nuevos: ${m.arrived || 0}`,
    `Completados: ${m.resolved || 0}`,
    `En curso: ${m.inProcess || 0} (sin socio: ${m.searching || 0})`,
    `Urgencias: ${m.emergencies || 0}`,
    `Reclamos hoy / abiertos: ${m.complaintsToday || 0} / ${m.complaintsOpen || 0}`,
    `Devoluciones hoy / cola: ${m.refundsToday || 0} / ${m.refundsOpen || 0}`,
    `Chats Sofía hoy: ${sofia.conversations || 0} · esperando admin: ${sofia.awaitingAdmin || 0}`,
    `Nuevos socios hoy: ${m.newProviders || 0}`,
    '',
    (() => {
      try {
        const authAccessWatch = require('./authAccessWatch');
        const auth = authAccessWatch.summarizeRecentFailures(store, { minutes: 24 * 60, limit: 5 });
        if (!auth.total) {
          return ['——— Accesos registro / ingreso (24 h) ———', 'Sin errores registrados.', ''].join('\n');
        }
        const lines = Object.entries(auth.byEvent).map(([ev, n]) => `  · ${ev}: ${n}`);
        return [
          '——— Accesos registro / ingreso (24 h) ———',
          `Total fallos: ${auth.total}`,
          ...lines,
          ''
        ].join('\n');
      } catch (_) {
        return null;
      }
    })(),
    census
      ? [
        '——— Totales en la plataforma ———',
        `Clientes: ${census.clients} (activos: ${census.clientsActive})`,
        `Socios: ${census.providers} (activos: ${census.providersActive} · online: ${census.providersOnline})`,
        `Técnicos: ${census.technicians}`,
        `Admins: ${census.admins}`,
        ''
      ].join('\n')
      : null,
    '——— Pendiente de tu aprobación ———',
    `Contratos socio por revisar: ${approvals.pendingContracts}`,
    approvals.contractNames.length
      ? `  → ${approvals.contractNames.join(', ')}`
      : null,
    `KYC / verificación pendiente: ${approvals.pendingKyc}`,
    `Clientes sin email verificado: ${approvals.pendingEmailClients}`,
    '',
    ops.narrative || '',
    '',
    company.appUrl
      ? `Abrir admin: ${String(company.appUrl).replace(/\/+$/, '')}`
      : null
  ].filter((x) => x != null);

  return {
    subject: `📊 Fandez · Informe diario · ${ops.date}`,
    text: lines.join('\n')
  };
}

function buildUserCensus(store) {
  const users = store.USERS || [];
  const byRole = (role) => users.filter((u) => u.role === role);
  const clients = byRole('client');
  const providers = byRole('provider');
  const technicians = byRole('tecnico');
  const admins = byRole('admin');

  const summarizeProvider = (p) => {
    const st = p.providerContract?.review?.status || p.providerContract?.status || '—';
    const kyc = p.verification?.status || '—';
    return `- ${p.name || 'Sin nombre'} · ${p.email || '—'} · tel ${p.phone || '—'} · contrato:${st} · kyc:${kyc} · ${p.active === false ? 'BLOQUEADO' : (p.online ? 'online' : 'offline')}`;
  };

  const summarizeClient = (c) =>
    `- ${c.name || 'Sin nombre'} · ${c.email || '—'} · ${c.emailVerifiedAt ? 'email OK' : 'email pendiente'} · ${c.memberSince || c.createdAt || ''}`;

  const pendingProviders = providers.filter((p) => {
    const st = p.providerContract?.review?.status || p.providerContract?.status;
    return ['pending_review', 'submitted', 'needs_info', 'incomplete', 'unsigned'].includes(st)
      || (p.verification?.status && !['approved', 'verified', 'ok'].includes(p.verification.status));
  });

  return {
    clients: clients.length,
    clientsActive: clients.filter((u) => u.active !== false).length,
    providers: providers.length,
    providersActive: providers.filter((u) => u.active !== false).length,
    providersOnline: providers.filter((u) => u.online).length,
    technicians: technicians.length,
    admins: admins.length,
    pendingProviders,
    providerLines: providers
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
      .map(summarizeProvider),
    pendingLines: pendingProviders.map(summarizeProvider),
    recentClients: clients
      .slice()
      .sort((a, b) => Date.parse(b.memberSince || b.createdAt || 0) - Date.parse(a.memberSince || a.createdAt || 0))
      .slice(0, 30)
      .map(summarizeClient)
  };
}

/**
 * Censo completo: todos los socios + pendientes + muestra de clientes.
 * Úsalo al activar el canal o desde Admin → notify-census.
 */
async function sendUserCensus(store) {
  if (!founderEmails().length && !adminNotify.alertEmails().length) {
    return { skipped: true, reason: 'no_recipients' };
  }
  const c = buildUserCensus(store);
  const text = [
    'Censo Fandez · usuarios y socios',
    '',
    `Clientes: ${c.clients} (activos ${c.clientsActive})`,
    `Socios: ${c.providers} (activos ${c.providersActive} · online ${c.providersOnline})`,
    `Técnicos: ${c.technicians}`,
    `Admins: ${c.admins}`,
    '',
    `——— Socios pendientes de revisar (${c.pendingProviders.length}) ———`,
    ...(c.pendingLines.length ? c.pendingLines : ['(ninguno)']),
    '',
    `——— Todos los socios (${c.providers}) ———`,
    ...(c.providerLines.length ? c.providerLines : ['(ninguno)']),
    '',
    '——— Últimos 30 clientes ———',
    ...(c.recentClients.length ? c.recentClients : ['(ninguno)']),
    '',
    company.appUrl ? `Admin: ${String(company.appUrl).replace(/\/+$/, '')}` : null
  ].filter(Boolean).join('\n');

  const result = await adminNotify.notifyAdminFree({
    title: `👥 Fandez · Censo usuarios (${c.clients} clientes · ${c.providers} socios)`,
    body: text
  });

  return { ok: true, recipients: recipients(), census: c, result };
}

async function sendDailyDigest(store, { date = new Date(), force = false } = {}) {
  if (!digestEnabled() && !force) return { skipped: true, reason: 'disabled' };
  if (!founderEmails().length && !adminNotify.alertEmails().length) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const ops = await informes.buildDailyOpsReport(store, { date });
  const approvals = countPendingApprovals(store);
  const census = buildUserCensus(store);
  const { subject, text } = formatDailyEmail(ops, approvals, census);

  const result = await adminNotify.notifyAdminFree({
    title: subject,
    body: text
  });

  return {
    ok: true,
    date: ops.date,
    recipients: recipients(),
    metrics: ops.metrics,
    pendingApprovals: approvals,
    census: {
      clients: census.clients,
      providers: census.providers,
      technicians: census.technicians,
      pendingProviders: census.pendingProviders.length
    },
    result
  };
}

function startDailyDigestScheduler(store) {
  if (digestTimer) return { already: true };
  if (!digestEnabled()) {
    console.log('[founder-digest] desactivado (FOUNDER_DIGEST_ENABLED=false)');
    return { enabled: false };
  }

  const tick = async () => {
    try {
      const { date, hour } = chileNowParts();
      if (hour !== digestHour()) return;
      if (lastDigestDate === date) return;
      lastDigestDate = date;
      const out = await sendDailyDigest(store);
      if (out.skipped) {
        console.log('[founder-digest] skip:', out.reason);
      } else {
        console.log(`[founder-digest] enviado ${out.date} → ${(out.recipients || []).join(', ')}`);
      }
    } catch (err) {
      console.error('[founder-digest]', err.message);
    }
  };

  // Cada 5 min; envía una vez al llegar a la hora Chile.
  digestTimer = setInterval(tick, 5 * 60 * 1000);
  if (typeof digestTimer.unref === 'function') digestTimer.unref();
  setTimeout(tick, 15_000);
  console.log(`[founder-digest] programado ${String(digestHour()).padStart(2, '0')}:00 America/Santiago → FOUNDER_EMAILS`);
  return { enabled: true, hour: digestHour() };
}

/** Helpers tipados para enganchar desde rutas / watchers */
async function alertNewProvider(user) {
  return notifyInstant({
    agent: 'Sofía',
    severity: 'medium',
    title: `Nuevo socio por revisar: ${user?.name || user?.email || '—'}`,
    body: [
      'Se registró un socio nuevo. Revísalo en Admin → Contratos / Verificación.',
      `Nombre: ${user?.name || '—'}`,
      `Email: ${user?.email || '—'}`,
      `Tel: ${user?.phone || '—'}`,
      `ID: ${user?.id || '—'}`
    ].join('\n'),
    dedupeKey: `provider-signup-${user?.id || user?.email}`
  });
}

async function alertSafetyIncident(complaint) {
  const sev = String(complaint?.severity || 'high').toLowerCase();
  const critical = ['s1', 'critical', 'critica', 'alta', 'high'].includes(sev)
    || /robo|amenaza|acoso|agres/i.test(`${complaint?.subject || ''} ${complaint?.categoryId || ''}`);
  return notifyInstant({
    agent: 'Sofía',
    severity: critical ? 'critical' : 'high',
    title: complaint?.subject || 'Incidente de seguridad',
    body: complaint?.description || 'Sin detalle',
    dedupeKey: `safety-${complaint?.id}`,
    link: company.appUrl
      ? `${String(company.appUrl).replace(/\/+$/, '')}#reclamos`
      : null
  });
}

async function alertTechNoShow({ request, reason, previousName }) {
  return notifyInstant({
    agent: 'Sofía',
    severity: 'high',
    title: `Técnico no confirmó / no llegó · ${request?.serviceName || request?.id || ''}`,
    body: [
      `Motivo: ${reason}`,
      `Pedido: ${request?.id}`,
      `Cliente: ${request?.clientName || '—'}`,
      `Socio: ${request?.providerName || request?.providerId || '—'}`,
      previousName ? `Técnico: ${previousName}` : null,
      `Estado: ${request?.status} / ${request?.techStatus || '—'}`
    ].filter(Boolean).join('\n'),
    dedupeKey: `tech-noshow-${request?.id}-${reason}`
  });
}

async function alertIntegrityDispute({ request, summary, source = 'reclamo' }) {
  return notifyInstant({
    agent: 'Sofía',
    severity: 'critical',
    title: `Integridad · ${source}`,
    body: [
      summary,
      request ? `Pedido: ${request.id} · ${request.serviceName || ''}` : null,
      request ? `Cliente: ${request.clientName || '—'}` : null,
      request ? `Socio/técnico: ${request.providerName || '—'} / ${request.technicianName || '—'}` : null
    ].filter(Boolean).join('\n'),
    dedupeKey: `integrity-${request?.id || ''}-${String(summary || '').slice(0, 40)}`
  });
}

module.exports = {
  notifyInstant,
  sendDailyDigest,
  sendUserCensus,
  buildUserCensus,
  startDailyDigestScheduler,
  alertNewProvider,
  alertSafetyIncident,
  alertTechNoShow,
  alertIntegrityDispute,
  countPendingApprovals,
  chileNowParts,
  digestHour,
  recipients
};

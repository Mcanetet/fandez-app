/**
 * Informes diarios / semanales para el admin.
 * Agentes narrativos: Sofía (ops), Clara (finanzas), Florencia (marketing socios).
 */
const alandStore = require('../aland/store');
const routing = require('../aland/routing');

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lunes
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d = new Date()) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}

function inRange(iso, from, to) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function isUrgentRequest(r) {
  const blob = `${r.urgency || ''} ${r.notes || ''} ${r.description || ''} ${r.serviceName || ''}`;
  return routing.looksLikeSafetyEmergency(blob)
    || /urgenc|emergenc|inmediato|gas|inund/i.test(blob)
    || r.urgency === 'urgente'
    || r.urgency === 'emergency';
}

function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(n || 0);
}

function chileDateLabel(d = new Date()) {
  return d.toLocaleDateString('es-CL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Santiago'
  });
}

/** Sofía — actividad operativa del día */
async function buildDailyOpsReport(store, { date = new Date() } = {}) {
  const from = startOfDay(date);
  const to = endOfDay(date);
  const requests = store.getAllRequests() || [];

  const arrived = requests.filter((r) => inRange(r.paidAt || r.createdAt, from, to));
  const resolved = requests.filter((r) => r.status === 'completed' && inRange(r.completedAt || r.updatedAt, from, to));
  const inProcess = requests.filter((r) =>
    ['searching', 'scheduled', 'assigned', 'in_progress'].includes(r.status)
    && r.paymentStatus === 'approved'
  );
  const emergencies = requests.filter((r) =>
    isUrgentRequest(r)
    && (inRange(r.paidAt || r.createdAt, from, to) || ['searching', 'scheduled', 'assigned', 'in_progress'].includes(r.status))
  );
  const complaintsOpen = (store.COMPLAINTS || []).filter((c) => c.status !== 'resuelto');
  const complaintsToday = (store.COMPLAINTS || []).filter((c) => inRange(c.createdAt, from, to));
  const refundsOpen = requests.filter((r) =>
    r.refundStatus === 'requested' || r.refundStatus === 'pending'
  );
  const refundsToday = requests.filter((r) =>
    (r.refundStatus === 'requested' || r.refundStatus === 'pending')
    && inRange(r.refundRequestedAt || r.cancelledAt || r.updatedAt, from, to)
  );
  const newProviders = (store.USERS || []).filter((u) =>
    u.role === 'provider' && inRange(u.memberSince || u.createdAt, from, to)
  );
  const pendingContracts = (store.USERS || []).filter((u) => {
    if (u.role !== 'provider') return false;
    const st = u.providerContract?.review?.status || u.providerContract?.status;
    return st === 'pending_review' || st === 'submitted' || st === 'needs_info';
  });

  let sofiaStats = { conversations: 0, awaitingAdmin: 0, awaitingProvider: 0, resolvedHint: 0 };
  try {
    const convos = await alandStore.listConversations({ limit: 200 });
    const todayConvos = convos.filter((c) => inRange(c.createdAt || c.lastMessageAt, from, to));
    sofiaStats = {
      conversations: todayConvos.length || convos.filter((c) => inRange(c.lastMessageAt, from, to)).length,
      awaitingAdmin: convos.filter((c) => c.status === 'awaiting_admin').length,
      awaitingProvider: convos.filter((c) => c.status === 'awaiting_provider').length,
      activeAi: convos.filter((c) => c.status === 'ai_active').length,
      resolvedHint: convos.filter((c) => c.status === 'closed' && inRange(c.lastMessageAt, from, to)).length
    };
  } catch (_) { /* MySQL opcional */ }

  const highlights = [];
  if (emergencies.length) highlights.push(`${emergencies.length} urgencia(s) activa(s) o del día`);
  if (complaintsOpen.length) highlights.push(`${complaintsOpen.length} reclamo(s) abierto(s)`);
  if (refundsOpen.length) highlights.push(`${refundsOpen.length} devolución(es) pendiente(s)`);
  if (sofiaStats.awaitingAdmin) highlights.push(`${sofiaStats.awaitingAdmin} chat(s) Sofía esperando admin`);
  if (inProcess.filter((r) => r.status === 'searching').length) {
    highlights.push(`${inProcess.filter((r) => r.status === 'searching').length} pedido(s) sin socio`);
  }

  const narrative = [
    `Informe Sofía · ${chileDateLabel(date)}`,
    '',
    `Hoy llegaron ${arrived.length} pedidos pagados/creados. Resolvimos ${resolved.length}. En proceso: ${inProcess.length}.`,
    emergencies.length
      ? `Urgencias a mirar: ${emergencies.slice(0, 5).map((r) => `${r.serviceName || 'servicio'} (${r.clientName || 'cliente'})`).join('; ')}.`
      : 'Sin urgencias críticas marcadas hoy.',
    complaintsToday.length || complaintsOpen.length
      ? `Reclamos: ${complaintsToday.length} nuevos · ${complaintsOpen.length} abiertos.`
      : 'Sin reclamos nuevos.',
    refundsToday.length || refundsOpen.length
      ? `Devoluciones: ${refundsToday.length} pedidas hoy · ${refundsOpen.length} en cola.`
      : 'Sin devoluciones en cola.',
    `Sofía: ${sofiaStats.conversations} actividad hoy · ${sofiaStats.awaitingAdmin} con admin · ${sofiaStats.awaitingProvider} con socio.`,
    newProviders.length ? `Nuevos socios inscritos hoy: ${newProviders.map((p) => p.name).join(', ')}.` : null,
    pendingContracts.length ? `Contratos por revisar: ${pendingContracts.length}.` : null,
    highlights.length ? `Prioridades: ${highlights.join(' · ')}.` : 'Día estable: sin alertas prioritarias.'
  ].filter(Boolean).join('\n');

  return {
    agent: 'Sofía',
    type: 'ops_daily',
    date: from.toISOString().slice(0, 10),
    label: chileDateLabel(date),
    metrics: {
      arrived: arrived.length,
      resolved: resolved.length,
      inProcess: inProcess.length,
      searching: inProcess.filter((r) => r.status === 'searching').length,
      emergencies: emergencies.length,
      complaintsOpen: complaintsOpen.length,
      complaintsToday: complaintsToday.length,
      refundsOpen: refundsOpen.length,
      refundsToday: refundsToday.length,
      newProviders: newProviders.length,
      pendingContracts: pendingContracts.length,
      sofia: sofiaStats
    },
    lists: {
      emergencies: emergencies.slice(0, 12).map(summarizeRequest),
      inProcess: inProcess.slice(0, 15).map(summarizeRequest),
      arrived: arrived.slice(0, 15).map(summarizeRequest),
      resolved: resolved.slice(0, 15).map(summarizeRequest),
      complaints: complaintsOpen.slice(0, 10).map((c) => ({
        id: c.id,
        subject: c.subject || 'Reclamo',
        clientName: c.clientName,
        status: c.status,
        createdAt: c.createdAt
      })),
      refunds: refundsOpen.slice(0, 10).map(summarizeRequest),
      newProviders: newProviders.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone
      }))
    },
    highlights,
    narrative
  };
}

function summarizeRequest(r) {
  return {
    id: r.id,
    serviceName: r.serviceName,
    clientName: r.clientName,
    status: r.status,
    paymentStatus: r.paymentStatus,
    refundStatus: r.refundStatus || null,
    providerName: r.providerName || null,
    amount: r.amountDue || r.amountPaid || 0,
    createdAt: r.createdAt,
    urgent: isUrgentRequest(r)
  };
}

/** Clara — finanzas de la semana */
function buildWeeklyFinanceReport(store, { date = new Date() } = {}) {
  const from = startOfWeek(date);
  const to = endOfWeek(date);
  const finance = store.getFinancialReport();
  const payments = (typeof store.getPayments === 'function' ? store.getPayments() : [])
    .filter((p) => inRange(p.createdAt || p.paidAt, from, to));
  const requests = store.getAllRequests() || [];

  const weekApproved = requests.filter((r) =>
    r.paymentStatus === 'approved' && inRange(r.paidAt || r.createdAt, from, to)
  );
  const weekRevenue = weekApproved.reduce((s, r) => s + (r.amountPaid || r.amountDue || 0), 0);
  const pendingTransfers = requests.filter((r) => r.paymentStatus === 'pending_transfer');
  const payoutPending = (store.getProviderPayouts() || []).filter((p) => p.pending > 0);
  const payrollTotal = payoutPending.reduce((s, p) => s + (p.pending || 0), 0);

  const paymentIssues = [];
  pendingTransfers.forEach((r) => {
    paymentIssues.push({
      type: 'transfer_pending',
      label: 'Transferencia por confirmar',
      detail: `${r.clientName || 'Cliente'} · ${r.serviceName} · ${formatCLP(r.amountDue || 0)}`,
      id: r.id
    });
  });
  requests.filter((r) => r.refundStatus === 'requested' || r.refundStatus === 'pending').forEach((r) => {
    paymentIssues.push({
      type: 'refund',
      label: 'Devolución pendiente',
      detail: `${r.clientName || 'Cliente'} · ${r.serviceName} · ${formatCLP(r.refundAmount || r.amountPaid || 0)} · vence ${r.refundScheduledDate || '—'}`,
      id: r.id
    });
  });

  // IVA (Chile): recordatorio operativo — periodo anterior
  const now = date;
  const ivaPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ivaLabel = ivaPeriod.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const day = now.getDate();
  const ivaDueSoon = day >= 1 && day <= 12;

  const checklist = [
    {
      id: 'cashflow',
      title: 'Flujo de caja (semana)',
      status: weekRevenue > 0 ? 'ok' : 'watch',
      detail: `Ingresos aprobados semana: ${formatCLP(weekRevenue)} · ${weekApproved.length} cobros`
    },
    {
      id: 'payroll',
      title: 'Nómina / transferencias a socios',
      status: payrollTotal > 0 ? 'action' : 'ok',
      detail: payrollTotal > 0
        ? `Por transferir: ${formatCLP(payrollTotal)} a ${payoutPending.length} socio(s)`
        : 'No hay payouts pendientes'
    },
    {
      id: 'iva',
      title: `Pagar / declarar IVA (${ivaLabel})`,
      status: ivaDueSoon ? 'action' : 'info',
      detail: ivaDueSoon
        ? 'Ventana típica de declaración/pago del mes anterior. Revisa boletas/facturas emitidas en Documentos.'
        : 'Fuera de la ventana crítica; mantén conciliación al día.'
    },
    {
      id: 'sofia_payments',
      title: 'Problemas de pago / devoluciones (Sofía)',
      status: paymentIssues.length ? 'action' : 'ok',
      detail: paymentIssues.length
        ? `${paymentIssues.length} caso(s) — ver detalle abajo`
        : 'Sin alertas de transferencia o devolución'
    }
  ];

  const narrative = [
    `Informe Clara (Finanzas) · semana del ${from.toLocaleDateString('es-CL')} al ${to.toLocaleDateString('es-CL')}`,
    '',
    `Caja semana: ${formatCLP(weekRevenue)} en ${weekApproved.length} cobros. Comisión app acumulada (reporte): ${formatCLP(finance.summary?.appCommission || 0)}.`,
    `A transferir a socios: ${formatCLP(payrollTotal)}.`,
    ivaDueSoon ? `Atención IVA periodo ${ivaLabel}: prioriza declaración/pago.` : `IVA ${ivaLabel}: seguimiento rutinario.`,
    paymentIssues.length
      ? `Sofía/ops detectó ${paymentIssues.length} fricción(es) de pago o devolución. Revisar Pagos + Mensajes.`
      : 'Sin fricciones de pago abiertas.',
    `Pendientes de transferencia cliente: ${pendingTransfers.length} · ${formatCLP(finance.summary?.pendingTransferAmount || 0)}.`
  ].join('\n');

  return {
    agent: 'Clara',
    type: 'finance_weekly',
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    metrics: {
      weekRevenue,
      weekPayments: weekApproved.length,
      payrollTotal,
      payrollPartners: payoutPending.length,
      pendingTransfers: pendingTransfers.length,
      pendingTransferAmount: finance.summary?.pendingTransferAmount || 0,
      appCommission: finance.summary?.appCommission || 0,
      providerPending: finance.summary?.providerPending || 0,
      paymentIssues: paymentIssues.length
    },
    checklist,
    paymentIssues: paymentIssues.slice(0, 20),
    payroll: payoutPending
      .sort((a, b) => (b.pending || 0) - (a.pending || 0))
      .slice(0, 15)
      .map((p) => ({
        providerId: p.provider?.id,
        name: p.provider?.name,
        pending: p.pending,
        paid: p.paid,
        jobs: p.jobs
      })),
    narrative
  };
}

/** Calendario septiembre — incorporación de socios (Florencia) */
const SEPT_HOOKS = [
  { hook: 'Pedidos listos. Tú eliges.', angle: 'Control del socio' },
  { hook: '¿Sigues cotizando por WhatsApp?', angle: 'Dolor cotización' },
  { hook: 'Demanda calificada en tu zona.', angle: 'Zona Santiago' },
  { hook: 'Cliente ya pidió. Tú decides.', angle: 'Sin pelear presupuesto' },
  { hook: 'Registro en minutos. Activación guiada.', angle: 'Honestidad funnel' },
  { hook: 'Gasfitería y electricidad con respaldo.', angle: 'Especialidades' },
  { hook: 'No eres empleado. Eres socio.', angle: 'Posicionamiento' },
  { hook: 'Abre cupos Fandez en Santiago.', angle: 'Escasez / cupos' },
  { hook: 'Pago con respaldo. Operación clara.', angle: 'Confianza' },
  { hook: 'Deja de pelear por el presupuesto.', angle: 'Conversión' }
];

const SEPT_CHANNELS = ['instagram', 'tiktok', 'linkedin', 'instagram_story'];

function buildSeptemberPartnerCalendar(year = 2026) {
  const days = [];
  const dim = 30; // septiembre
  for (let day = 1; day <= dim; day++) {
    const date = new Date(year, 8, day); // mes 8 = septiembre
    const hook = SEPT_HOOKS[(day - 1) % SEPT_HOOKS.length];
    const channel = SEPT_CHANNELS[(day - 1) % SEPT_CHANNELS.length];
    const weekday = date.toLocaleDateString('es-CL', { weekday: 'short' });
    const copy = buildDayCopy(day, hook, channel);
    days.push({
      date: `${year}-09-${String(day).padStart(2, '0')}`,
      day,
      weekday,
      channel,
      campaign: 'Incorporación socios · Septiembre',
      hook: hook.hook,
      angle: hook.angle,
      caption: copy.caption,
      cta: 'Quiero ser socio',
      link: '/registro?role=provider',
      hashtags: ['#Fandez', '#SociosFandez', '#ServiciosSantiago', '#EmprendimientoChile'],
      storyText: copy.story,
      checklist: [
        'Publicar en canal del día',
        'Responder DMs en <2 h',
        'Enviar link registro socio',
        'Anotar leads en CRM'
      ]
    });
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const todayItem = days.find((d) => d.date === todayKey) || days[Math.min(today.getDate(), 30) - 1];

  const narrative = [
    `Informe Florencia · Campaña incorporación socios · Septiembre ${year}`,
    '',
    'Todo el mes: un solo objetivo — que empresas y profesionales se registren como socios.',
    `Hoy (${todayItem?.date}): canal ${todayItem?.channel} · “${todayItem?.hook}”.`,
    `CTA único todo el mes: Quiero ser socio → fandez.cl/registro?role=provider`,
    'No prometas “cobras en un minuto”. Di: cuenta rápida + activación guiada 24–72 h.',
    `Piezas del mes: ${days.length}. Revisa el calendario diario abajo y copia el caption.`
  ].join('\n');

  return {
    agent: 'Florencia',
    type: 'marketing_september_partners',
    year,
    month: 9,
    theme: 'Incorporación de socios',
    today: todayItem,
    days,
    narrative
  };
}

function buildDayCopy(day, hook, channel) {
  const base = [
    `${hook.hook}`,
    '',
    'Fandez conecta empresas de servicios del hogar con clientes que ya pidieron en Santiago.',
    'Entras como socio, activas cobertura y tomas lo que te sirve.',
    '',
    'CTA: Quiero ser socio → fandez.cl/registro'
  ].join('\n');

  const linkedin = [
    `Estamos abriendo cupos de socios Fandez en Santiago (${hook.angle.toLowerCase()}).`,
    '',
    hook.hook,
    '',
    'Buscamos empresas formales de gasfitería, electricidad, cerrajería y afines.',
    'Postula: fandez.cl/registro (rol Socio).',
    '',
    '#Fandez #SociosFandez'
  ].join('\n');

  const story = `${hook.hook}\n\nRegístrate gratis\nfandez.cl/registro`;

  const tiktok = [
    `Hook: ${hook.hook}`,
    'Guion 15s: Cliente ya pidió → ves dirección y lo que te pagan → tomas o pasas.',
    'Cierre: Link en bio · Quiero ser socio.'
  ].join('\n');

  let caption = base;
  if (channel === 'linkedin') caption = linkedin;
  if (channel === 'tiktok') caption = tiktok;
  if (channel === 'instagram_story') caption = story;

  // Variación por día del mes
  if (day % 7 === 0) {
    caption += '\n\nEsta semana: activación asistida por WhatsApp a cada registro.';
  }

  return { caption, story };
}

async function buildInformesBundle(store, { date = new Date() } = {}) {
  const [ops] = await Promise.all([
    buildDailyOpsReport(store, { date })
  ]);
  const finance = buildWeeklyFinanceReport(store, { date });
  const marketing = buildSeptemberPartnerCalendar(date.getFullYear() >= 2026 ? date.getFullYear() : 2026);
  return {
    generatedAt: new Date().toISOString(),
    ops,
    finance,
    marketing
  };
}

module.exports = {
  buildDailyOpsReport,
  buildWeeklyFinanceReport,
  buildSeptemberPartnerCalendar,
  buildInformesBundle,
  formatCLP
};

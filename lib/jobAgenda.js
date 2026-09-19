/**
 * Agenda ligera Hoy / Mañana / Después para Mis trabajos (socio y técnico).
 * No es calendario de disponibilidad: solo clasifica pedidos Fandez ya tomados.
 */

const IN_PROGRESS_TECH = new Set([
  'aceptado',
  'en_camino',
  'en_sitio',
  'diagnostico',
  'reparando',
  'comprando',
  'materiales_pendiente',
  'presupuesto_pendiente',
  'presupuesto_aprobado'
]);

const TODAY_TIERS = new Set(['immediate', 'today', 'critical', 'medium', '']);

function startOfLocalDay(date, timeZone = 'America/Santiago') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  // Mediodía local como ancla estable para comparar YMD sin saltos DST raros.
  return `${y}-${m}-${d}`;
}

function addCalendarDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function estimateVisitYmd(request, timeZone = 'America/Santiago') {
  const tier = String(request?.urgencyTier || '').toLowerCase();
  const baseIso = request?.paidAt || request?.createdAt || request?.assignedAt || null;
  const base = baseIso ? new Date(baseIso) : new Date();
  const baseYmd = startOfLocalDay(Number.isNaN(base.getTime()) ? new Date() : base, timeZone);

  if (TODAY_TIERS.has(tier)) return baseYmd;
  if (tier === 'tomorrow') return addCalendarDaysYmd(baseYmd, 1);
  if (tier === 'two_days') return addCalendarDaysYmd(baseYmd, 2);

  if (tier === 'scheduled') {
    const searchAt = Date.parse(request?.scheduledSearchAt || '');
    if (Number.isFinite(searchAt)) {
      // La búsqueda arranca ~horas antes; la visita cae el mismo día local de esa ventana + margen.
      return startOfLocalDay(new Date(searchAt + 4 * 3600 * 1000), timeZone);
    }
    return addCalendarDaysYmd(baseYmd, 1);
  }

  return baseYmd;
}

/**
 * @returns {'today'|'tomorrow'|'later'}
 */
function getRequestAgendaDay(request, { now = new Date(), timeZone = 'America/Santiago' } = {}) {
  if (!request) return 'today';

  if (
    request.status === 'in_progress'
    || IN_PROGRESS_TECH.has(String(request.techStatus || ''))
  ) {
    return 'today';
  }

  const todayYmd = startOfLocalDay(now, timeZone);
  const tomorrowYmd = addCalendarDaysYmd(todayYmd, 1);
  const visitYmd = estimateVisitYmd(request, timeZone);

  if (visitYmd <= todayYmd) return 'today';
  if (visitYmd === tomorrowYmd) return 'tomorrow';
  return 'later';
}

function agendaDaySortRank(day) {
  if (day === 'today') return 0;
  if (day === 'tomorrow') return 1;
  return 2;
}

function urgencySortRank(tier) {
  const t = String(tier || '').toLowerCase();
  if (t === 'immediate' || t === 'critical') return 0;
  if (t === 'medium') return 1;
  if (t === 'today' || t === '') return 2;
  if (t === 'tomorrow') return 3;
  if (t === 'two_days') return 4;
  if (t === 'scheduled') return 5;
  return 6;
}

function compareAgendaRequests(a, b) {
  const dayDiff = agendaDaySortRank(a.agendaDay) - agendaDaySortRank(b.agendaDay);
  if (dayDiff) return dayDiff;
  const urgDiff = urgencySortRank(a.urgencyTier) - urgencySortRank(b.urgencyTier);
  if (urgDiff) return urgDiff;
  const aAt = Date.parse(a.assignedAt || a.createdAt || 0) || 0;
  const bAt = Date.parse(b.assignedAt || b.createdAt || 0) || 0;
  return aAt - bAt;
}

function withAgendaDay(request, opts) {
  if (!request) return request;
  const agendaDay = getRequestAgendaDay(request, opts);
  const visitYmd = estimateVisitYmd(request, opts?.timeZone || 'America/Santiago');
  return { ...request, agendaDay, agendaVisitYmd: visitYmd };
}

function groupRequestsByAgendaDay(list = [], opts) {
  const groups = { today: [], tomorrow: [], later: [] };
  (list || []).forEach((raw) => {
    const row = raw?.agendaDay ? raw : withAgendaDay(raw, opts);
    const key = row.agendaDay === 'tomorrow' || row.agendaDay === 'later' ? row.agendaDay : 'today';
    groups[key].push(row);
  });
  groups.today.sort(compareAgendaRequests);
  groups.tomorrow.sort(compareAgendaRequests);
  groups.later.sort(compareAgendaRequests);
  return groups;
}

module.exports = {
  getRequestAgendaDay,
  estimateVisitYmd,
  withAgendaDay,
  groupRequestsByAgendaDay,
  compareAgendaRequests
};

/**
 * Agenda de visitas programadas (mañana / pasado mañana).
 * El técnico propone fecha+hora; el cliente confirma o pide otro horario por chat.
 */

const DEFERRED_TIERS = new Set(['tomorrow', 'two_days', 'scheduled']);

const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00',
  '14:00', '15:00', '16:00', '17:00', '18:00'
];

function isDeferredUrgencyTier(tierId) {
  return DEFERRED_TIERS.has(String(tierId || '').toLowerCase());
}

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

/** Fecha sugerida (YYYY-MM-DD) según el tier del pedido. */
function defaultVisitYmdForTier(tierId, { now = new Date(), timeZone = 'America/Santiago' } = {}) {
  const today = startOfLocalDay(now, timeZone);
  const tier = String(tierId || '').toLowerCase();
  if (tier === 'tomorrow') return addCalendarDaysYmd(today, 1);
  if (tier === 'two_days') return addCalendarDaysYmd(today, 2);
  if (tier === 'scheduled') return addCalendarDaysYmd(today, 1);
  return today;
}

function allowedVisitYmds(tierId, { now = new Date(), timeZone = 'America/Santiago' } = {}) {
  const today = startOfLocalDay(now, timeZone);
  const tier = String(tierId || '').toLowerCase();
  if (tier === 'tomorrow') {
    return [addCalendarDaysYmd(today, 1), addCalendarDaysYmd(today, 2)];
  }
  if (tier === 'two_days') {
    return [addCalendarDaysYmd(today, 2), addCalendarDaysYmd(today, 3)];
  }
  if (tier === 'scheduled') {
    return [
      addCalendarDaysYmd(today, 1),
      addCalendarDaysYmd(today, 2),
      addCalendarDaysYmd(today, 3)
    ];
  }
  return [today, addCalendarDaysYmd(today, 1)];
}

/**
 * Interpreta fecha local + hora HH:mm como instante ISO (zona Chile).
 * Usa mediodía offset via Date con componentes en America/Santiago aproximado
 * con toLocale — construimos ISO con offset fijo -03:00 / -04:00 vía Intl.
 */
function parseLocalDateTimeToIso(dateYmd, timeHm, timeZone = 'America/Santiago') {
  const ymd = String(dateYmd || '').trim();
  const hm = String(timeHm || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { error: 'Fecha inválida.' };
  if (!/^\d{2}:\d{2}$/.test(hm)) return { error: 'Hora inválida.' };
  if (!TIME_SLOTS.includes(hm)) {
    return { error: 'Elige un horario de la lista.' };
  }

  // Ancla UTC mediodía del día y busca el offset local real con Intl.
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(probe);
  const tzName = offsetParts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-3';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  let offsetMinutes = -180;
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10) || 0;
    const mins = parseInt(match[3] || '0', 10) || 0;
    offsetMinutes = sign * (hours * 60 + mins);
  }
  // Local wall time → UTC: utc = local - offset (offset is local-minus-UTC in our GMT±N).
  // GMT-3 means local = UTC-3, so UTC = local + 3h → subtract negative offset.
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - offsetMinutes * 60 * 1000;
  const iso = new Date(utcMs).toISOString();
  if (Number.isNaN(Date.parse(iso))) return { error: 'Fecha u hora inválida.' };
  return { iso, dateYmd: ymd, timeHm: hm };
}

function formatVisitLabel(iso, locale = 'es') {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '';
  const en = String(locale || '').toLowerCase().startsWith('en');
  return new Intl.DateTimeFormat(en ? 'en-US' : 'es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(ms));
}

function validateProposedVisit(request, { proposedVisitAt, date, time } = {}) {
  let iso = proposedVisitAt ? String(proposedVisitAt).trim() : '';
  if (!iso && date && time) {
    const parsed = parseLocalDateTimeToIso(date, time);
    if (parsed.error) return parsed;
    iso = parsed.iso;
  }
  if (!iso || !Number.isFinite(Date.parse(iso))) {
    return { error: 'Propón fecha y hora de visita.' };
  }
  const ms = Date.parse(iso);
  if (ms < Date.now() - 5 * 60 * 1000) {
    return { error: 'La visita no puede ser en el pasado.' };
  }
  const ymd = startOfLocalDay(new Date(ms));
  const allowed = allowedVisitYmds(request?.urgencyTier);
  // Permitir cualquier día futuro razonable (hasta 7 días) además del rango del tier.
  const today = startOfLocalDay(new Date());
  const maxYmd = addCalendarDaysYmd(today, 7);
  if (ymd < today || ymd > maxYmd) {
    return { error: 'Elige una fecha dentro de los próximos 7 días.' };
  }
  if (allowed.length && !allowed.includes(ymd) && ymd > addCalendarDaysYmd(today, 3)) {
    return { error: 'Esa fecha no coincide con la urgencia del pedido.' };
  }
  return {
    iso,
    label: formatVisitLabel(iso, 'es'),
    dateYmd: ymd
  };
}

function scheduleFields(request) {
  return {
    scheduleStatus: request.scheduleStatus || null,
    proposedVisitAt: request.proposedVisitAt || null,
    scheduledVisitAt: request.scheduledVisitAt || null,
    scheduleLabel: request.scheduleLabel
      || formatVisitLabel(request.scheduledVisitAt || request.proposedVisitAt || '')
      || null,
    needsSchedule: isDeferredUrgencyTier(request.urgencyTier)
      && !['confirmed'].includes(String(request.scheduleStatus || ''))
      && !request.scheduledVisitAt
  };
}

module.exports = {
  DEFERRED_TIERS,
  TIME_SLOTS,
  isDeferredUrgencyTier,
  defaultVisitYmdForTier,
  allowedVisitYmds,
  parseLocalDateTimeToIso,
  formatVisitLabel,
  validateProposedVisit,
  scheduleFields,
  startOfLocalDay,
  addCalendarDaysYmd
};

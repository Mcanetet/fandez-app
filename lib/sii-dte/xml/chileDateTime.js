/**
 * Fecha-hora Chile (America/Santiago) para DTE: AAAA-MM-DDTHH:MM:SS
 * Algunos runtimes (ICU) devuelven hour=24 cerca de medianoche → inválido en XSD.
 */
'use strict';

function formatChileDateTime(input = null) {
  const d = input == null || input === ''
    ? new Date()
    : (input instanceof Date ? input : new Date(input));
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    let hour = get('hour');
    // ICU: 24:xx → 00:xx del mismo día civil reportado
    if (hour === '24') hour = '00';
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
  } catch (_) {
    return d.toISOString().replace(/\.\d{3}Z$/, '').replace(/Z$/, '').slice(0, 19);
  }
}

function formatChileDate(input = null) {
  return formatChileDateTime(input).slice(0, 10);
}

module.exports = {
  formatChileDateTime,
  formatChileDate
};

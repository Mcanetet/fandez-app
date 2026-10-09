/**
 * Calendario ligero para proponer visita en pedidos programados (mañana / pasado mañana).
 */
(function (global) {
  const TIME_SLOTS = [
    '09:00', '10:00', '11:00', '12:00',
    '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  function isDeferredTier(tier) {
    return ['tomorrow', 'two_days', 'scheduled'].includes(String(tier || '').toLowerCase());
  }

  function ymdLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysYmd(ymd, days) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return ymdLocal(dt);
  }

  function defaultYmdForTier(tier) {
    const today = ymdLocal(new Date());
    const t = String(tier || '').toLowerCase();
    if (t === 'tomorrow') return addDaysYmd(today, 1);
    if (t === 'two_days') return addDaysYmd(today, 2);
    return addDaysYmd(today, 1);
  }

  function allowedYmds(tier) {
    const today = ymdLocal(new Date());
    const t = String(tier || '').toLowerCase();
    if (t === 'tomorrow') return [addDaysYmd(today, 1), addDaysYmd(today, 2)];
    if (t === 'two_days') return [addDaysYmd(today, 2), addDaysYmd(today, 3)];
    return [addDaysYmd(today, 1), addDaysYmd(today, 2), addDaysYmd(today, 3)];
  }

  function formatDayLabel(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    try {
      return dt.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (_) {
      return ymd;
    }
  }

  /**
   * @returns {Promise<{ proposedVisitAt: string, visitDate: string, visitTime: string }|null>}
   */
  function askCalendar({ urgencyTier, title, subtitle } = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById('visitScheduleModal');
      if (existing) existing.remove();

      const days = allowedYmds(urgencyTier);
      const defaultDay = defaultYmdForTier(urgencyTier);
      let selectedDay = days.includes(defaultDay) ? defaultDay : days[0];
      let selectedTime = '10:00';

      const modal = document.createElement('div');
      modal.id = 'visitScheduleModal';
      modal.className = 'fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/50';
      modal.innerHTML = `
        <div class="w-full max-w-md rounded-2xl bg-zilo-surface border border-zilo-border p-5 shadow-xl max-h-[90vh] overflow-y-auto">
          <p class="text-xs font-semibold text-zilo-accent mb-1">Visita programada</p>
          <h3 class="text-base font-semibold mb-1">${title || 'Agenda con el cliente'}</h3>
          <p class="text-xs text-zilo-muted mb-4">${subtitle || 'Elige día y hora. El cliente confirmará o pedirá otro horario por chat.'}</p>
          <p class="text-[11px] font-semibold text-zilo-muted mb-2">Día</p>
          <div class="grid grid-cols-1 gap-2 mb-4" data-role="day-options"></div>
          <p class="text-[11px] font-semibold text-zilo-muted mb-2">Hora</p>
          <div class="grid grid-cols-3 gap-2 mb-4" data-role="time-options"></div>
          <button type="button" data-role="schedule-confirm" class="w-full py-3 rounded-xl zilo-btn-primary !text-sm mb-2">Proponer y hablar</button>
          <button type="button" data-role="schedule-cancel" class="w-full py-2.5 rounded-xl zilo-btn-ghost !text-sm">Cancelar</button>
        </div>`;

      const dayBox = modal.querySelector('[data-role="day-options"]');
      const timeBox = modal.querySelector('[data-role="time-options"]');

      function paintDays() {
        dayBox.innerHTML = '';
        days.forEach((ymd) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = ymd === selectedDay
            ? 'w-full py-3 px-3 rounded-xl border border-zilo-accent bg-zilo-accent/10 text-sm font-semibold'
            : 'w-full py-3 px-3 rounded-xl border border-zilo-border bg-zilo-bg/60 text-sm font-semibold hover:border-zilo-accent';
          btn.textContent = formatDayLabel(ymd);
          btn.addEventListener('click', () => {
            selectedDay = ymd;
            paintDays();
          });
          dayBox.appendChild(btn);
        });
      }

      function paintTimes() {
        timeBox.innerHTML = '';
        TIME_SLOTS.forEach((hm) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = hm === selectedTime
            ? 'py-2.5 rounded-xl border border-zilo-accent bg-zilo-accent/10 text-xs font-semibold'
            : 'py-2.5 rounded-xl border border-zilo-border bg-zilo-bg/60 text-xs font-semibold hover:border-zilo-accent';
          btn.textContent = hm;
          btn.addEventListener('click', () => {
            selectedTime = hm;
            paintTimes();
          });
          timeBox.appendChild(btn);
        });
      }

      paintDays();
      paintTimes();

      function close(value) {
        modal.remove();
        resolve(value);
      }

      modal.querySelector('[data-role="schedule-confirm"]').addEventListener('click', () => {
        // ISO aproximado Chile (el servidor valida y normaliza).
        const proposedVisitAt = `${selectedDay}T${selectedTime}:00-03:00`;
        close({
          proposedVisitAt,
          visitDate: selectedDay,
          visitTime: selectedTime
        });
      });
      modal.querySelector('[data-role="schedule-cancel"]').addEventListener('click', () => close(null));
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) close(null);
      });
      document.body.appendChild(modal);
    });
  }

  global.FandezVisitSchedule = {
    isDeferredTier,
    askCalendar,
    TIME_SLOTS,
    defaultYmdForTier
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  function ymd(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function monthLabel(year, month) {
    try {
      return new Date(year, month, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    } catch (_) {
      return `${month + 1}/${year}`;
    }
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function startGrid(year, month) {
    const first = new Date(year, month, 1);
    const mondayBased = (first.getDay() + 6) % 7;
    return mondayBased;
  }

  function bindCalendar(root) {
    const events = (() => {
      try {
        return JSON.parse(root.querySelector('[data-cal-events]')?.textContent || '[]');
      } catch (_) {
        return [];
      }
    })();
    const byDay = {};
    events.forEach((ev) => {
      if (!ev?.ymd) return;
      if (!byDay[ev.ymd]) byDay[ev.ymd] = [];
      byDay[ev.ymd].push(ev);
    });

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let selected = '';

    const grid = root.querySelector('[data-cal-grid]');
    const monthEl = root.querySelector('[data-cal-month]');
    const list = root.querySelector('[data-cal-day-list]');

    function paintList(day) {
      if (!list) return;
      const items = byDay[day] || [];
      if (!items.length) {
        list.hidden = true;
        list.innerHTML = '';
        return;
      }
      list.hidden = false;
      list.innerHTML = items.map((ev) => {
        const meta = [ev.technicianName, ev.address || ev.subtitle].filter(Boolean).join(' · ');
        return `
        <a class="job-cal__item" href="${esc(ev.href || '#')}">
          <span class="job-cal__item-title">${esc(ev.title || 'Visita')}${ev.timeLabel ? ` · ${esc(ev.timeLabel)}` : ''}</span>
          ${meta ? `<span class="job-cal__item-meta">${esc(meta)}</span>` : ''}
        </a>`;
      }).join('');
    }

    function paint() {
      if (monthEl) monthEl.textContent = monthLabel(year, month);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const pad = startGrid(year, month);
      const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());
      let html = '';
      for (let i = 0; i < pad; i += 1) html += '<span class="job-cal__cell is-pad"></span>';
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = ymd(year, month, d);
        const count = (byDay[key] || []).length;
        const cls = [
          'job-cal__cell',
          count ? 'has-jobs' : '',
          key === today ? 'is-today' : '',
          key === selected ? 'is-on' : ''
        ].filter(Boolean).join(' ');
        html += `<button type="button" class="${cls}" data-ymd="${key}">${d}${count ? `<i>${count}</i>` : ''}</button>`;
      }
      grid.innerHTML = html;
      paintList(selected);
    }

    grid.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-ymd]');
      if (!btn) return;
      selected = btn.dataset.ymd;
      paint();
    });
    root.querySelector('[data-cal-prev]')?.addEventListener('click', () => {
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
      paint();
    });
    root.querySelector('[data-cal-next]')?.addEventListener('click', () => {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      paint();
    });
    paint();
  }

  document.querySelectorAll('[data-job-calendar]').forEach(bindCalendar);
}());

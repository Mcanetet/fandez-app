/**
 * Fandez Admin PWA — bandeja de alertas en el celular.
 */
(function () {
  const BASE = window.FandezAdminBase || '/admin';
  const CSRF = window.FandezCsrf || '';
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const toastEl = document.getElementById('toast');
  const hintEl = document.getElementById('installHint');
  const filterHintEl = document.getElementById('filterHint');

  let allItems = [];
  let activeFilter = 'open';

  const FILTER_HINTS = {
    open: 'Mostrando alertas abiertas',
    critical: 'Mostrando alertas críticas abiertas',
    today: 'Mostrando alertas de hoy (abiertas y resueltas)'
  };

  const EMPTY_MSG = {
    open: 'Sin alertas abiertas. Sofía / Clara te avisarán aquí y por correo.',
    critical: 'Sin alertas críticas abiertas.',
    today: 'Sin alertas registradas hoy.'
  };

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(() => { toastEl.style.display = 'none'; }, 2600);
  }

  function sevClass(s) {
    const v = String(s || '').toLowerCase();
    if (['critical', 's1', 'critica', 'alta', 'high'].includes(v)) return 'critical';
    return '';
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
    } catch (_) {
      return iso || '';
    }
  }

  function isTodayChile(iso) {
    if (!iso) return false;
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const key = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      return key === today;
    } catch (_) {
      return false;
    }
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.method && opts.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (CSRF) headers['X-CSRF-Token'] = CSRF;
    }
    const res = await fetch(`${BASE}${path}`, Object.assign({}, opts, { headers, credentials: 'same-origin' }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function filterItems(items, filter) {
    if (filter === 'critical') {
      return items.filter((i) => i.status === 'open' && sevClass(i.severity) === 'critical');
    }
    if (filter === 'today') {
      return items.filter((i) => isTodayChile(i.createdAt));
    }
    return items.filter((i) => i.status === 'open');
  }

  function updateStats(items) {
    const open = items.filter((i) => i.status === 'open');
    const crit = open.filter((i) => sevClass(i.severity) === 'critical').length;
    const todayN = items.filter((i) => isTodayChile(i.createdAt)).length;
    const openEl = document.getElementById('statOpen');
    const critEl = document.getElementById('statCrit');
    const todayEl = document.getElementById('statToday');
    if (openEl) openEl.textContent = String(open.length);
    if (critEl) critEl.textContent = String(crit);
    if (todayEl) todayEl.textContent = String(todayN);
  }

  function setActiveFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.stat[data-filter]').forEach((btn) => {
      const on = btn.dataset.filter === filter;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (filterHintEl) filterHintEl.textContent = FILTER_HINTS[filter] || FILTER_HINTS.open;
    renderList();
  }

  function renderList() {
    const filtered = filterItems(allItems, activeFilter);
    if (!filtered.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.textContent = EMPTY_MSG[activeFilter] || EMPTY_MSG.open;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = filtered.map((item) => {
      const resolved = item.status !== 'open';
      const cardClass = ['card', sevClass(item.severity), resolved ? 'resolved' : ''].filter(Boolean).join(' ');
      const statusNote = resolved ? ' · resuelta' : '';
      return `
      <article class="${cardClass}" data-id="${item.id}">
        <div class="meta">${item.agent || 'Agente'} · ${item.severity || '—'} · ${when(item.createdAt)}${statusNote}</div>
        <h2 class="title">${escapeHtml(item.title || '')}</h2>
        <div class="body">${escapeHtml(item.body || '')}</div>
        <div class="row">
          ${item.link ? `<a class="btn btn-amber" href="${escapeAttr(item.link)}">Abrir</a>` : ''}
          ${!resolved ? `<button type="button" class="btn" data-resolve="${item.id}">Marcar resuelto</button>` : ''}
        </div>
      </article>
    `;
    }).join('');
  }

  function render(items) {
    allItems = items || [];
    updateStats(allItems);
    renderList();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function load() {
    const data = await api('/ops-inbox?limit=80');
    render(data.items || []);
  }

  document.querySelectorAll('.stat[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveFilter(btn.dataset.filter || 'open'));
  });

  listEl?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-resolve]');
    if (!btn) return;
    const id = btn.getAttribute('data-resolve');
    btn.disabled = true;
    try {
      await api(`/ops-inbox/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: '{}' });
      toast('Resuelto');
      await load();
      setActiveFilter(activeFilter);
    } catch (err) {
      toast(err.message || 'Error');
      btn.disabled = false;
    }
  });

  document.getElementById('btnPush')?.addEventListener('click', async () => {
    try {
      if (window.FandezAlerts?.enablePush) {
        const ok = await window.FandezAlerts.enablePush();
        toast(ok?.ok ? 'Avisos del sistema activados' : (`No se pudo activar: ${ok?.reason || 'permiso'}`));
      } else {
        toast('Push no disponible en este navegador');
      }
    } catch (err) {
      toast(err.message || 'Error push');
    }
  });

  // Ocultar hint si ya está en standalone
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    if (hintEl) {
      hintEl.textContent = 'App instalada. Activa avisos para recibir alertas con el celular bloqueado.';
      hintEl.style.background = '#052e16';
      hintEl.style.borderColor = '#166534';
      hintEl.style.color = '#86efac';
    }
  } else if (hintEl) {
    hintEl.innerHTML = 'Para que quede como app: ve a <a href="' + BASE + '/instalar-admin" style="color:#fbbf8a;font-weight:700">Instalar en el celular</a> (ícono negro en la pantalla de inicio).';
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js?v=41', { scope: '/' })
      .catch(() => navigator.serviceWorker.register('/sw.js?v=41', { scope: '/' }).catch(() => {}));
  }

  load().catch((err) => toast(err.message || 'No se pudo cargar'));
  setInterval(() => { load().catch(() => {}); }, 45000);
})();

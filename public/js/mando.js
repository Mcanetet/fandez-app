(function () {
  const notify = (msg, type) => { if (window.FandezNotify) window.FandezNotify.show(msg, type); };
  const myRole = 'provider';
  let activeChatId = null;

  const chatModal = document.getElementById('jobChatModal');
  const chatThread = document.getElementById('jobChatThread');
  const chatTitle = document.getElementById('jobChatTitle');
  const chatForm = document.getElementById('jobChatForm');
  const chatInput = document.getElementById('jobChatInput');

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-CL', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function roleLabel(senderType) {
    if (senderType === 'provider') return 'Socio';
    if (senderType === 'tecnico') return 'Técnico';
    if (senderType === 'client') return 'Cliente';
    return 'Fandez';
  }

  function displayName(msg) {
    const raw = String(msg.senderName || '').trim();
    const role = roleLabel(msg.senderType);
    if (!raw) return role;
    if (raw.includes('·')) return raw.split('·')[0].trim() || role;
    if (/^(socio|técnico|tecnico|cliente|fandez)/i.test(raw)) return raw;
    return raw;
  }

  function renderMessage(msg) {
    const isSystem = msg.senderType === 'system';
    const isMine = !isSystem && msg.senderType === myRole;
    const role = msg.senderType || 'system';
    const cls = isSystem
      ? 'job-chat-bubble--system'
      : `job-chat-bubble ${isMine ? 'job-chat-bubble--mine' : 'job-chat-bubble--theirs'} job-chat-bubble--role-${role}`;
    if (isSystem) {
      return `<div class="job-chat-bubble job-chat-bubble--system" data-msg-id="${escapeHtml(msg.id)}">${escapeHtml(msg.body)}</div>`;
    }
    const meta = `
      <span class="job-chat-meta">
        <span class="job-chat-role job-chat-role--${role}">${escapeHtml(roleLabel(role))}</span>
        <span class="job-chat-name">${escapeHtml(displayName(msg))}</span>
        <span class="job-chat-meta__time">${escapeHtml(formatTime(msg.createdAt))}</span>
      </span>`;
    return `<div class="${cls}" data-msg-id="${escapeHtml(msg.id)}">${meta}${escapeHtml(msg.body)}</div>`;
  }

  function appendMessage(msg) {
    if (!chatThread || !msg?.id) return;
    if (chatThread.querySelector(`[data-msg-id="${msg.id}"]`)) return;
    chatThread.insertAdjacentHTML('beforeend', renderMessage(msg));
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function openChat(requestId, peerName) {
    if (!chatModal || !requestId) return;
    activeChatId = requestId;
    if (chatTitle) chatTitle.textContent = peerName || 'Cliente';
    if (chatThread) chatThread.innerHTML = '<p class="text-xs text-zilo-muted text-center">Cargando…</p>';
    chatModal.classList.remove('hidden');
    try {
      const res = await fetch(`/proveedor/chat/${requestId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo abrir el chat');
      if (chatTitle && data.peerName) chatTitle.textContent = data.peerName;
      const youAre = document.getElementById('jobChatYouAre');
      if (youAre && data.youAre) youAre.textContent = `Escribes como ${data.youAre}`;
      if (chatThread) {
        chatThread.innerHTML = (data.messages || []).map(renderMessage).join('')
          || '<p class="text-xs text-zilo-muted text-center px-4">Sin mensajes aún. Saluda al cliente para coordinar.</p>';
        chatThread.scrollTop = chatThread.scrollHeight;
      }
      if (typeof io !== 'undefined') {
        const socket = window.__fandezMandoSocket || io();
        window.__fandezMandoSocket = socket;
        socket.emit('register_client', requestId);
        const event = `request_chat_${requestId}`;
        if (!socket.__fandezChatHandlers) socket.__fandezChatHandlers = new Set();
        if (!socket.__fandezChatHandlers.has(event)) {
          socket.__fandezChatHandlers.add(event);
          socket.on(event, (payload) => {
            if (payload?.message && activeChatId === requestId) appendMessage(payload.message);
          });
        }
      }
      setTimeout(() => chatInput?.focus(), 150);
    } catch (err) {
      notify(err.message || 'No se pudo abrir el chat', 'error');
      chatModal.classList.add('hidden');
    }
  }

  function closeChat() {
    activeChatId = null;
    chatModal?.classList.add('hidden');
  }

  document.querySelectorAll('[data-role="assign-btn"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-request-id]');
      const select = card.querySelector('[data-role="tech-select"]');
      const technicianId = select?.value;
      if (!technicianId) { notify('Selecciona un técnico en la lista', 'warning'); select?.focus(); return; }

      btn.disabled = true;
      try {
        const res = await fetch(`/proveedor/asignar/${btn.dataset.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ technicianId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');

        notify(`Asignado a ${data.request.technicianName}. Tiene 10 min para aceptar.`, 'success');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo asignar', 'error');
      }
    });
  });

  document.querySelectorAll('[data-role="desert-btn"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Liberar este pedido? Volverá a búsqueda para otros socios y sumará a tu tasa de liberación.')) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/proveedor/desertar/${btn.dataset.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}'
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo liberar');
        notify('Pedido liberado. El cliente sigue en búsqueda.', 'info');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo liberar', 'error');
      }
    });
  });

  function tickAcceptCountdowns() {
    document.querySelectorAll('[data-accept-deadline]').forEach((box) => {
      const el = box.querySelector('[data-role="accept-countdown"]');
      if (!el) return;
      const start = Date.parse(box.dataset.acceptDeadline || '');
      const mins = Math.max(1, parseInt(box.dataset.acceptTimeoutMin || '10', 10) || 10);
      if (!Number.isFinite(start)) {
        el.textContent = `${mins}:00`;
        return;
      }
      const left = Math.max(0, start + mins * 60000 - Date.now());
      const mm = String(Math.floor(left / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      el.textContent = left <= 0 ? '00:00 · reasignar' : `${mm}:${ss}`;
      el.classList.toggle('text-red-700', left <= 60000);
    });
  }
  tickAcceptCountdowns();
  setInterval(tickAcceptCountdowns, 1000);

  function tickReassignCountdowns() {
    document.querySelectorAll('[data-role="reassign-countdown"]').forEach((el) => {
      const start = Date.parse(el.dataset.reassignDeadline || '');
      const mins = Math.max(1, parseInt(el.dataset.reassignTimeoutMin || '10', 10) || 10);
      if (!Number.isFinite(start)) {
        el.textContent = `Quedan ${mins}:00 para asignar otro técnico`;
        return;
      }
      const left = Math.max(0, start + mins * 60000 - Date.now());
      const mm = String(Math.floor(left / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      el.textContent = left <= 0
        ? '00:00 · el pedido vuelve a búsqueda'
        : `Quedan ${mm}:${ss} para asignar otro técnico`;
      el.classList.toggle('text-red-700', left <= 60000);
    });
  }
  tickReassignCountdowns();
  setInterval(tickReassignCountdowns, 1000);

  document.querySelectorAll('[data-role="open-chat"]').forEach((btn) => {
    btn.addEventListener('click', () => openChat(btn.dataset.id, btn.dataset.client));
  });

  chatModal?.querySelector('[data-role="chat-close"]')?.addEventListener('click', closeChat);
  chatModal?.querySelector('[data-role="chat-backdrop"]')?.addEventListener('click', closeChat);

  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeChatId || !chatInput) return;
    const body = chatInput.value.trim();
    if (!body) return;
    chatInput.value = '';
    try {
      const res = await fetch(`/proveedor/chat/${activeChatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      appendMessage(data.message);
    } catch (err) {
      notify(err.message || 'No se pudo enviar', 'error');
    }
  });

  const params = new URLSearchParams(window.location.search);
  const openChatId = params.get('chat');
  if (openChatId) {
    const btn = document.querySelector(`[data-role="open-chat"][data-id="${openChatId}"]`);
    openChat(openChatId, btn?.dataset.client || 'Cliente');
  }

  if (typeof io !== 'undefined') {
    const socket = io();
    window.__fandezMandoSocket = socket;
    socket.on('connect', () => {
      document.querySelectorAll('[data-request-id]').forEach(card => {
        socket.emit('register_client', card.dataset.requestId);
      });
    });
    document.querySelectorAll('[data-request-id]').forEach(card => {
      const requestId = card.dataset.requestId;
      let lastStatus = card.querySelector('[data-role="status"]')?.dataset?.status || null;
      socket.on(`request_update_${requestId}`, (payload) => {
        if (!payload?.request) return;
        const statusEl = card.querySelector('[data-role="status"]');
        const ts = payload.request.techStatus;
        const labels = {
          asignado: 'Asignado',
          aceptado: 'Aceptado',
          en_camino: 'En camino',
          en_sitio: 'En sitio',
          diagnostico: 'Diagnóstico',
          reparando: 'Reparando',
          comprando: 'Comprando materiales',
          presupuesto_pendiente: 'Presupuesto pendiente',
          presupuesto_aprobado: 'Presupuesto aprobado',
          completado: 'Completado'
        };
        if (statusEl && labels[ts]) statusEl.textContent = labels[ts];
        if (ts && ts !== lastStatus && labels[ts] && window.FandezAlerts) {
          const isDone = ts === 'completado';
          FandezAlerts.notify({
            type: isDone ? 'success' : 'update',
            title: 'Actualización del servicio',
            body: labels[ts],
            tag: 'fandez-track-' + requestId
          });
          lastStatus = ts;
        } else if (ts) {
          lastStatus = ts;
        }
        if (payload.chatMessage && activeChatId === requestId) {
          appendMessage(payload.chatMessage);
        }
      });
    });
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function sortTechOptionsForRequest(card) {
    const lat = parseFloat(card.dataset.lat);
    const lng = parseFloat(card.dataset.lng);
    const select = card.querySelector('[data-role="tech-select"]');
    if (!select || Number.isNaN(lat) || Number.isNaN(lng)) return;
    const markers = Array.isArray(window.MANDO_TECH_MARKERS) ? window.MANDO_TECH_MARKERS : [];
    const options = [...select.options].filter((o) => o.value);
    options.sort((a, b) => {
      const ma = markers.find((m) => m.id === a.value);
      const mb = markers.find((m) => m.id === b.value);
      const da = ma?.lat != null && ma?.lng != null ? haversineKm(lat, lng, ma.lat, ma.lng) : 9999;
      const db = mb?.lat != null && mb?.lng != null ? haversineKm(lat, lng, mb.lat, mb.lng) : 9999;
      return da - db;
    });
    const placeholder = select.options[0];
    select.innerHTML = '';
    select.appendChild(placeholder);
    options.forEach((opt) => select.appendChild(opt));
    if (options[0]) select.value = options[0].value;
  }

  document.querySelectorAll('#mandoList [data-request-id]').forEach(sortTechOptionsForRequest);

  const mapEl = document.getElementById('mandoMap');
  if (mapEl && typeof FandezMap !== 'undefined' && typeof L !== 'undefined') {
    const cards = [...document.querySelectorAll('#mandoList [data-request-id]')];
    const techMarkers = Array.isArray(window.MANDO_TECH_MARKERS) ? window.MANDO_TECH_MARKERS : [];
    const points = [];
    cards.forEach((card) => {
      const lat = parseFloat(card.dataset.lat);
      const lng = parseFloat(card.dataset.lng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        points.push({ lat, lng, label: card.querySelector('strong')?.textContent || 'Pedido' });
      }
    });
    techMarkers.forEach((m) => {
      if (m.lat != null && m.lng != null) points.push({ lat: m.lat, lng: m.lng, label: m.name || 'Técnico' });
    });
    const center = points[0] || { lat: -33.4489, lng: -70.6693 };
    FandezMap.init(mapEl, { lat: center.lat, lng: center.lng, zoom: 12, label: '' });
    const map = FandezMap.maps[mapEl.id];
    if (map) {
      points.slice(1).forEach((p) => {
        L.marker([p.lat, p.lng], { icon: FandezMap._destIcon() }).addTo(map).bindPopup(p.label);
      });
    }
  }

  let mandoLocationWatch = null;
  function getMandoTrackingRequestId() {
    let enCamino = null;
    let fallback = null;
    document.querySelectorAll('#mandoList [data-request-id]').forEach((card) => {
      if (!fallback) fallback = card.dataset.requestId;
      if (card.dataset.techStatus === 'en_camino') enCamino = card.dataset.requestId;
    });
    return enCamino || fallback;
  }

  function startMandoLocationWatch() {
    if (!document.getElementById('mandoList') || !navigator.geolocation) return;
    if (mandoLocationWatch != null) return;
    mandoLocationWatch = navigator.geolocation.watchPosition(
      (pos) => {
        const requestId = getMandoTrackingRequestId();
        if (!requestId) return;
        fetch('/proveedor/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            requestId
          })
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }

  startMandoLocationWatch();
})();

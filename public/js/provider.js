(function () {
  function fileToDataUrl(input) {
    return new Promise((resolve, reject) => {
      const file = input?.files?.[0];
      if (!file) return reject(new Error('Adjunta la factura o boleta'));
      if (file.size > 6 * 1024 * 1024) return reject(new Error('El archivo supera 6 MB'));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }
  const dashboard = document.getElementById('providerDashboard');
  if (!dashboard) return;

  const providerId = dashboard.dataset.providerId;
  const socket = io();

  function t(key, vars) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key, vars) : key;
  }

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CL';
  const fmt = n => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const onlineToggle = document.getElementById('onlineToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusSub = document.getElementById('statusSub');
  const requestModal = document.getElementById('requestModal');
  const workWall = document.getElementById('workWall');
  const workWallList = document.getElementById('workWallList');
  const workWallEmpty = document.getElementById('workWallEmpty');
  const workWallCount = document.getElementById('workWallCount');
  const stickyBar = document.getElementById('providerStickyBar');
  const stickyPendingCount = document.getElementById('stickyPendingCount');
  const stickyOnlineDot = document.getElementById('stickyOnlineDot');

  let currentRequest = null;
  let alertInterval = null;
  let audioCtx = null;
  let locationWatchId = null;
  let activeRequestId = null;
  let wallItems = new Map();

  function playAlertSound() {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      [0, 0.12, 0.24, 0.36].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.35, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.28);
      });
    } catch (_) {}
  }

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function startRepeatingAlert() {
    stopRepeatingAlert();
    if (window.FandezAlerts) FandezAlerts.vibrate('order');
    alertInterval = setInterval(() => {
      playAlertSound();
      if (window.FandezAlerts) FandezAlerts.vibrate('order');
    }, 2500);
  }

  function stopRepeatingAlert() {
    if (alertInterval) {
      clearInterval(alertInterval);
      alertInterval = null;
    }
  }

  function pushBrowserNotification(title, body) {
    if (window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'order',
        title: title || 'Nuevo pedido Fandez',
        body: body || '',
        tag: 'fandez-work-wall',
        requireInteraction: true,
        system: true,
        url: '/proveedor'
      });
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon-32.png',
          requireInteraction: true,
          tag: 'fandez-work-wall'
        });
      } catch (_) {
        new Notification(title, { body, icon: '/favicon-32.png' });
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  function syncStickyBar() {
    if (!stickyBar) return;
    const online = onlineToggle?.checked;
    stickyBar.classList.toggle('is-visible', online);
    stickyBar.setAttribute('aria-hidden', online ? 'false' : 'true');
    if (stickyPendingCount) {
      stickyPendingCount.textContent = t('provider.js.available_count', { count: wallItems.size });
    }
    if (stickyOnlineDot) {
      stickyOnlineDot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-zilo-success animate-pulse' : 'bg-zilo-muted/40'}`;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateText(value, max = 110) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function formatRequestWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function renderWorkWall() {
    if (!workWallList) return;
    const items = [...wallItems.values()];
    if (workWallCount) workWallCount.textContent = String(items.length);
    if (workWallEmpty) workWallEmpty.classList.toggle('hidden', items.length > 0);
    workWallList.innerHTML = '';
    syncStickyBar();

    items.forEach(data => {
      const req = data.request || {};
      const when = formatRequestWhen(req.searchingAt || req.createdAt || req.paidAt);
      const whenHtml = when
        ? `<p class="text-[10px] text-zilo-muted mb-1">${t('provider.js.requested_at')}: ${escapeHtml(when)}</p>`
        : '';
      const urgency = req.urgencyTierLabel
        ? `<p class="text-[10px] text-orange-600 mb-1">${t('provider.js.urgency')}: ${escapeHtml(req.urgencyTierLabel)}</p>`
        : '';
      const gift = req.isGift
        ? `<span class="text-[10px] text-zilo-accent block mb-1">${t('provider.js.gift')} · ${escapeHtml(req.beneficiaryName || t('provider.js.beneficiary_fallback'))}</span>`
        : '';
      const notesPreview = truncateText(req.notes, 110);
      const notesHtml = notesPreview
        ? `<p class="text-[11px] text-zilo-muted italic mb-2 line-clamp-2">${escapeHtml(notesPreview)}</p>`
        : '';
      const thumbUrl = req.clientPhotoUrl || req.clientBrandPhotoUrl || '';
      const thumbHtml = thumbUrl
        ? `<img src="${escapeHtml(thumbUrl)}" alt="" class="w-14 h-14 rounded-xl object-cover border border-zilo-border shrink-0" loading="lazy" onerror="this.remove()">`
        : '';

      const card = document.createElement('article');
      card.className = 'p-4 rounded-2xl zilo-card-premium border border-zilo-accent/15 provider-wall-card';
      card.dataset.requestId = req.id;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex-1">
            <strong class="text-sm block">${escapeHtml(data.service.name)}</strong>
            <span class="text-xs text-zilo-muted block truncate">${escapeHtml(data.client.name)}</span>
            ${gift}
          </div>
          <div class="flex items-start gap-2 shrink-0">
            ${thumbHtml}
            <span class="zilo-badge zilo-badge-success">${t('provider.js.available')}</span>
          </div>
        </div>
        <p class="text-xs text-zilo-muted mb-1 truncate">${escapeHtml(req.address)}</p>
        ${whenHtml}
        ${urgency}
        ${notesHtml}
        <p class="text-xs font-semibold text-zilo-success mb-3">${t('provider.js.your_payout')}: ${fmt(req.providerPayout ?? req.estimatedVisit)}</p>
        <div class="flex gap-2">
          <button type="button" class="flex-1 py-2.5 rounded-xl zilo-btn-ghost !text-sm" data-detail="${escapeHtml(req.id)}">${t('provider.js.view_details')}</button>
          <button type="button" class="flex-1 py-2.5 rounded-xl zilo-modal-accept !text-sm" data-take="${escapeHtml(req.id)}">${t('provider.js.take_job')}</button>
        </div>
      `;
      workWallList.appendChild(card);
    });

    workWallList.querySelectorAll('[data-detail]').forEach(btn => {
      btn.addEventListener('click', () => openWallDetails(btn.dataset.detail));
    });
    workWallList.querySelectorAll('[data-take]').forEach(btn => {
      btn.addEventListener('click', () => acceptRequest(btn.dataset.take, btn));
    });
  }

  function openWallDetails(requestId) {
    const data = wallItems.get(requestId);
    if (!data) return;
    fillModal(data);
    const title = requestModal.querySelector('.zilo-display.text-xl');
    if (title) title.textContent = t('provider.js.job_details_title');
    const subtitle = title?.parentElement?.querySelector('.text-xs.text-zilo-muted');
    if (subtitle) subtitle.textContent = t('provider.js.job_details_sub');
    requestModal.classList.remove('hidden');
    stopRepeatingAlert();
  }

  function upsertWallItem(data) {
    if (!data?.request?.id) return;
    wallItems.set(data.request.id, data);
    renderWorkWall();
  }

  function removeWallItem(requestId) {
    wallItems.delete(requestId);
    renderWorkWall();
    if (currentRequest?.id === requestId) closeModal();
  }

  async function loadWorkWall() {
    if (!onlineToggle?.checked) return;
    try {
      const res = await fetch('/proveedor/muro');
      const data = await res.json();
      wallItems.clear();
      (data.items || []).forEach(upsertWallItem);
      renderWorkWall();
    } catch (_) {}
  }

  function fillModal(data) {
    currentRequest = data.request;
    document.getElementById('modalServiceIcon').innerHTML = FandezIcons.wrap(data.service.icon, data.service.color, 'w-12 h-12', 28);
    document.getElementById('modalServiceName').textContent = data.service.name;
    document.getElementById('modalClient').textContent = data.client.name;
    document.getElementById('modalAddress').textContent = data.request.address;
    document.getElementById('modalCoords').textContent =
      data.request.coords ? `${data.request.coords.lat}, ${data.request.coords.lng}` : '-33.4489, -70.6693';

    const mapEl = document.getElementById('modalMap');
    if (data.request.coords && typeof FandezMap !== 'undefined') {
      setTimeout(() => {
        FandezMap.init(mapEl, {
          lat: data.request.coords.lat,
          lng: data.request.coords.lng,
          label: data.request.address,
          zoom: 16
        });
      }, 400);
    }

    document.getElementById('modalPrice').textContent = `${t('provider.js.your_payout')}: ${fmt(data.request.providerPayout ?? data.request.estimatedVisit)}`;
    let payoutHint = document.getElementById('modalPayoutHint');
    if (!payoutHint) {
      const priceEl = document.getElementById('modalPrice');
      payoutHint = document.createElement('p');
      payoutHint.id = 'modalPayoutHint';
      payoutHint.className = 'text-[10px] text-zilo-muted mb-3';
      priceEl.insertAdjacentElement('afterend', payoutHint);
    }
    payoutHint.textContent = t('provider.js.payout_until_complete');
    document.getElementById('modalNotes').textContent = data.request.notes || t('provider.js.no_details');

    const photosEl = document.getElementById('modalClientPhotos');
    if (photosEl) {
      const parts = [];
      if (data.request.clientPhotoUrl) {
        const url = escapeHtml(data.request.clientPhotoUrl);
        parts.push(`
          <div>
            <p class="zilo-label mb-1">Foto del problema</p>
            <a href="${url}" target="_blank" rel="noopener">
              <img src="${url}" alt="Problema" class="w-full max-h-36 object-cover rounded-xl border border-zilo-border" onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden')">
              <p class="hidden text-xs text-zilo-muted p-3 rounded-xl border border-zilo-border bg-zilo-bg">No se pudo cargar la foto. Pide al cliente que la reenvíe por el chat.</p>
            </a>
          </div>`);
      }
      if (data.request.clientBrandPhotoUrl) {
        const url = escapeHtml(data.request.clientBrandPhotoUrl);
        parts.push(`
          <div>
            <p class="zilo-label mb-1">Foto de la marca</p>
            <a href="${url}" target="_blank" rel="noopener">
              <img src="${url}" alt="Marca" class="w-full max-h-36 object-cover rounded-xl border border-zilo-border" onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden')">
              <p class="hidden text-xs text-zilo-muted p-3 rounded-xl border border-zilo-border bg-zilo-bg">No se pudo cargar la foto de la marca.</p>
            </a>
          </div>`);
      } else if (data.request.brandNotVisible) {
        parts.push('<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Sin marca a la vista</p>');
      }
      if (parts.length) {
        photosEl.innerHTML = parts.join('');
        photosEl.classList.remove('hidden');
      } else {
        photosEl.innerHTML = '';
        photosEl.classList.add('hidden');
      }
    }

    let whenEl = document.getElementById('modalRequestedAt');
    if (!whenEl) {
      const notesEl = document.getElementById('modalNotes');
      whenEl = document.createElement('p');
      whenEl.id = 'modalRequestedAt';
      whenEl.className = 'text-[11px] text-zilo-muted mb-2 hidden';
      notesEl.parentNode.insertBefore(whenEl, notesEl);
    }
    const when = formatRequestWhen(data.request.searchingAt || data.request.createdAt || data.request.paidAt);
    if (when) {
      whenEl.textContent = `${t('provider.js.requested_at')}: ${when}`;
      whenEl.classList.remove('hidden');
    } else {
      whenEl.classList.add('hidden');
    }

    let urgencyEl = document.getElementById('modalUrgency');
    if (!urgencyEl) {
      const notesEl = document.getElementById('modalNotes');
      urgencyEl = document.createElement('p');
      urgencyEl.id = 'modalUrgency';
      urgencyEl.className = 'text-[11px] text-orange-600 mb-2 hidden';
      notesEl.parentNode.insertBefore(urgencyEl, notesEl);
    }
    if (data.request.urgencyTierLabel) {
      urgencyEl.textContent = `${t('provider.js.urgency')}: ${data.request.urgencyTierLabel}`;
      urgencyEl.classList.remove('hidden');
    } else {
      urgencyEl.classList.add('hidden');
    }

    const giftBadge = document.getElementById('modalGiftBadge');
    if (data.request.isGift) {
      giftBadge.classList.remove('hidden');
      document.getElementById('modalBeneficiary').textContent = data.request.beneficiaryName;
      document.getElementById('modalGiftPhone').textContent = data.request.beneficiaryPhone ? `Tel: ${data.request.beneficiaryPhone}` : '';
      document.getElementById('modalGiftMessage').textContent = data.request.giftMessage ? `"${data.request.giftMessage}"` : '';
      document.getElementById('modalClient').textContent = t('provider.js.payer', { name: data.client.name });
    } else {
      giftBadge.classList.add('hidden');
      document.getElementById('modalClient').textContent = data.client.name;
    }
  }

  function showRequestModal(data) {
    upsertWallItem(data);
    fillModal(data);
    const title = requestModal.querySelector('.zilo-display.text-xl');
    if (title) title.textContent = t('provider.dashboard.new_request') || 'Nueva solicitud';
    const subtitle = title?.parentElement?.querySelector('.text-xs.text-zilo-muted');
    if (subtitle) subtitle.textContent = t('provider.js.new_request_sub');
    requestModal.classList.remove('hidden');
    playAlertSound();
    startRepeatingAlert();
    pushBrowserNotification(t('provider.js.new_request_title'), `${data.service.name} · ${data.request.address}`);
  }

  function closeModal() {
    stopRepeatingAlert();
    requestModal.classList.add('hidden');
    currentRequest = null;
  }

  async function askTechnicianId(serviceId) {
    const res = await fetch(`/proveedor/tecnicos-elegibles?serviceId=${encodeURIComponent(serviceId || '')}`);
    const data = await res.json().catch(() => ({}));
    const techs = data.technicians || [];
    if (!techs.length) {
      FandezNotify.show('No tienes técnicos listos para este servicio. Activa «Yo hago el servicio» o agrega un técnico en Mi equipo.', 'warning');
      return null;
    }
    if (techs.length === 1) return techs[0].id;
    // Preferir "tú" primero en la lista
    techs.sort((a, b) => Number(Boolean(b.isSelfOperator)) - Number(Boolean(a.isSelfOperator)));
    return new Promise((resolve) => {
      const existing = document.getElementById('providerTechModal');
      if (existing) existing.remove();
      const modal = document.createElement('div');
      modal.id = 'providerTechModal';
      modal.className = 'fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/50';
      modal.innerHTML = `
        <div class="w-full max-w-md rounded-2xl bg-zilo-surface border border-zilo-border p-5 shadow-xl">
          <p class="text-xs font-semibold text-zilo-accent mb-1">Al tomar el pedido</p>
          <h3 class="text-base font-semibold mb-1">¿Quién va a la visita?</h3>
          <p class="text-xs text-zilo-muted mb-4">Si eliges a otra persona, tendrá ${window.FANDEZ_TIMEOUTS?.techAcceptMinutes || 10} minutos para aceptar. Si vas tú, entras directo a la visita.</p>
          <div class="space-y-2" data-role="tech-options"></div>
          <button type="button" data-role="tech-cancel" class="mt-3 w-full py-2.5 rounded-xl zilo-btn-ghost !text-sm">Cancelar</button>
        </div>`;
      const box = modal.querySelector('[data-role="tech-options"]');
      techs.forEach((tech) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full py-3 px-3 rounded-xl border border-zilo-border text-sm font-semibold text-left hover:border-zilo-accent';
        btn.textContent = tech.name;
        btn.addEventListener('click', () => {
          modal.remove();
          resolve(tech.id);
        });
        box.appendChild(btn);
      });
      modal.querySelector('[data-role="tech-cancel"]').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });
      document.body.appendChild(modal);
    });
  }

  async function acceptRequest(requestId, btn) {
    if (btn) btn.disabled = true;
    const serviceId = currentRequest?.service?.id
      || currentRequest?.request?.serviceId
      || wallItems.get(requestId)?.service?.id
      || wallItems.get(requestId)?.request?.serviceId;
    const technicianId = await askTechnicianId(serviceId);
    if (!technicianId) {
      if (btn) btn.disabled = false;
      return;
    }
    const res = await fetch(`/proveedor/accept/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ technicianId })
    });
    const data = await res.json();

    if (!data.success) {
      if (btn) btn.disabled = false;
      FandezNotify.show(data.error || t('provider.js.take_error'), 'warning');
      if (res.status === 409) removeWallItem(requestId);
      return;
    }

    removeWallItem(requestId);
    closeModal();

    if (data.selfOperator) {
      FandezNotify.show('Pedido tomado. Entrando a la visita…', 'success');
      try {
        const enter = await fetch('/proveedor/entrar-terreno', {
          method: 'POST',
          headers: { Accept: 'application/json' }
        });
        const enterData = await enter.json().catch(() => ({}));
        if (enter.ok && enterData.success) {
          window.location.href = `/tecnico/trabajo/${encodeURIComponent(requestId)}`;
          return;
        }
      } catch (_) { /* fall through */ }
    }

    activeRequestId = requestId;
    startLocationWatch();
    FandezNotify.show(t('provider.js.job_taken_chat'), 'success');
    setTimeout(() => {
      window.location.href = `/proveedor/mando?chat=${encodeURIComponent(requestId)}`;
    }, 700);
  }

  socket.on('connect', () => {
    socket.emit('register_provider', providerId);
    if (onlineToggle?.checked) loadWorkWall();
  });

  socket.on('work_wall_sync', ({ items }) => {
    wallItems.clear();
    (items || []).forEach(upsertWallItem);
    renderWorkWall();
  });

  socket.on('work_wall_new', (data) => {
    if (!onlineToggle?.checked) return;
    upsertWallItem(data);
    showRequestModal(data);
  });

  socket.on('new_request', (data) => {
    if (!onlineToggle?.checked) return;
    upsertWallItem(data);
    if (!requestModal.classList.contains('hidden') && currentRequest?.id === data.request.id) return;
    showRequestModal(data);
  });

  socket.on('request_taken', ({ requestId }) => {
    removeWallItem(requestId);
  });

  socket.on('provider_reassign_required', (payload) => {
    if (window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'alert',
        title: payload?.title || 'Reasigna técnico',
        body: payload?.body || 'Un técnico no aceptó a tiempo.',
        tag: 'fandez-reassign-' + (payload?.requestId || 'x'),
        requireInteraction: true,
        system: true,
        url: payload?.url || '/proveedor/mando'
      });
    } else {
      FandezNotify.show(payload?.body || 'Debes reasignar un técnico', 'warning');
    }
    setTimeout(() => {
      if (window.location.pathname.includes('/proveedor/mando')) location.reload();
    }, 1200);
  });

  function sendLocation(lat, lng) {
    const body = { lat, lng };
    if (activeRequestId) body.requestId = activeRequestId;
    fetch('/proveedor/ubicacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => {});
  }

  function startLocationWatch() {
    if (locationWatchId != null || !navigator.geolocation) return;
    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }

  function stopLocationWatch() {
    if (locationWatchId != null) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
  }

  if (onlineToggle?.checked) {
    fetch('/proveedor/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    }).then(() => {
      startLocationWatch();
      loadWorkWall();
    });
  }

  setInterval(() => {
    if (onlineToggle?.checked) loadWorkWall();
  }, 15000);

  onlineToggle?.addEventListener('change', async () => {
    const online = onlineToggle.checked;
    const res = await fetch('/proveedor/toggle-online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online })
    });
    const data = await res.json();

    if (!data.success) {
      onlineToggle.checked = false;
      const msg = data.missing?.length
        ? FandezI18n.t('js.verification_missing', { items: data.missing.join(', ') })
        : (data.error || FandezI18n.t('js.cannot_go_online'));
      FandezNotify.show(msg, 'warning');
      if (data.redirect) setTimeout(() => { window.location.href = data.redirect; }, 1800);
      return;
    }

    if (online) {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-success animate-pulse';
      statusText.textContent = FandezI18n.t('provider.online');
      statusSub.textContent = FandezI18n.t('provider.status_online_sub');
      FandezNotify.show(data.dispatched > 0 ? FandezI18n.t('js.requests_on_wall', { count: data.dispatched }) : FandezI18n.t('js.online_activated'), 'success');
      startLocationWatch();
      loadWorkWall();
      syncStickyBar();
      if (window.FandezAlerts) FandezAlerts.ensurePermission();
      else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } else {
      statusDot.className = 'w-3 h-3 rounded-full bg-zilo-muted/40';
      statusText.textContent = FandezI18n.t('provider.offline');
      statusSub.textContent = FandezI18n.t('provider.status_offline_sub');
      wallItems.clear();
      renderWorkWall();
      closeModal();
      stopLocationWatch();
      syncStickyBar();
      FandezNotify.show(FandezI18n.t('js.offline_mode'), 'info');
    }
  });

  document.getElementById('btnRefreshWall')?.addEventListener('click', () => {
    loadWorkWall();
    workWall?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FandezNotify.show(t('provider.js.wall_updated'), 'info');
  });

  document.getElementById('btnAccept')?.addEventListener('click', () => {
    if (currentRequest) acceptRequest(currentRequest.id);
  });

  document.getElementById('btnDecline')?.addEventListener('click', () => {
    closeModal();
    workWall?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FandezNotify.show(FandezI18n.t('js.still_on_wall'), 'info');
  });

  document.querySelectorAll('[data-role="register-invoice"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const form = button.closest('.provider-invoice-form');
      button.disabled = true;
      try {
        const file = await fileToDataUrl(form.querySelector('[data-role="invoice-file"]'));
        const res = await fetch(`/proveedor/factura/${form.dataset.requestId}/registrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            documentType: form.querySelector('[data-role="invoice-type"]').value,
            folio: form.querySelector('[data-role="invoice-folio"]').value.trim(),
            file
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo registrar');
        FandezNotify.show('Documento tributario registrado', 'success');
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        button.disabled = false;
        FandezNotify.show(err.message || 'No se pudo registrar', 'error');
      }
    });
  });

  socket.on('modules_updated', () => {
    setTimeout(() => location.reload(), 600);
  });
})();

(function () {
  async function fileToDataUrl(input) {
    const file = input?.files?.[0];
    if (!file) throw new Error('Adjunta la factura o boleta');
    if (window.FandezUpload?.prepareUploadFile) {
      return window.FandezUpload.prepareUploadFile(file);
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB');
    return new Promise((resolve, reject) => {
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
          icon: '/icons/fandez-v11-notify.png',
          badge: '/icons/fandez-v11-badge-96.png',
          requireInteraction: true,
          tag: 'fandez-work-wall'
        });
      } catch (_) {
        new Notification(title, { body, icon: '/icons/fandez-v11-notify.png', badge: '/icons/fandez-v11-badge-96.png' });
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
      const thumbUrl = req.id && (req.clientPhotoUrl || req.clientBrandPhotoUrl)
        ? `/media/request/${encodeURIComponent(req.id)}/kind/${req.clientPhotoUrl ? 'problem' : 'brand'}`
        : (req.clientPhotoUrl || req.clientBrandPhotoUrl || '');
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
          <button type="button" class="flex-1 py-2.5 rounded-xl zilo-btn-ghost !text-sm" data-dismiss="${escapeHtml(req.id)}">${t('provider.js.dismiss_job')}</button>
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
    workWallList.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', () => dismissWallItem(btn.dataset.dismiss, btn));
    });
  }

  async function dismissWallItem(requestId, btn) {
    const reasons = [
      { id: 'out_of_zone', label: t('provider.js.dismiss_out_of_zone') },
      { id: 'no_tool', label: t('provider.js.dismiss_no_tool') },
      { id: 'busy', label: t('provider.js.dismiss_busy') },
      { id: 'other', label: t('provider.js.dismiss_other') }
    ];
    const reason = await new Promise((resolve) => {
      const existing = document.getElementById('providerDismissModal');
      if (existing) existing.remove();
      const modal = document.createElement('div');
      modal.id = 'providerDismissModal';
      modal.className = 'fixed inset-0 z-[800] flex items-end sm:items-center justify-center p-4 bg-black/50';
      modal.innerHTML = `
        <div class="w-full max-w-md rounded-2xl bg-zilo-surface border border-zilo-border p-5 shadow-xl">
          <h3 class="text-base font-semibold mb-1">${t('provider.js.dismiss_title')}</h3>
          <p class="text-xs text-zilo-muted mb-4">${t('provider.js.dismiss_body')}</p>
          <div class="space-y-2" data-role="reasons"></div>
          <button type="button" data-role="cancel" class="mt-3 w-full py-2.5 rounded-xl zilo-btn-ghost !text-sm">${t('js.cancel')}</button>
        </div>`;
      const box = modal.querySelector('[data-role="reasons"]');
      reasons.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full py-3 px-3 rounded-xl border border-zilo-border text-sm font-medium text-left hover:border-zilo-accent';
        b.textContent = r.label;
        b.addEventListener('click', () => { modal.remove(); resolve(r.id); });
        box.appendChild(b);
      });
      modal.querySelector('[data-role="cancel"]').addEventListener('click', () => { modal.remove(); resolve(null); });
      document.body.appendChild(modal);
    });
    if (!reason) return;
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/proveedor/muro/dismiss/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || t('provider.js.dismiss_error'));
      removeWallItem(requestId);
      closeModal();
      FandezNotify.show(t('provider.js.dismiss_ok'), 'info');
    } catch (err) {
      if (btn) btn.disabled = false;
      FandezNotify.show(err.message || t('provider.js.dismiss_error'), 'warning');
    }
  }

  function openWallDetails(requestId) {
    const data = wallItems.get(requestId);
    if (!data || !requestModal) return;
    try {
      fillModal(data);
      const title = requestModal.querySelector('#requestModalTitle') || requestModal.querySelector('.zilo-display.text-xl');
      if (title) title.textContent = t('provider.js.job_details_title');
      const subtitle = title?.parentElement?.querySelector('.text-xs.text-zilo-muted');
      if (subtitle) subtitle.textContent = t('provider.js.job_details_sub');
    } catch (err) {
      console.warn('[provider] openWallDetails fill failed', err);
    }
    stopRepeatingAlert();
    openRequestModalShell();
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
    document.getElementById('modalServiceIcon').innerHTML =
      (typeof FandezIcons !== 'undefined' && data.service?.icon)
        ? FandezIcons.wrap(data.service.icon, data.service.color, 'w-12 h-12', 28)
        : '';
    document.getElementById('modalServiceName').textContent = data.service?.name || '—';
    document.getElementById('modalClient').textContent = data.client?.name || '—';
    document.getElementById('modalAddress').textContent = data.request.address || '—';
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

    const notesEl = document.getElementById('modalNotes');
    const activityLabel = String(data.request.activityName || data.request.customName || '').trim();
    const notesText = String(data.request.notes || '').trim();
    let description = '';
    if (activityLabel && notesText && activityLabel.toLowerCase() !== notesText.toLowerCase()) {
      description = `${activityLabel}\n${notesText}`;
    } else {
      description = notesText || activityLabel || t('provider.js.no_details');
    }
    if (notesEl) notesEl.textContent = description;

    const photosEl = document.getElementById('modalClientPhotos');
    if (photosEl) {
      // Revocar blobs anteriores
      photosEl.querySelectorAll('img[data-blob-url]').forEach((img) => {
        try { URL.revokeObjectURL(img.dataset.blobUrl); } catch (_) { /* ignore */ }
      });
      photosEl.innerHTML = '';

      const requestId = data.request.id;
      const slots = [];
      if (data.request.clientPhotoUrl) {
        slots.push({
          label: 'Foto del problema',
          urls: [
            requestId ? `/media/request/${encodeURIComponent(requestId)}/kind/problem` : null,
            data.request.clientPhotoUrl
          ].filter(Boolean)
        });
      }
      if (data.request.clientBrandPhotoUrl) {
        slots.push({
          label: 'Foto de la marca',
          urls: [
            requestId ? `/media/request/${encodeURIComponent(requestId)}/kind/brand` : null,
            data.request.clientBrandPhotoUrl
          ].filter(Boolean)
        });
      } else if (data.request.brandNotVisible) {
        const brandNote = document.createElement('p');
        brandNote.className = 'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2';
        brandNote.textContent = 'Sin marca a la vista';
        photosEl.appendChild(brandNote);
      }

      slots.forEach((slot) => {
        const wrap = document.createElement('div');
        wrap.className = 'provider-detail-photo';
        wrap.innerHTML = `<p class="zilo-label mb-1.5">${escapeHtml(slot.label)}</p>
          <div class="provider-photo-frame rounded-xl overflow-hidden border border-zilo-border">
            <p class="text-xs text-zilo-muted p-3 text-center" data-role="photo-loading">Cargando foto…</p>
            <img alt="${escapeHtml(slot.label)}" class="hidden" data-role="photo-img" decoding="async">
            <p class="hidden text-xs text-zilo-muted p-3 text-center" data-role="photo-error">No se pudo cargar la foto. Pide al cliente que la reenvíe por el chat.</p>
          </div>`;
        photosEl.appendChild(wrap);
        loadProviderPhoto(wrap, slot.urls);
      });

      photosEl.classList.toggle('hidden', !photosEl.childElementCount);
    }

    const afterNotesAnchor = document.getElementById('modalDescriptionBlock') || notesEl;
    let whenEl = document.getElementById('modalRequestedAt');
    if (!whenEl && afterNotesAnchor?.parentNode) {
      whenEl = document.createElement('p');
      whenEl.id = 'modalRequestedAt';
      whenEl.className = 'text-[11px] text-zilo-muted mb-2 hidden';
      afterNotesAnchor.parentNode.insertBefore(whenEl, afterNotesAnchor.nextSibling);
    }
    const when = formatRequestWhen(data.request.searchingAt || data.request.createdAt || data.request.paidAt);
    if (whenEl) {
      if (when) {
        whenEl.textContent = `${t('provider.js.requested_at')}: ${when}`;
        whenEl.classList.remove('hidden');
      } else {
        whenEl.classList.add('hidden');
      }
    }

    let urgencyEl = document.getElementById('modalUrgency');
    if (!urgencyEl && whenEl?.parentNode) {
      urgencyEl = document.createElement('p');
      urgencyEl.id = 'modalUrgency';
      urgencyEl.className = 'text-[11px] text-orange-600 mb-2 hidden';
      whenEl.parentNode.insertBefore(urgencyEl, whenEl.nextSibling);
    } else if (!urgencyEl && afterNotesAnchor?.parentNode) {
      urgencyEl = document.createElement('p');
      urgencyEl.id = 'modalUrgency';
      urgencyEl.className = 'text-[11px] text-orange-600 mb-2 hidden';
      afterNotesAnchor.parentNode.insertBefore(urgencyEl, afterNotesAnchor.nextSibling);
    }
    if (urgencyEl) {
      if (data.request.urgencyTierLabel) {
        urgencyEl.textContent = `${t('provider.js.urgency')}: ${data.request.urgencyTierLabel}`;
        urgencyEl.classList.remove('hidden');
      } else {
        urgencyEl.classList.add('hidden');
      }
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

  function loadProviderPhoto(wrap, urls) {
    const img = wrap.querySelector('[data-role="photo-img"]');
    const loading = wrap.querySelector('[data-role="photo-loading"]');
    const errEl = wrap.querySelector('[data-role="photo-error"]');
    if (!img) return;

    const candidates = [...new Set((urls || []).filter(Boolean))];
    let idx = 0;

    const showError = () => {
      if (loading) loading.classList.add('hidden');
      img.classList.add('hidden');
      img.removeAttribute('src');
      if (errEl) errEl.classList.remove('hidden');
    };

    const showOk = () => {
      if (loading) loading.classList.add('hidden');
      if (errEl) errEl.classList.add('hidden');
      img.classList.remove('hidden');
      resetRequestModalScroll();
    };

    const tryNext = () => {
      if (idx >= candidates.length) {
        showError();
        return;
      }
      const url = candidates[idx++];
      img.onload = () => {
        img.onload = null;
        img.onerror = null;
        showOk();
      };
      img.onerror = () => {
        img.onload = null;
        img.onerror = null;
        tryNext();
      };
      // Carga directa (misma sesión/cookies): más fiable en Safari/PWA que fetch→blob
      img.src = url;
    };

    tryNext();
  }

  function showRequestModal(data) {
    upsertWallItem(data);
    try {
      fillModal(data);
    } catch (err) {
      console.warn('[provider] showRequestModal fill failed', err);
    }
    const title = requestModal.querySelector('#requestModalTitle') || requestModal.querySelector('.zilo-display.text-xl');
    if (title) title.textContent = t('provider.dashboard.new_request') || 'Nueva solicitud';
    const subtitle = title?.parentElement?.querySelector('.text-xs.text-zilo-muted');
    if (subtitle) subtitle.textContent = t('provider.js.new_request_sub');
    openRequestModalShell();
    playAlertSound();
    startRepeatingAlert();
    pushBrowserNotification(t('provider.js.new_request_title'), `${data.service.name} · ${data.request.address}`);
  }

  function openRequestModalShell() {
    if (!requestModal) return;
    // Asegurar fixed respecto al viewport (no a un ancestro con transform)
    if (requestModal.parentElement !== document.body) {
      document.body.appendChild(requestModal);
    }
    // La barra sticky del muro tapa el footer del modal en móvil
    if (stickyBar) {
      stickyBar.classList.remove('is-visible');
      stickyBar.setAttribute('aria-hidden', 'true');
      stickyBar.style.pointerEvents = 'none';
    }
    requestModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    resetRequestModalScroll();
    // Tras pintar foto/mapa en móvil, volver al inicio del sheet
    requestAnimationFrame(() => resetRequestModalScroll());
    setTimeout(resetRequestModalScroll, 120);
    setTimeout(resetRequestModalScroll, 400);
  }

  function closeModal() {
    stopRepeatingAlert();
    requestModal.classList.add('hidden');
    currentRequest = null;
    document.body.classList.remove('overflow-hidden');
    if (stickyBar) stickyBar.style.pointerEvents = '';
    syncStickyBar();
  }

  function resetRequestModalScroll() {
    try {
      const body = requestModal?.querySelector('.request-modal-body');
      if (body) body.scrollTop = 0;
      const sheet = requestModal?.querySelector('.zilo-modal-sheet');
      if (sheet) sheet.scrollTop = 0;
      if (requestModal) requestModal.scrollTop = 0;
    } catch (_) { /* ignore */ }
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
    const body = { technicianId };
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
          });
        });
        body.lat = pos.coords.latitude;
        body.lng = pos.coords.longitude;
      } catch (_) {}
    }
    const res = await fetch(`/proveedor/accept/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
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
      const etaNote = data.request?.etaLabel ? ` ETA ${data.request.etaLabel}.` : '';
      FandezNotify.show(`Pedido tomado.${etaNote} Abriendo mapa y visita…`, 'success');
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
      // Si no pudo entrar como técnico, abre la vista de terreno del socio
      window.location.href = `/proveedor/trabajo/${encodeURIComponent(requestId)}`;
      return;
    }

    activeRequestId = requestId;
    startLocationWatch();
    FandezNotify.show('Pedido tomado. Avisamos al técnico. Abriendo detalle…', 'success');
    setTimeout(() => {
      window.location.href = `/proveedor/trabajo/${encodeURIComponent(requestId)}`;
    }, 500);
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

  // Si otro socio toma el pedido (o este se cae del muro), refrescar aunque no llegue el socket
  let wallPollTimer = null;
  function startWallPolling() {
    stopWallPolling();
    if (!onlineToggle?.checked) return;
    wallPollTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (!onlineToggle?.checked) return;
      loadWorkWall();
    }, 12000);
  }
  function stopWallPolling() {
    if (wallPollTimer) {
      clearInterval(wallPollTimer);
      wallPollTimer = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && onlineToggle?.checked) {
      loadWorkWall();
    }
  });
  window.addEventListener('focus', () => {
    if (onlineToggle?.checked) loadWorkWall();
  });
  if (onlineToggle?.checked) startWallPolling();
  onlineToggle?.addEventListener('change', () => {
    if (onlineToggle.checked) startWallPolling();
    else stopWallPolling();
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
      if (window.FandezAlerts) {
        FandezAlerts.ensurePermission().then(() => FandezAlerts.enablePush());
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
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
    const id = currentRequest?.id;
    if (id) {
      dismissWallItem(id);
      return;
    }
    closeModal();
  });

  document.getElementById('btnCloseRequestModal')?.addEventListener('click', () => closeModal());
  document.getElementById('requestModalBackdrop')?.addEventListener('click', () => closeModal());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && requestModal && !requestModal.classList.contains('hidden')) closeModal();
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

  function resumeProviderSession() {
    socket.emit('register_provider', providerId);
    if (onlineToggle?.checked) {
      loadWorkWall();
      if (locationWatchId == null) startLocationWatch();
    }
  }

  if (window.FandezMobile?.onResume) {
    FandezMobile.onResume(() => resumeProviderSession());
  } else {
    window.addEventListener('fandez:resume', () => resumeProviderSession());
  }
})();

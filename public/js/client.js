(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

  function t(key, vars) {
    return typeof FundezI18n !== 'undefined' ? FundezI18n.t(key, vars) : key;
  }

  const locale = document.documentElement.lang === 'en' ? 'en-US' : 'es-CL';
  const fmtCLP = n => new Intl.NumberFormat(locale, { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const serviceId = page.dataset.serviceId;
  const trackingId = page.dataset.tracking;
  const btnRequest = document.getElementById('btnRequest');
  const loaderOverlay = document.getElementById('loaderOverlay');
  const scheduledPanel = document.getElementById('scheduledPanel');
  const providerCard = document.getElementById('providerCard');
  const requestForm = document.getElementById('requestForm');
  const addressInput = document.getElementById('address');
  const latInput = document.getElementById('lat');
  const lngInput = document.getElementById('lng');
  const mapStatus = document.getElementById('mapStatus');
  const coverageAlert = document.getElementById('coverageAlert');
  const giftToggle = document.getElementById('giftToggle');
  const giftFields = document.getElementById('giftFields');
  const addressLabel = document.getElementById('addressLabel');
  const urgencyRadios = document.querySelectorAll('input[name="urgencyTier"]');

  let currentRequestId = trackingId || null;
  let lastProviderAlertId = null;
  let lastCompletionAlertId = null;
  let selectedUrgencyTier = document.querySelector('input[name="urgencyTier"]:checked')?.value || 'scheduled';
  let geocodeTimer = null;
  let addressCovered = null;
  const socket = io();

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof FundezMap !== 'undefined') {
      FundezMap.init(document.getElementById('addressMap'), {
        lat: SANTIAGO.lat, lng: SANTIAGO.lng, label: 'Santiago, Chile', zoom: 12
      });
    }

    updatePricePreview();

    if (new URLSearchParams(window.location.search).get('gift') === '1' && giftToggle) {
      giftToggle.checked = true;
      giftFields.classList.remove('hidden');
      if (addressLabel) addressLabel.textContent = t('client.js.gift_address');
    }

    if (trackingId) {
      requestForm.classList.add('hidden');
      startTracking(trackingId);
    }
  });

  addressInput.addEventListener('input', () => {
    clearTimeout(geocodeTimer);
    geocodeTimer = setTimeout(geocodeAddress, 800);
  });

  if (giftToggle) {
    giftToggle.addEventListener('change', () => {
      const isGift = giftToggle.checked;
      giftFields.classList.toggle('hidden', !isGift);
      if (addressLabel) {
        addressLabel.textContent = isGift ? t('client.js.gift_address') : t('client.js.service_address');
      }
    });
  }

  urgencyRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      selectedUrgencyTier = radio.value;
      document.querySelectorAll('.urgency-option').forEach(el => {
        const active = el.dataset.tier === selectedUrgencyTier;
        el.classList.toggle('border-zilo-accent', active);
        el.classList.toggle('bg-zilo-accent/5', active);
        el.classList.toggle('border-zilo-border', !active);
      });
      updatePricePreview();
    });
  });

  const activitySelect = document.getElementById('activityId');
  const customActivityFields = document.getElementById('customActivityFields');
  function toggleClientOtherFields() {
    if (!activitySelect || !customActivityFields) return;
    customActivityFields.classList.toggle('hidden', activitySelect.value !== 'otro');
  }
  function selectedActivityBase() {
    const opt = activitySelect?.selectedOptions?.[0];
    const base = opt?.dataset?.base;
    const n = base ? parseInt(base, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  activitySelect?.addEventListener('change', () => {
    toggleClientOtherFields();
    updatePricePreview();
  });
  toggleClientOtherFields();

  function deviceLocalClock() {
    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let timeZone = 'America/Santiago';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
    } catch (_) { /* fallback Chile */ }
    return { localTime, timeZone };
  }

  async function updatePricePreview() {
    const visitEl = document.getElementById('displayVisitPrice');
    if (!visitEl) return;
    try {
      const base = selectedActivityBase();
      const clock = deviceLocalClock();
      const params = new URLSearchParams({
        tier: selectedUrgencyTier,
        localTime: clock.localTime,
        timeZone: clock.timeZone
      });
      if (base) params.set('base', String(base));
      const res = await fetch(`/cliente/precio-preview?${params.toString()}`);
      const data = await res.json();
      if (!data.success) return;
      const p = data.preview;
      const f = data.preview.formatted;
      visitEl.textContent = f.baseVisit;
      document.getElementById('displayServicePrice').textContent = f.servicePrice;
      document.getElementById('displayTotalPrice').textContent = f.estimatedTotal;

      const stickyTotal = document.getElementById('stickyTotal');
      if (stickyTotal) stickyTotal.textContent = f.estimatedTotal;

      const svcRow = document.getElementById('servicePriceRow');
      if (svcRow) {
        if (p.servicePrice > 0) svcRow.classList.remove('hidden');
        else svcRow.classList.add('hidden');
      }

      const adjRow = document.getElementById('urgencyAdjustmentRow');
      if (adjRow) {
        if (p.adjustmentAmount !== 0) {
          adjRow.classList.remove('hidden');
          adjRow.classList.add('flex');
          const scheduleLabels = {
            normal: '',
            tarde: t('client.js.schedule_evening'),
            nocturno: t('client.js.schedule_night')
          };
          const schedulePart = scheduleLabels[p.tariff?.horarioBand] || '';
          const tierLabel = p.tier?.label || '';
          const band = [schedulePart, tierLabel].filter(Boolean).join(' · ') || tierLabel;
          document.getElementById('urgencyAdjustmentLabel').textContent =
            p.adjustmentAmount > 0
              ? t('client.js.surcharge_label', { label: band })
              : t('client.js.discount_label', { label: band });
          const adjEl = document.getElementById('displayUrgencyAdj');
          adjEl.textContent = (p.adjustmentAmount > 0 ? '+' : '') + f.adjustment;
          adjEl.className = p.adjustmentAmount > 0 ? 'text-orange-600' : 'text-emerald-600';
        } else {
          adjRow.classList.add('hidden');
          adjRow.classList.remove('flex');
        }
      }
    } catch (_) { /* silent */ }
  }

  const clientPhotoInput = document.getElementById('clientPhoto');
  const clientPhotoPreview = document.getElementById('clientPhotoPreview');
  const clientBrandPhotoInput = document.getElementById('clientBrandPhoto');
  const clientBrandPhotoPreview = document.getElementById('clientBrandPhotoPreview');
  const brandPhotoBlock = document.getElementById('brandPhotoBlock');
  const brandNotVisibleCheck = document.getElementById('brandNotVisible');

  // En iOS/Android, al abrir el 2.º input a veces se limpia files[] del 1.º
  // aunque el preview siga visible. Guardamos dataURL al elegir la foto.
  let cachedProblemPhoto = null;
  let cachedBrandPhoto = null;
  let submitInFlight = false;

  function compressImageFile(file, { maxSide = 1600, quality = 0.82 } = {}) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const type = String(file.type || '');
      // Algunos móviles no informan MIME; igual intentamos leer.
      if (type && !type.startsWith('image/')) return resolve(null);
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        img.onload = () => {
          try {
            let { width, height } = img;
            const scale = Math.min(1, maxSide / Math.max(width, height));
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(reader.result);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (_) {
            resolve(typeof reader.result === 'string' ? reader.result : null);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function wirePhotoPreview(input, preview, onReady) {
    if (!input || !preview) return;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        onReady?.(null);
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        FundezNotify.show(t('client.js.photo_too_large'), 'warning');
        input.value = '';
        onReady?.(null);
        return;
      }
      const dataUrl = await compressImageFile(file);
      if (!dataUrl) {
        FundezNotify.show(t('client.js.need_photo'), 'warning');
        onReady?.(null);
        return;
      }
      const img = preview.querySelector('img');
      if (img) img.src = dataUrl;
      preview.classList.remove('hidden');
      onReady?.(dataUrl);
    });
  }
  wirePhotoPreview(clientPhotoInput, clientPhotoPreview, (url) => { cachedProblemPhoto = url; });
  wirePhotoPreview(clientBrandPhotoInput, clientBrandPhotoPreview, (url) => { cachedBrandPhoto = url; });

  function syncBrandPhotoRequirement() {
    const skipBrand = Boolean(brandNotVisibleCheck?.checked);
    if (brandPhotoBlock) {
      brandPhotoBlock.classList.toggle('opacity-50', skipBrand);
      brandPhotoBlock.classList.toggle('pointer-events-none', skipBrand);
    }
    if (clientBrandPhotoInput) {
      clientBrandPhotoInput.disabled = skipBrand;
      clientBrandPhotoInput.required = !skipBrand;
      if (skipBrand) {
        clientBrandPhotoInput.value = '';
        cachedBrandPhoto = null;
        clientBrandPhotoPreview?.classList.add('hidden');
      }
    }
  }
  brandNotVisibleCheck?.addEventListener('change', syncBrandPhotoRequirement);
  syncBrandPhotoRequirement();

  const photoHelpModal = document.getElementById('photoHelpModal');
  function openPhotoHelp() {
    if (!photoHelpModal) return;
    photoHelpModal.classList.remove('hidden');
    photoHelpModal.setAttribute('aria-hidden', 'false');
  }
  function closePhotoHelp() {
    if (!photoHelpModal) return;
    photoHelpModal.classList.add('hidden');
    photoHelpModal.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('btnPhotoHelp')?.addEventListener('click', openPhotoHelp);
  document.getElementById('photoHelpClose')?.addEventListener('click', closePhotoHelp);
  document.getElementById('photoHelpOk')?.addEventListener('click', closePhotoHelp);
  document.getElementById('photoHelpBackdrop')?.addEventListener('click', closePhotoHelp);

  async function resolvePhotoDataUrl(input, cached) {
    if (cached && String(cached).startsWith('data:image')) return cached;
    const file = input?.files?.[0];
    if (!file) return null;
    if (file.size > 12 * 1024 * 1024) {
      FundezNotify.show(t('client.js.photo_too_large'), 'warning');
      return null;
    }
    return compressImageFile(file);
  }

  function setCoverageState(coverage) {
    addressCovered = coverage?.covered === true;
    if (!coverageAlert) return;

    if (!coverage || coverage.covered) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
      btnRequest.disabled = false;
      const stickyBtn = document.getElementById('btnRequestSticky');
      if (stickyBtn) stickyBtn.disabled = false;
      return;
    }

    coverageAlert.classList.remove('hidden');
    coverageAlert.textContent = coverage.message
      || t('client.js.coverage_msg', { name: coverage.communeName || '' });
    btnRequest.disabled = true;
    const stickyBtn = document.getElementById('btnRequestSticky');
    if (stickyBtn) stickyBtn.disabled = true;
  }

  async function geocodeAddress() {
    const address = addressInput.value.trim();
    if (address.length < 5) return;

    mapStatus.textContent = t('client.js.geocoding');
    if (coverageAlert) {
      coverageAlert.classList.add('hidden');
      coverageAlert.textContent = '';
    }
    try {
      const res = await fetch('/cliente/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const data = await res.json();
      if (data.success) {
        latInput.value = data.coords.lat;
        lngInput.value = data.coords.lng;
        FundezMap.update('addressMap', data.coords.lat, data.coords.lng, data.displayName || address);
        if (data.coverage?.covered) {
          mapStatus.textContent = data.displayName || t('client.js.location_found');
        } else {
          mapStatus.textContent = data.coverage?.communeName
            ? t('client.js.commune_detected', { name: data.coverage.communeName })
            : (data.displayName || t('client.js.location_found'));
        }
        setCoverageState(data.coverage);
      }
    } catch (_) {
      mapStatus.textContent = t('client.js.geocode_fail');
      setCoverageState(null);
    }
  }

  const SEARCH_TIMEOUT_MS = 15 * 60 * 1000;
  const SEARCH_POLL_MS = 2000;
  const SEARCH_RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const SEARCH_TIMEOUT_MINUTES = Math.round(SEARCH_TIMEOUT_MS / 60000);
  const SEARCH_PHASES = [
    { untilMs: 3 * 60 * 1000, step: 'step1', phase: 'near', title: 'client.js.search_title_near', sub: 'client.js.search_sub_near', label: 'client.js.search_phase_near' },
    { untilMs: 7 * 60 * 1000, step: 'step2', phase: 'expand', title: 'client.js.search_title_expand', sub: 'client.js.search_sub_expand', label: 'client.js.search_phase_expand' },
    { untilMs: 12 * 60 * 1000, step: 'step3', phase: 'notify', title: 'client.js.search_title_notify', sub: 'client.js.search_sub_notify', label: 'client.js.search_phase_notify' },
    { untilMs: SEARCH_TIMEOUT_MS, step: 'step3', phase: 'final', title: 'client.js.search_title_final', sub: 'client.js.search_sub_final', label: 'client.js.search_phase_final' },
    { untilMs: Infinity, step: 'step4', phase: 'busy', title: 'client.js.search_title_busy', sub: 'client.js.search_sub_busy', label: 'client.js.search_phase_busy' }
  ];
  const SEARCH_TIPS = [
    'client.js.search_tip_1',
    'client.js.search_tip_2',
    'client.js.search_tip_3',
    'client.js.search_tip_4',
    'client.js.search_tip_5'
  ];

  let searchTimerInterval = null;
  let searchTipInterval = null;
  let searchStartedAt = null;
  let searchCurrentPhase = null;
  let searchTipIndex = 0;
  let searchTimeoutTriggered = false;

  async function triggerSearchTimeout(requestId) {
    if (searchTimeoutTriggered || !requestId) return;
    searchTimeoutTriggered = true;
    try {
      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/timeout-busqueda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: '{}'
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.request) {
        showNoProviderChoice(data.request);
        return;
      }
    } catch (_) { /* fallback local */ }
    showNoProviderChoice({
      id: requestId,
      serviceName: page.dataset.serviceName || ''
    });
  }

  function formatSearchClock(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function resolveSearchPhase(elapsedMs) {
    return SEARCH_PHASES.find((phase) => elapsedMs < phase.untilMs) || SEARCH_PHASES[SEARCH_PHASES.length - 1];
  }

  function setSearchSteps(activeStepId, { busy = false } = {}) {
    const order = ['step1', 'step2', 'step3', 'step4'];
    const activeIdx = order.indexOf(activeStepId);
    order.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('is-active', 'is-done', 'is-busy');
      el.classList.add('search-timeline-item');
      if (idx < activeIdx) el.classList.add('is-done');
      else if (idx === activeIdx) el.classList.add(busy ? 'is-busy' : 'is-active');
    });
  }

  function updateSearchProgress(elapsedMs) {
    const capped = Math.min(elapsedMs, SEARCH_TIMEOUT_MS);
    const ratio = Math.min(1, capped / SEARCH_TIMEOUT_MS);
    const timerEl = document.getElementById('searchTimer');
    const barEl = document.getElementById('searchProgressBar');
    const labelEl = document.getElementById('searchProgressLabel');
    const ringEl = document.getElementById('searchRingProgress');
    if (timerEl) timerEl.textContent = formatSearchClock(capped);
    if (barEl) barEl.style.width = `${Math.round(ratio * 100)}%`;
    if (labelEl) {
      const mins = Math.min(SEARCH_TIMEOUT_MINUTES, Math.floor(capped / 60000));
      labelEl.textContent = t('client.js.search_progress', { elapsed: String(mins) });
    }
    if (ringEl) {
      ringEl.style.strokeDasharray = String(SEARCH_RING_CIRCUMFERENCE);
      ringEl.style.strokeDashoffset = String(SEARCH_RING_CIRCUMFERENCE * (1 - ratio));
    }
  }

  function applySearchPhase(elapsedMs) {
    const phase = resolveSearchPhase(elapsedMs);
    if (searchCurrentPhase === phase.phase) {
      updateSearchProgress(elapsedMs);
      return phase;
    }
    searchCurrentPhase = phase.phase;
    setSearchSteps(phase.step, { busy: phase.phase === 'busy' });
    const titleEl = document.getElementById('loaderText');
    const subEl = document.getElementById('loaderSub');
    const labelEl = document.getElementById('searchPhaseLabel');
    if (titleEl) titleEl.textContent = t(phase.title);
    if (subEl) subEl.textContent = t(phase.sub);
    if (labelEl) labelEl.textContent = t(phase.label);
    updateSearchProgress(elapsedMs);
    return phase;
  }

  function rotateSearchTip() {
    const tipEl = document.getElementById('searchTipText');
    if (!tipEl || !SEARCH_TIPS.length) return;
    searchTipIndex = (searchTipIndex + 1) % SEARCH_TIPS.length;
    tipEl.textContent = t(SEARCH_TIPS[searchTipIndex]);
  }

  function stopSearchExperience() {
    if (searchTimerInterval) {
      clearInterval(searchTimerInterval);
      searchTimerInterval = null;
    }
    if (searchTipInterval) {
      clearInterval(searchTipInterval);
      searchTipInterval = null;
    }
    searchCurrentPhase = null;
  }

  function syncSearchStartFromRequest(request) {
    const raw = request?.searchingAt || request?.paidAt || request?.createdAt;
    const parsed = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(parsed)) searchStartedAt = parsed;
  }

  function startSearchExperience(request) {
    stopSearchExperience();
    searchTimeoutTriggered = false;
    syncSearchStartFromRequest(request);
    if (!searchStartedAt) searchStartedAt = Date.now();
    searchTipIndex = 0;
    const tipEl = document.getElementById('searchTipText');
    if (tipEl) tipEl.textContent = t(SEARCH_TIPS[0]);
    applySearchPhase(Date.now() - searchStartedAt);
    searchTimerInterval = setInterval(() => {
      const elapsed = Date.now() - searchStartedAt;
      applySearchPhase(elapsed);
      if (elapsed >= SEARCH_TIMEOUT_MS && currentRequestId) {
        triggerSearchTimeout(currentRequestId);
      }
    }, 1000);
    searchTipInterval = setInterval(rotateSearchTip, 7000);
  }

  function showNoProviderChoice(request) {
    if (!request?.id) return;
    const panel = document.getElementById('noProviderChoicePanel');
    if (!panel) return;
    stopSearchExperience();
    loaderOverlay?.classList.add('hidden');
    requestForm?.classList.add('hidden');
    providerCard?.classList.add('hidden');
    const nameEl = document.getElementById('noProviderServiceName');
    if (nameEl) nameEl.textContent = request.serviceName || '';
    panel.dataset.requestId = request.id;
    panel.classList.remove('hidden');
    if (window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'alert',
        title: t('client.js.no_provider_title'),
        body: t('client.js.no_provider_body'),
        tag: 'fundez-no-provider-' + request.id,
        requireInteraction: true
      });
    }
  }

  function hideNoProviderChoice() {
    document.getElementById('noProviderChoicePanel')?.classList.add('hidden');
  }

  function formatScheduledWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showScheduledPanel(request) {
    if (!scheduledPanel || !request) return;
    stopSearchExperience();
    loaderOverlay?.classList.add('hidden');
    requestForm?.classList.add('hidden');
    providerCard?.classList.add('hidden');
    hideNoProviderChoice();
    const whenEl = document.getElementById('scheduledWhen');
    if (whenEl) {
      const label = formatScheduledWhen(request.scheduledSearchAt);
      whenEl.textContent = label
        ? t('client.service.scheduled_when', { when: label })
        : (request.urgencyTierLabel || '');
    }
    const sub = document.getElementById('scheduledSub');
    if (sub && request.urgencyTierLabel) {
      sub.textContent = t('client.service.scheduled_sub_tier', { tier: request.urgencyTierLabel });
    }
    scheduledPanel.dataset.requestId = request.id;
    scheduledPanel.classList.remove('hidden');
  }

  function hideScheduledPanel() {
    scheduledPanel?.classList.add('hidden');
  }

  async function cancelSearchOrSchedule(requestId) {
    if (!requestId) return;
    const ok = window.confirm(t('client.service.cancel_search_confirm'));
    if (!ok) return;
    const btn = document.getElementById('btnCancelSearch');
    const btnScheduled = document.getElementById('btnCancelScheduled');
    if (btn) btn.disabled = true;
    if (btnScheduled) btnScheduled.disabled = true;
    try {
      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/cancelar-busqueda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: '{}'
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {
        throw new Error(t('client.service.cancel_search_error'));
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || t('client.service.cancel_search_error'));
      }
      stopSearchExperience();
      loaderOverlay?.classList.add('hidden');
      hideScheduledPanel();
      if (window.FundezAlerts) {
        FundezAlerts.notify({
          type: 'success',
          title: t('client.service.cancel_search_ok_title'),
          body: t('client.service.cancel_search_ok_body'),
          toast: 'success'
        });
      } else {
        FundezNotify.show(t('client.service.cancel_search_ok_body'), 'success');
      }
      setTimeout(() => { window.location.href = '/cliente'; }, 1000);
    } catch (err) {
      if (btn) btn.disabled = false;
      if (btnScheduled) btnScheduled.disabled = false;
      FundezNotify.show(err.message || t('client.service.cancel_search_error'), 'error');
    }
  }

  document.getElementById('btnCancelSearch')?.addEventListener('click', () => {
    cancelSearchOrSchedule(currentRequestId || page.dataset.tracking);
  });
  document.getElementById('btnCancelScheduled')?.addEventListener('click', () => {
    cancelSearchOrSchedule(scheduledPanel?.dataset.requestId || currentRequestId || page.dataset.tracking);
  });

  async function submitNoProviderChoice(choice, requestId) {
    const panel = document.getElementById('noProviderChoicePanel');
    const buttons = panel?.querySelectorAll('button') || [];
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/sin-socio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ choice })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t('client.js.no_provider_error'));
      hideNoProviderChoice();
      if (choice === 'refund') {
        if (window.FundezAlerts) FundezAlerts.notify({
          type: 'success',
          title: t('client.js.refund_requested_title'),
          body: t('client.js.refund_requested_body'),
          toast: 'success'
        });
        else FundezNotify.show(t('client.js.refund_requested_body'), 'success');
        setTimeout(() => { window.location.href = '/cliente'; }, 1200);
      } else {
        if (window.FundezAlerts) FundezAlerts.notify({
          type: 'update',
          title: t('client.js.keep_searching_title'),
          body: t('client.js.keep_searching_body'),
          toast: 'info'
        });
        else FundezNotify.show(t('client.js.keep_searching_body'), 'info');
        loaderOverlay?.classList.remove('hidden');
        startTracking(requestId);
      }
    } catch (err) {
      buttons.forEach((b) => { b.disabled = false; });
      FundezNotify.show(err.message || t('client.js.no_provider_error'), 'error');
    }
  }

  function advanceTripStep(step) {
    document.querySelectorAll('.trip-step').forEach(el => {
      el.classList.remove('active');
      const ds = el.dataset.step;
      if (ds === 'paid' || ds === 'assigned') el.classList.add('done');
      else el.classList.remove('done');
    });
    const order = ['paid', 'assigned', 'enroute', 'arrived'];
    const idx = order.indexOf(step);
    order.slice(0, idx).forEach(s => {
      const el = document.querySelector(`.trip-step[data-step="${s}"]`);
      if (el) el.classList.add('done');
    });
    const current = document.querySelector(`.trip-step[data-step="${step}"]`);
    if (current) { current.classList.add('active'); current.classList.remove('done'); }
    const etaEl = document.getElementById('tripEta');
    if (!etaEl) return;
    if (step === 'enroute') etaEl.textContent = t('client.js.enroute_home');
    if (step === 'arrived') etaEl.textContent = t('client.js.arrived');
  }

  let lastTripStepAlert = null;

  function syncTripFromRequest(request) {
    if (!request) return;
    const ts = request.techStatus;
    let step = 'assigned';
    if (['diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado', 'completado', 'en_sitio'].includes(ts)) {
      step = 'arrived';
    } else if (ts === 'en_camino') {
      step = 'enroute';
    } else if (ts === 'aceptado' || ts === 'asignado' || request.providerId) {
      step = 'assigned';
    } else {
      return;
    }
    advanceTripStep(step);

    if (lastTripStepAlert === step) return;
    // Solo alertar en hitos de movimiento (no al asignar, eso ya lo hace showProvider)
    if (step === 'enroute' || step === 'arrived') {
      lastTripStepAlert = step;
      if (step === 'enroute') {
        if (window.FundezAlerts) FundezAlerts.notify({ type: 'update', title: t('client.js.enroute_alert_title'), body: t('client.js.enroute_home'), tag: 'fundez-enroute' });
        else FundezNotify.show(t('client.js.enroute_home'), 'info');
      } else {
        if (window.FundezAlerts) FundezAlerts.notify({ type: 'update', title: t('client.js.arrived_alert_title'), body: t('client.js.arrived'), tag: 'fundez-arrived' });
        else FundezNotify.show(t('client.js.arrived'), 'info');
      }
    }
  }

  function renderCompletionSummary(totals, vouchers, request) {
    const box = document.getElementById('completionSummary');
    if (!box || !totals?.completed) return;
    document.getElementById('finalVisit').textContent = fmtCLP(totals.visitPaid || 0);
    document.getElementById('finalService').textContent = fmtCLP(totals.serviceAmount || 0);
    document.getElementById('finalServiceRow')?.classList.toggle('hidden', !totals.serviceAmount);
    document.getElementById('finalMaterials').textContent = fmtCLP(totals.materialsTotal || 0);
    document.getElementById('finalGrandTotal').textContent = fmtCLP(totals.grandTotal || 0);

    const materialsBlock = document.getElementById('finalMaterialsBlock');
    const list = document.getElementById('finalMaterialsList');
    const materials = Array.isArray(totals.materials) ? totals.materials : [];
    materialsBlock?.classList.toggle('hidden', !totals.materialsTotal);
    if (list) {
      list.replaceChildren();
      materials.forEach((material) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between gap-3';
        const description = document.createElement('span');
        description.textContent = material.description || 'Material';
        const amount = document.createElement('span');
        amount.textContent = fmtCLP(material.amount || 0);
        row.append(description, amount);
        list.appendChild(row);
      });
    }
    const voucher = (vouchers || []).find((item) => item.phase === 'job_settlement');
    const voucherLink = document.getElementById('finalVoucherLink');
    if (voucher?.url && voucherLink) {
      voucherLink.href = voucher.url;
      voucherLink.classList.remove('hidden');
    }
    const invoiceLink = document.getElementById('finalProviderInvoiceLink');
    if (request?.providerInvoicePlan?.status === 'issued' && request.providerInvoicePlan.url && invoiceLink) {
      invoiceLink.href = request.providerInvoicePlan.url;
      invoiceLink.classList.remove('hidden');
    }
    const reviewLink = document.getElementById('finalReviewLink');
    if (reviewLink && request?.id) {
      reviewLink.href = `/cliente/historial?calificar=${encodeURIComponent(request.id)}`;
      reviewLink.classList.toggle('hidden', Boolean(request.clientReview));
    }
    box.classList.remove('hidden');
  }

  async function loadCompletionSummary(requestId) {
    try {
      const res = await fetch(`/cliente/solicitud/${requestId}`);
      const data = await res.json();
      renderCompletionSummary(data.request?.clientTotals, data.request?.vouchers, data.request);
    } catch (_) { /* se reintentará con la próxima actualización */ }
  }

  function renderVerificationBadges(provider) {
    const container = document.getElementById('providerVerification');
    if (!container) return;
    const v = provider.verification;
    if (!v?.badges?.length) {
      container.innerHTML = `<span class="zilo-badge !text-[10px]">${t('client.js.verification_pending')}</span>`;
      return;
    }
    container.innerHTML = v.badges.map(b =>
      `<span class="zilo-badge zilo-badge-success !text-[10px]">${b.label}</span>`
    ).join('');
    const statusEl = document.getElementById('providerVerifiedStatus');
    if (statusEl && v.faceVerified) {
      statusEl.textContent = v.faceScore
        ? t('client.js.identity_score', { score: v.faceScore })
        : t('client.js.identity_verified');
      statusEl.classList.remove('hidden');
    }
  }

  function showBudgetBanner(request) {
    const banner = document.getElementById('budgetBanner');
    if (!banner || !request?.siteReport) return;
    const sr = request.siteReport;
    if (request.techStatus !== 'presupuesto_pendiente' || sr.budgetStatus !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    const wasHidden = banner.classList.contains('hidden');
    document.getElementById('budgetBannerText').textContent =
      t('client.js.budget_sent', { amount: fmtCLP(sr.budgetAmount), desc: sr.budgetDescription || '' });
    banner.classList.remove('hidden');
    if (wasHidden && window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'payment',
        title: t('client.js.budget_alert_title'),
        body: t('client.js.budget_sent', { amount: fmtCLP(sr.budgetAmount), desc: sr.budgetDescription || '' }),
        tag: 'fundez-budget-' + (request.id || currentRequestId)
      });
    }
  }

  function showActivityChangeBanner(request) {
    const banner = document.getElementById('activityChangeBanner');
    if (!banner) return;
    const change = request?.siteReport?.activityChange;
    if (!change || change.status !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    const wasHidden = banner.classList.contains('hidden');
    const label = change.manual ? 'Servicio propuesto por el socio' : 'Cambio de subservicio';
    document.getElementById('activityChangeText').textContent =
      `${label}: ${change.fromActivityName || '—'} → ${change.toActivityName || '—'} · ${fmtCLP(change.proposedTotal)}\n${change.notes || ''}`;
    const photo = document.getElementById('activityChangePhoto');
    if (change.photoUrl && photo) {
      photo.src = change.photoUrl;
      photo.classList.remove('hidden');
    } else if (photo) {
      photo.classList.add('hidden');
    }
    banner.classList.remove('hidden');
    if (wasHidden && window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'alert',
        title: t('client.js.activity_change_alert_title'),
        body: `${label}: ${change.fromActivityName || '—'} → ${change.toActivityName || '—'}`,
        tag: 'fundez-activity-' + (request.id || currentRequestId),
        requireInteraction: true
      });
    }
  }

  function showAdditionalPaymentBanner(request) {
    const banner = document.getElementById('additionalPaymentBanner');
    if (!banner) return;
    const charge = request?.additionalCharge;
    if (!charge || charge.status !== 'pending') {
      banner.classList.add('hidden');
      return;
    }
    const wasHidden = banner.classList.contains('hidden');
    document.getElementById('additionalPaymentText').textContent =
      `${charge.description || 'Ajuste de servicio'} · ${fmtCLP(charge.amountDue || 0)}`;
    document.getElementById('additionalPaymentLink').href = `/pagos/ajuste?ref=${request.id}`;
    banner.classList.remove('hidden');
    if (wasHidden && window.FundezAlerts) {
      FundezAlerts.notify({
        type: 'payment',
        title: t('client.js.additional_payment_alert_title'),
        body: `${charge.description || 'Ajuste de servicio'} · ${fmtCLP(charge.amountDue || 0)}`,
        tag: 'fundez-addpay-' + (request.id || currentRequestId),
        requireInteraction: true
      });
    }
  }

  async function respondBudget(approved) {
    if (!currentRequestId) return;
    const res = await fetch(`/cliente/presupuesto/${currentRequestId}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ approved })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      FundezNotify.show(data.error || t('client.js.respond_error'), 'error');
      return;
    }
    FundezNotify.show(
      approved ? t('client.js.budget_approved') : t('client.js.budget_rejected'),
      approved ? 'success' : 'info'
    );
    document.getElementById('budgetBanner')?.classList.add('hidden');
    if (data.redirect) window.location.href = data.redirect;
  }

  async function respondActivityChange(approved) {
    if (!currentRequestId) return;
    const res = await fetch(`/cliente/cambio-servicio/${currentRequestId}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ approved })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      FundezNotify.show(data.error || t('client.js.respond_error'), 'error');
      return;
    }
    FundezNotify.show(
      approved ? t('client.js.activity_change_ok') : t('client.js.activity_change_no'),
      approved ? 'success' : 'info'
    );
    document.getElementById('activityChangeBanner')?.classList.add('hidden');
    if (data.redirect) window.location.href = data.redirect;
  }

  document.getElementById('btnApproveBudget')?.addEventListener('click', () => respondBudget(true));
  document.getElementById('btnRejectBudget')?.addEventListener('click', () => respondBudget(false));
  document.getElementById('btnApproveActivityChange')?.addEventListener('click', () => respondActivityChange(true));
  document.getElementById('btnRejectActivityChange')?.addEventListener('click', () => respondActivityChange(false));

  function escapeChatHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatChatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function renderJobChatMessage(msg) {
    const isSystem = msg.senderType === 'system';
    const isMine = !isSystem && msg.senderType === 'client';
    const cls = isSystem ? 'job-chat-bubble--system' : (isMine ? 'job-chat-bubble--mine' : 'job-chat-bubble--theirs');
    const meta = isSystem
      ? ''
      : `<span class="job-chat-meta">${escapeChatHtml(msg.senderName || '')} · ${escapeChatHtml(formatChatTime(msg.createdAt))}</span>`;
    return `<div class="job-chat-bubble ${cls}" data-msg-id="${escapeChatHtml(msg.id)}">${meta}${escapeChatHtml(msg.body)}</div>`;
  }

  function appendJobChatMessage(msg) {
    const thread = document.getElementById('jobChatThread');
    if (!thread || !msg?.id) return;
    if (thread.querySelector(`[data-msg-id="${msg.id}"]`)) return;
    const empty = thread.querySelector('.text-zilo-muted.text-center');
    if (empty) empty.remove();
    thread.insertAdjacentHTML('beforeend', renderJobChatMessage(msg));
    thread.scrollTop = thread.scrollHeight;
  }

  async function setupJobChat(requestId, providerName) {
    const btn = document.getElementById('openJobChatBtn');
    const panel = document.getElementById('jobChatPanel');
    const peer = document.getElementById('jobChatPeer');
    const form = document.getElementById('jobChatForm');
    const input = document.getElementById('jobChatInput');
    const thread = document.getElementById('jobChatThread');
    if (!btn || !panel || !requestId) return;

    btn.classList.remove('hidden');
    if (peer) peer.textContent = providerName || 'Socio';

    const loadChat = async () => {
      try {
        const res = await fetch(`/cliente/chat/${requestId}`);
        const data = await res.json();
        if (!res.ok || !data.success) return;
        if (peer && data.peerName) peer.textContent = data.peerName;
        if (thread) {
          thread.innerHTML = (data.messages || []).map(renderJobChatMessage).join('')
            || '<p class="text-xs text-zilo-muted text-center">Sin mensajes aún. Escribe para coordinar con el socio.</p>';
          thread.scrollTop = thread.scrollHeight;
        }
      } catch (_) { /* ignore */ }
    };

    btn.onclick = async () => {
      panel.classList.remove('hidden');
      await loadChat();
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      input?.focus();
    };

    if (!form || form.dataset.bound === '1') {
      await loadChat();
      return;
    }
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input?.value.trim();
      if (!body) return;
      input.value = '';
      try {
        const res = await fetch(`/cliente/chat/${requestId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ body })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
        appendJobChatMessage(data.message);
      } catch (err) {
        FundezNotify.show(err.message || 'No se pudo enviar', 'error');
      }
    });

    if (typeof socket !== 'undefined' && socket) {
      socket.off(`request_chat_${requestId}`);
      socket.on(`request_chat_${requestId}`, (payload) => {
        if (payload?.message) {
          panel.classList.remove('hidden');
          appendJobChatMessage(payload.message);
        }
      });
    }

    await loadChat();
  }

  function showProvider(provider, request) {
    if (request?.id) currentRequestId = request.id;

    document.getElementById('providerAvatar').textContent = provider.avatar;
    document.getElementById('providerName').textContent = provider.name;
    document.getElementById('providerRating').textContent = provider.rating;
    document.getElementById('providerReviews').textContent = t('client.js.reviews_count', { count: provider.reviewsCount });
    document.getElementById('providerStars').textContent = '★'.repeat(Math.round(provider.rating));
    document.getElementById('providerBio').textContent = provider.bio;
    document.getElementById('providerPhone').href = `tel:${provider.phone}`;
    document.getElementById('providerPhone').textContent = t('client.js.call', { phone: provider.phone });
    const emailEl = document.getElementById('providerEmail');
    if (emailEl && provider.email) {
      emailEl.href = `mailto:${provider.email}`;
      emailEl.textContent = t('client.js.email', { email: provider.email });
      emailEl.classList.remove('hidden');
    }
    renderVerificationBadges(provider);
    document.getElementById('tripProviderLabel').textContent = `${provider.name} · ${provider.rating}★`;
    if (request) {
      showBudgetBanner(request);
      showActivityChangeBanner(request);
      showAdditionalPaymentBanner(request);
      renderCompletionSummary(request.clientTotals, request.vouchers);
      setupJobChat(request.id, provider.name);
    }
    const waBtn = document.getElementById('whatsappSupport');
    if (waBtn) {
      waBtn.href = '#aland-support';
      waBtn.removeAttribute('target');
      waBtn.setAttribute('data-open-aland', '1');
    }

    if (request) syncTripFromRequest(request);

    document.getElementById('reviewsList').innerHTML = provider.reviews.map(r => `
      <div class="p-3 rounded-xl bg-zilo-bg">
        <div class="flex justify-between mb-1">
          <span class="text-xs font-semibold">${r.author}</span>
          <span class="text-xs text-yellow-600">${'★'.repeat(r.rating)}</span>
        </div>
        <p class="text-xs text-gray-600">${r.text}</p>
      </div>
    `).join('');

    if (request?.coords) {
      const tMap = document.getElementById('trackingMap');
      tMap.classList.remove('hidden');
      page.dataset.destLat = request.coords.lat;
      page.dataset.destLng = request.coords.lng;
      const prov = provider.location;
      FundezMap.initTracking(tMap, {
        destLat: request.coords.lat,
        destLng: request.coords.lng,
        destLabel: request.address,
        providerLat: prov?.lat,
        providerLng: prov?.lng
      });
      const locStatus = document.getElementById('providerLocationStatus');
      if (locStatus) {
        locStatus.classList.toggle('hidden', !prov);
        if (prov) {
          locStatus.textContent = provider.location?.label
            ? `${provider.location.label} en vivo`
            : t('client.js.tech_live_location');
        }
      }
    }

    loaderOverlay.classList.add('hidden');
    providerCard.classList.remove('hidden');
    requestForm.classList.add('hidden');
    hideNoProviderChoice();
    stopSearchExperience();
    const providerReqId = request?.id || currentRequestId;
    if (window.FundezAlerts && lastProviderAlertId !== providerReqId) {
      lastProviderAlertId = providerReqId;
      FundezAlerts.notify({
        type: 'order',
        title: t('client.js.provider_found'),
        body: provider?.name ? t('client.js.provider_found_body', { name: provider.name }) : t('client.js.provider_found'),
        tag: 'fundez-provider-' + providerReqId
      });
    } else {
      FundezNotify.show(t('client.js.provider_found'), 'success');
    }
  }

  function pollForProvider(requestId, attempts = 0, startedAt = Date.now()) {
    fetch(`/cliente/solicitud/${requestId}`)
      .then(r => r.json())
      .then(data => {
        if (data.request?.status === 'scheduled') {
          showScheduledPanel(data.request);
          setTimeout(() => pollForProvider(requestId, attempts + 1, startedAt), SEARCH_POLL_MS);
          return;
        }
        if (data.request?.status === 'cancelled') {
          stopSearchExperience();
          loaderOverlay?.classList.add('hidden');
          hideScheduledPanel();
          return;
        }
        if (data.request?.status === 'searching') {
          hideScheduledPanel();
          if (loaderOverlay?.classList.contains('hidden')) {
            loaderOverlay.classList.remove('hidden');
            startSearchExperience(data.request);
          }
        }
        if (data.request) syncSearchStartFromRequest(data.request);
        if (data.provider) {
          hideNoProviderChoice();
          hideScheduledPanel();
          showProvider(data.provider, data.request);
          return;
        }
        if (data.request?.noProviderDecisionStatus === 'pending') {
          showNoProviderChoice(data.request);
          return;
        }
        if (Date.now() - (searchStartedAt || startedAt) >= SEARCH_TIMEOUT_MS) {
          triggerSearchTimeout(requestId);
          return;
        }
        setTimeout(() => pollForProvider(requestId, attempts + 1, startedAt), SEARCH_POLL_MS);
      })
      .catch(() => {
        setTimeout(() => pollForProvider(requestId, attempts + 1, startedAt), SEARCH_POLL_MS);
      });
  }

  function startTracking(requestId) {
    currentRequestId = requestId;
    if (window.FundezAlerts) FundezAlerts.ensurePermission();
    // Estado inicial: se define al primer poll / socket.
    fetch(`/cliente/solicitud/${requestId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.request?.status === 'scheduled') {
          showScheduledPanel(data.request);
        } else if (data.provider) {
          showProvider(data.provider, data.request);
        } else if (data.request?.noProviderDecisionStatus === 'pending') {
          showNoProviderChoice(data.request);
        } else {
          hideScheduledPanel();
          loaderOverlay?.classList.remove('hidden');
          startSearchExperience(data.request);
        }
      })
      .catch(() => {
        loaderOverlay?.classList.remove('hidden');
        startSearchExperience();
      });

    const joinRoom = () => socket.emit('register_client', requestId);
    joinRoom();
    if (!socket.__fundezClientReconnectBound) {
      socket.__fundezClientReconnectBound = true;
      socket.on('connect', () => {
        if (currentRequestId) socket.emit('register_client', currentRequestId);
      });
    }

    socket.off(`request_update_${requestId}`);
    socket.on(`request_update_${requestId}`, (payload) => {
      if (payload.cancelled || payload.request?.status === 'cancelled') {
        stopSearchExperience();
        loaderOverlay?.classList.add('hidden');
        hideScheduledPanel();
        return;
      }
      if (payload.request?.status === 'scheduled') {
        showScheduledPanel(payload.request);
        return;
      }
      if (payload.request?.status === 'searching') {
        const wasHidden = loaderOverlay?.classList.contains('hidden');
        hideScheduledPanel();
        loaderOverlay?.classList.remove('hidden');
        if (wasHidden || !searchTimerInterval) startSearchExperience(payload.request);
      }
      if (payload.provider) {
        stopSearchExperience();
        hideNoProviderChoice();
        hideScheduledPanel();
        showProvider(payload.provider, payload.request);
      } else if (payload.request) {
        syncSearchStartFromRequest(payload.request);
        if (payload.chatMessage) {
          const panel = document.getElementById('jobChatPanel');
          panel?.classList.remove('hidden');
          appendJobChatMessage(payload.chatMessage);
        }
        if (payload.request.noProviderDecisionStatus === 'pending') {
          showNoProviderChoice(payload.request);
          return;
        }
        showBudgetBanner(payload.request);
        showActivityChangeBanner(payload.request);
        showAdditionalPaymentBanner(payload.request);
        syncTripFromRequest(payload.request);
        const completed = payload.request.status === 'completed' || payload.request.techStatus === 'completado';
        if (completed && lastCompletionAlertId !== requestId) {
          lastCompletionAlertId = requestId;
          if (window.FundezAlerts) FundezAlerts.notify({
            type: 'success',
            title: t('client.js.service_completed_title'),
            body: t('client.js.service_completed_body'),
            tag: 'fundez-complete-' + requestId
          });
          loadCompletionSummary(requestId);
        } else if (completed) {
          loadCompletionSummary(requestId);
        }
      }
    });
    socket.off(`provider_location_${requestId}`);
    socket.on(`provider_location_${requestId}`, (payload) => {
      const destLat = parseFloat(page.dataset.destLat);
      const destLng = parseFloat(page.dataset.destLng);
      if (!isNaN(destLat) && typeof FundezMap !== 'undefined') {
        FundezMap.updateProviderLocation('trackingMap', payload.lat, payload.lng, destLat, destLng);
      }
      const locStatus = document.getElementById('providerLocationStatus');
      if (locStatus) {
        locStatus.textContent = payload.etaMinutes
          ? `${t('client.js.tech_live_location')} · ETA ${payload.etaMinutes} min`
          : t('client.js.tech_live_location');
        locStatus.classList.remove('hidden');
      }
      const tripEta = document.getElementById('tripEta');
      if (tripEta && payload.etaMinutes) {
        tripEta.textContent = `ETA ${payload.etaMinutes} min`;
      }
      advanceTripStep('enroute');
    });
    pollForProvider(requestId);
  }

  async function submitRequest() {
    if (submitInFlight) return;

    const address = addressInput.value.trim();
    if (!address) {
      addressInput.focus();
      FundezNotify.show(t('client.js.address_required'), 'warning');
      return;
    }

    const isGift = giftToggle?.checked;
    let gift = null;
    if (isGift) {
      const name = document.getElementById('giftName')?.value.trim();
      const phone = document.getElementById('giftPhone')?.value.trim();
      if (!name) {
        FundezNotify.show(t('client.js.beneficiary_required'), 'warning');
        return;
      }
      gift = {
        name,
        phone: phone || '',
        message: document.getElementById('giftMessage')?.value.trim() || ''
      };
    }

    const activityId = document.getElementById('activityId')?.value || '';
    const customName = document.getElementById('customActivityName')?.value.trim() || '';
    const notes = document.getElementById('notes')?.value.trim() || '';
    if (document.getElementById('activityId') && !activityId) {
      FundezNotify.show(t('client.js.need_subservice'), 'warning');
      document.getElementById('activityId')?.focus();
      return;
    }
    if (activityId === 'otro' && customName.length < 4) {
      FundezNotify.show('En Otro, describe el servicio que necesitas', 'warning');
      document.getElementById('customActivityName')?.focus();
      return;
    }
    if (!notes) {
      FundezNotify.show(t('client.js.need_notes'), 'warning');
      document.getElementById('notes')?.focus();
      return;
    }

    const brandNotVisible = Boolean(brandNotVisibleCheck?.checked);
    const hasProblemPhoto = Boolean(cachedProblemPhoto || clientPhotoInput?.files?.length);
    if (!hasProblemPhoto) {
      FundezNotify.show(t('client.js.need_photo'), 'warning');
      return;
    }
    const hasBrandPhoto = Boolean(cachedBrandPhoto || clientBrandPhotoInput?.files?.length);
    if (!brandNotVisible && !hasBrandPhoto) {
      FundezNotify.show(t('client.js.need_brand_photo'), 'warning');
      return;
    }

    const continueLabel = t('client.js.continue_payment');
    const stickyBtn = document.getElementById('btnRequestSticky');
    const setBusy = (busy) => {
      submitInFlight = busy;
      btnRequest.disabled = busy;
      btnRequest.textContent = busy ? t('client.js.processing') : continueLabel;
      if (stickyBtn) {
        stickyBtn.disabled = busy;
        stickyBtn.textContent = busy ? t('client.js.processing') : continueLabel;
      }
    };

    setBusy(true);

    try {
      if (!latInput.value) await geocodeAddress();
      if (addressCovered === false) {
        setBusy(false);
        FundezNotify.show(t('client.js.coverage_blocked'), 'warning');
        return;
      }

      const clientPhoto = await resolvePhotoDataUrl(clientPhotoInput, cachedProblemPhoto);
      if (!clientPhoto) {
        setBusy(false);
        FundezNotify.show(t('client.js.need_photo'), 'warning');
        return;
      }
      cachedProblemPhoto = clientPhoto;

      let clientBrandPhoto = null;
      if (!brandNotVisible) {
        clientBrandPhoto = await resolvePhotoDataUrl(clientBrandPhotoInput, cachedBrandPhoto);
        if (!clientBrandPhoto) {
          setBusy(false);
          FundezNotify.show(t('client.js.need_brand_photo'), 'warning');
          return;
        }
        cachedBrandPhoto = clientBrandPhoto;
      }

      const clock = deviceLocalClock();
      const res = await fetch('/cliente/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          address,
          notes,
          lat: latInput.value,
          lng: lngInput.value,
          gift,
          clientPhoto,
          clientBrandPhoto,
          brandNotVisible,
          urgencyTier: selectedUrgencyTier,
          activityId,
          customName: activityId === 'otro' ? customName : undefined,
          localTime: clock.localTime,
          timeZone: clock.timeZone
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || t('client.js.process_error'));
      }

      window.location.href = `/pagos/checkout?ref=${data.request.id}`;
    } catch (err) {
      setBusy(false);
      FundezNotify.show(err.message || t('client.js.process_error'), 'error');
    }
  }

  btnRequest.addEventListener('click', submitRequest);

  document.getElementById('btnNoProviderContinue')?.addEventListener('click', () => {
    const id = document.getElementById('noProviderChoicePanel')?.dataset?.requestId || currentRequestId;
    if (id) submitNoProviderChoice('continue', id);
  });
  document.getElementById('btnNoProviderRefund')?.addEventListener('click', () => {
    const id = document.getElementById('noProviderChoicePanel')?.dataset?.requestId || currentRequestId;
    if (!id) return;
    if (!confirm(t('client.js.no_provider_refund_confirm'))) return;
    submitNoProviderChoice('refund', id);
  });

  socket.on('no_provider_choice_required', (payload) => {
    const req = payload?.request;
    if (req && (!currentRequestId || req.id === currentRequestId)) {
      showNoProviderChoice(req);
    }
  });

  document.getElementById('btnRequestSticky')?.addEventListener('click', submitRequest);

  const stickyBar = document.getElementById('stickyOrderBar');
  const requestFormEl = document.getElementById('requestForm');
  if (stickyBar && requestFormEl && !trackingId) {
    const observer = new IntersectionObserver(([entry]) => {
      const visible = !entry.isIntersecting;
      stickyBar.classList.toggle('is-visible', visible);
      stickyBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }, { threshold: 0, rootMargin: '0px 0px -80px 0px' });
    observer.observe(requestFormEl);
  }
})();

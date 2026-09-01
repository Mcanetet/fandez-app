(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

  function t(key, vars) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key, vars) : key;
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
  let selectedUrgencyTier = document.querySelector('input[name="urgencyTier"]:checked')?.value || 'today';
  let geocodeTimer = null;
  let addressCovered = null;
  const socket = io();

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof FandezMap !== 'undefined') {
      FandezMap.init(document.getElementById('addressMap'), {
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
      const scheduleDetails = document.getElementById('urgencyScheduleDetails');
      if (scheduleDetails && (selectedUrgencyTier === 'tomorrow' || selectedUrgencyTier === 'two_days' || selectedUrgencyTier === 'scheduled')) {
        scheduleDetails.open = true;
      }
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
        FandezNotify.show(t('client.js.photo_too_large'), 'warning');
        input.value = '';
        onReady?.(null);
        return;
      }
      const dataUrl = await compressImageFile(file);
      if (!dataUrl) {
        FandezNotify.show(t('client.js.need_photo'), 'warning');
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
    const brandOptional = page?.dataset.brandOptional === '1';
    const skipBrand = Boolean(brandNotVisibleCheck?.checked) || brandOptional;
    if (brandPhotoBlock) {
      brandPhotoBlock.classList.toggle('opacity-50', skipBrand && !brandOptional);
      brandPhotoBlock.classList.toggle('pointer-events-none', skipBrand);
      if (brandOptional) brandPhotoBlock.classList.add('hidden');
    }
    if (clientBrandPhotoInput) {
      clientBrandPhotoInput.disabled = skipBrand;
      clientBrandPhotoInput.required = false;
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
      FandezNotify.show(t('client.js.photo_too_large'), 'warning');
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
        FandezMap.update('addressMap', data.coords.lat, data.coords.lng, data.displayName || address);
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

  const searchExperienceEl = document.getElementById('searchExperience');
  const SEARCH_TIMEOUT_MS = Math.max(
    60 * 1000,
    parseInt(searchExperienceEl?.dataset.timeoutMs || '', 10)
      || ((window.FANDEZ_TIMEOUTS?.unassignedNoticeMinutes || 15) * 60 * 1000)
  );
  const SEARCH_POLL_MS = 2000;
  const SEARCH_RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const SEARCH_TIMEOUT_MINUTES = Math.round(SEARCH_TIMEOUT_MS / 60000);
  const SEARCH_PHASES = [
    { untilMs: Math.round(SEARCH_TIMEOUT_MS * 0.2), step: 'step1', phase: 'near', title: 'client.js.search_title_near', sub: 'client.js.search_sub_near', label: 'client.js.search_phase_near' },
    { untilMs: Math.round(SEARCH_TIMEOUT_MS * 0.47), step: 'step2', phase: 'expand', title: 'client.js.search_title_expand', sub: 'client.js.search_sub_expand', label: 'client.js.search_phase_expand' },
    { untilMs: Math.round(SEARCH_TIMEOUT_MS * 0.8), step: 'step3', phase: 'notify', title: 'client.js.search_title_notify', sub: 'client.js.search_sub_notify', label: 'client.js.search_phase_notify' },
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
      // Si el servidor aún no abre la decisión, no mostrar UI local engañosa.
      searchTimeoutTriggered = false;
      if (data.error) FandezNotify.show(data.error, 'info');
    } catch (_) {
      searchTimeoutTriggered = false;
    }
  }

  function requestSearchStartedAt(request) {
    const raw = request?.searchingAt || request?.paidAt || request?.createdAt;
    const ts = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(ts) ? ts : null;
  }

  function isPastSearchTimeout(request) {
    const started = requestSearchStartedAt(request);
    if (!started) return false;
    return Date.now() - started >= SEARCH_TIMEOUT_MS;
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
      labelEl.textContent = t('client.js.search_progress', {
        elapsed: String(mins),
        total: String(SEARCH_TIMEOUT_MINUTES)
      });
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
    const isFirstPaint = searchCurrentPhase == null;
    searchCurrentPhase = phase.phase;
    setSearchSteps(phase.step, { busy: phase.phase === 'busy' });
    const titleEl = document.getElementById('loaderText');
    const subEl = document.getElementById('loaderSub');
    const labelEl = document.getElementById('searchPhaseLabel');
    const viewersEl = document.getElementById('searchViewersHint');
    if (titleEl) titleEl.textContent = t(phase.title);
    if (subEl) subEl.textContent = t(phase.sub);
    if (labelEl) labelEl.textContent = t(phase.label);
    if (viewersEl) {
      const mins = Math.max(1, Math.floor(elapsedMs / 60000) + 1);
      const viewers = Math.min(12, 2 + mins);
      viewersEl.textContent = t('client.js.search_viewers', { count: String(viewers) });
      viewersEl.classList.remove('hidden');
    }
    updateSearchProgress(elapsedMs);
    if (!isFirstPaint && window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'update',
        title: t(phase.title),
        body: t(phase.sub),
        tag: 'fandez-search-' + phase.phase
      });
    } else if (!isFirstPaint && window.FandezNotify) {
      FandezNotify.show(t(phase.label), 'info');
    }
    return phase;
  }

  function rotateSearchTip() {
    const tipEl = document.getElementById('searchTipText');
    if (!tipEl || !SEARCH_TIPS.length) return;
    searchTipIndex = (searchTipIndex + 1) % SEARCH_TIPS.length;
    tipEl.textContent = t(SEARCH_TIPS[searchTipIndex], { minutes: String(SEARCH_TIMEOUT_MINUTES) });
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
    if (tipEl) tipEl.textContent = t(SEARCH_TIPS[0], { minutes: String(SEARCH_TIMEOUT_MINUTES) });
    applySearchPhase(Date.now() - searchStartedAt);
    searchTimerInterval = setInterval(() => {
      const elapsed = Date.now() - searchStartedAt;
      applySearchPhase(elapsed);
      if (elapsed >= SEARCH_TIMEOUT_MS && currentRequestId) {
        triggerSearchTimeout(currentRequestId);
      }
    }, 1000);
    searchTipInterval = setInterval(rotateSearchTip, 150000);
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
    if (window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'alert',
        title: t('client.js.no_provider_title'),
        body: t('client.js.no_provider_body', { minutes: String(SEARCH_TIMEOUT_MINUTES) }),
        tag: 'fandez-no-provider-' + request.id,
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
    openCancelModal(requestId);
  }

  let cancelTargetId = null;

  function closeCancelModal() {
    const modal = document.getElementById('cancelModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    cancelTargetId = null;
  }

  async function openCancelModal(requestId) {
    cancelTargetId = requestId;
    const modal = document.getElementById('cancelModal');
    const select = document.getElementById('cancelReasonSelect');
    const feeEl = document.getElementById('cancelFeeSummary');
    const refundEl = document.getElementById('cancelRefundSummary');
    const otherWrap = document.getElementById('cancelReasonOtherWrap');
    if (!modal || !select) return;
    select.innerHTML = '<option value="">Cargando…</option>';
    otherWrap?.classList.add('hidden');
    if (feeEl) feeEl.textContent = '…';
    if (refundEl) refundEl.textContent = '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    try {
      const res = await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/cancelacion`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('client.service.cancel_search_error'));
      const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
      if (feeEl) {
        feeEl.textContent = data.fee > 0
          ? t('client.service.cancel_fee_label', { fee: data.feeLabel || fmt(data.fee) })
          : t('client.service.cancel_fee_free');
      }
      if (refundEl) {
        refundEl.textContent = t('client.service.cancel_refund_label', {
          refund: data.refundLabel || fmt(data.refundAmount)
        });
      }
      select.innerHTML = '<option value="">' + t('client.service.cancel_reason_label') + '</option>';
      (data.reasons || []).forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.label;
        select.appendChild(opt);
      });
    } catch (err) {
      closeCancelModal();
      FandezNotify.show(err.message || t('client.service.cancel_search_error'), 'error');
    }
  }

  async function submitCancelModal() {
    if (!cancelTargetId) return;
    const select = document.getElementById('cancelReasonSelect');
    const reasonCode = select?.value;
    const reasonText = document.getElementById('cancelReasonText')?.value.trim() || '';
    if (!reasonCode) {
      FandezNotify.show(t('client.service.cancel_reason_label'), 'warning');
      return;
    }
    if (reasonCode === 'other' && !reasonText) {
      FandezNotify.show(t('client.service.cancel_reason_other'), 'warning');
      return;
    }
    const btn = document.getElementById('cancelModalConfirm');
    const btnSearch = document.getElementById('btnCancelSearch');
    const btnScheduled = document.getElementById('btnCancelScheduled');
    if (btn) btn.disabled = true;
    if (btnSearch) btnSearch.disabled = true;
    if (btnScheduled) btnScheduled.disabled = true;
    try {
      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(cancelTargetId)}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reasonCode, reasonText })
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {
        throw new Error(t('client.service.cancel_search_error'));
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || t('client.service.cancel_search_error'));
      }
      closeCancelModal();
      stopSearchExperience();
      loaderOverlay?.classList.add('hidden');
      hideScheduledPanel();
      const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
      const okBody = data.retentionFee > 0
        ? `Retención ${fmt(data.retentionFee)}. Devolución ${fmt(data.refundAmount)}.`
        : (data.refundAmount > 0
          ? `Devolución completa ${fmt(data.refundAmount)}.`
          : t('client.service.cancel_search_ok_body'));
      if (window.FandezAlerts) {
        FandezAlerts.notify({
          type: 'success',
          title: t('client.service.cancel_search_ok_title'),
          body: okBody,
          toast: 'success'
        });
      } else {
        FandezNotify.show(okBody, 'success');
      }
      setTimeout(() => { window.location.href = '/cliente'; }, 1000);
    } catch (err) {
      if (btn) btn.disabled = false;
      if (btnSearch) btnSearch.disabled = false;
      if (btnScheduled) btnScheduled.disabled = false;
      FandezNotify.show(err.message || t('client.service.cancel_search_error'), 'error');
    }
  }

  document.getElementById('btnCancelSearch')?.addEventListener('click', () => {
    cancelSearchOrSchedule(currentRequestId || page.dataset.tracking);
  });
  document.getElementById('btnCancelScheduled')?.addEventListener('click', () => {
    cancelSearchOrSchedule(scheduledPanel?.dataset.requestId || currentRequestId || page.dataset.tracking);
  });
  document.getElementById('btnCancelService')?.addEventListener('click', () => {
    cancelSearchOrSchedule(currentRequestId || page.dataset.tracking);
  });
  document.getElementById('cancelModalClose')?.addEventListener('click', closeCancelModal);
  document.getElementById('cancelModalBackdrop')?.addEventListener('click', closeCancelModal);
  document.getElementById('cancelModalConfirm')?.addEventListener('click', submitCancelModal);
  document.getElementById('cancelReasonSelect')?.addEventListener('change', (e) => {
    document.getElementById('cancelReasonOtherWrap')?.classList.toggle('hidden', e.target.value !== 'other');
  });

  async function submitNoProviderChoice(choice, requestId) {
    const panel = document.getElementById('noProviderChoicePanel');
    const buttons = panel?.querySelectorAll('button') || [];
    buttons.forEach((b) => { b.disabled = true; });
    try {
      // Asegura pending en servidor (reabre ciclos “seguir buscando” atascados).
      await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/timeout-busqueda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: '{}'
      }).catch(() => null);

      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(requestId)}/sin-socio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ choice })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || t('client.js.no_provider_error'));
      hideNoProviderChoice();
      searchTimeoutTriggered = false;
      const refundDone = choice === 'refund' || data.choice === 'refund' || data.already;
      if (refundDone && (choice === 'refund' || data.choice === 'refund')) {
        const body = data.already
          ? (data.message || t('client.js.refund_requested_body'))
          : t('client.js.refund_requested_body');
        if (window.FandezAlerts) FandezAlerts.notify({
          type: 'success',
          title: t('client.js.refund_requested_title'),
          body,
          toast: 'success'
        });
        else FandezNotify.show(body, 'success');
        setTimeout(() => { window.location.href = '/cliente'; }, 1200);
      } else {
        if (window.FandezAlerts) FandezAlerts.notify({
          type: 'update',
          title: t('client.js.keep_searching_title'),
          body: t('client.js.keep_searching_body'),
          toast: 'info'
        });
        else FandezNotify.show(t('client.js.keep_searching_body'), 'info');
        loaderOverlay?.classList.remove('hidden');
        startTracking(requestId);
      }
    } catch (err) {
      buttons.forEach((b) => { b.disabled = false; });
      FandezNotify.show(err.message || t('client.js.no_provider_error'), 'error');
    }
  }

  function advanceTripStep(step) {
    document.querySelectorAll('.trip-step').forEach(el => {
      el.classList.remove('active', 'done');
    });
    const order = ['paid', 'assigned', 'enroute', 'arrived', 'working', 'done'];
    const idx = order.indexOf(step);
    order.forEach((s, i) => {
      const el = document.querySelector(`.trip-step[data-step="${s}"]`);
      if (!el) return;
      if (i < idx) el.classList.add('done');
      else if (i === idx) el.classList.add('active');
    });
    const etaEl = document.getElementById('tripEta');
    if (!etaEl) return;
    if (step === 'enroute') etaEl.textContent = t('client.js.enroute_home');
    if (step === 'arrived') etaEl.textContent = t('client.js.arrived');
    if (step === 'working') etaEl.textContent = 'En trabajo';
    if (step === 'done') etaEl.textContent = 'Completado';
  }

  function updateTripStatusHero(request, step) {
    const title = document.getElementById('tripStatusTitle');
    const sub = document.getElementById('tripStatusSub');
    const call = document.getElementById('tripHeroCall');
    const sticky = document.getElementById('stickyTrackBar');
    const stickyStatus = document.getElementById('stickyTrackStatus');
    const stickyLabel = document.getElementById('stickyTrackLabel');
    const stickyCall = document.getElementById('stickyTrackCall');
    if (!title || !sub) return;
    const tech = request?.technicianName || 'Tu técnico';
    const reassigning = Boolean(request?.awaitingProviderReassign && !request?.technicianId);
    const map = {
      paid: ['Pago confirmado', 'Estamos conectándote con un equipo Fandez.', 'Buscando equipo'],
      assigned: [
        reassigning
          ? 'El socio está asignando otro técnico'
          : (request?.techStatus === 'asignado' ? 'Esperando aceptación del técnico' : 'Equipo asignado'),
        reassigning
          ? 'El técnico anterior no aceptó a tiempo. El socio debe elegir a otra persona.'
          : (request?.etaLabel
            ? `${tech} · llegada estimada ${request.etaLabel}`
            : 'Te avisamos cuando acepte y salga hacia ti.'),
        reassigning ? 'Reasignando' : (request?.techStatus === 'asignado' ? 'Esperando técnico' : 'Equipo listo')
      ],
      enroute: [`${tech} va en camino`, request?.etaLabel ? `ETA ${request.etaLabel}` : 'Sigue su ubicación en el mapa.', 'En camino'],
      arrived: [`${tech} llegó`, 'Puede iniciar el diagnóstico en tu domicilio.', 'En tu domicilio'],
      working: ['Trabajo en curso', 'Diagnóstico, presupuesto o reparación según lo acordado.', 'En trabajo'],
      done: ['Servicio completado', 'Revisa el resumen y califica tu experiencia.', 'Completado']
    };
    const pair = map[step] || map.assigned;
    title.textContent = pair[0];
    sub.textContent = pair[1];
    if (stickyStatus) stickyStatus.textContent = pair[0];
    if (stickyLabel) stickyLabel.textContent = pair[2] || 'Tu visita';
    const tripLabel = document.getElementById('tripProviderLabel');
    if (tripLabel && request?.awaitingProviderReassign && !request?.technicianId) {
      tripLabel.textContent = 'El socio está asignando otro técnico';
    }

    const phone = request?.technicianPhone
      || request?.providerPhone
      || (document.getElementById('providerPhone')?.getAttribute('href') || '').replace(/^tel:/, '');
    const applyCall = (el) => {
      if (!el) return;
      if (phone && step !== 'done' && step !== 'paid') {
        el.href = `tel:${phone}`;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    };
    applyCall(call);
    applyCall(stickyCall);

    if (sticky) {
      const show = step !== 'done' && !!request?.providerId;
      sticky.classList.toggle('is-visible', show);
      sticky.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  let lastTripStepAlert = null;
  let lastTrackedRequest = null;

  function isDeferredUrgency(request) {
    const tier = String(request?.urgencyTier || '').toLowerCase();
    return ['tomorrow', 'two_days', 'scheduled'].includes(tier);
  }

  function isLiveTrackingActive(request) {
    if (!request?.providerId) return false;
    const ts = String(request.techStatus || '');
    // Desde que el técnico acepta: el cliente puede ver ubicación + ETA declarada.
    if (['aceptado', 'en_camino', 'en_sitio', 'diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado'].includes(ts)) {
      return true;
    }
    if (!isDeferredUrgency(request) && ['assigned', 'in_progress'].includes(request.status) && request.technicianId) {
      return true;
    }
    return false;
  }

  function declaredEtaMinutes(request) {
    if (request?.etaMinutesMin != null && request?.etaMinutesMax != null) {
      return Math.round((Number(request.etaMinutesMin) + Number(request.etaMinutesMax)) / 2);
    }
    return null;
  }

  function updateLiveTrackBanner(request, { etaMinutes, distanceKm, hasLocation } = {}) {
    const shell = document.getElementById('liveTrackShell');
    const etaBox = document.getElementById('liveTrackEta');
    const etaMin = document.getElementById('liveEtaMinutes');
    const title = document.getElementById('liveEtaTitle');
    const sub = document.getElementById('liveEtaSub');
    const hint = document.getElementById('liveTrackHint');
    const badge = document.getElementById('providerAssignBadge');
    if (!shell || !etaBox) return;

    const deferred = isDeferredUrgency(request);
    const enRoute = request?.techStatus === 'en_camino';
    const live = isLiveTrackingActive(request);
    const declared = declaredEtaMinutes(request);
    const displayEta = etaMinutes != null ? etaMinutes : declared;

    shell.classList.toggle('hidden', !request?.coords);
    if (hint) {
      hint.classList.toggle('hidden', !(deferred && !enRoute && !request?.etaLabel && request?.providerId));
    }

    if (!live && deferred && !request?.etaLabel) {
      etaBox.classList.add('is-waiting');
      if (etaMin) etaMin.innerHTML = '—<small>min</small>';
      if (title) title.textContent = t('client.service.live_waiting_title');
      if (sub) sub.textContent = t('client.service.live_scheduled_hint');
      if (badge) badge.textContent = t('client.service.assigned_badge');
      return;
    }

    if (enRoute || hasLocation || request?.etaLabel || live) {
      etaBox.classList.remove('is-waiting');
      if (etaMin) {
        etaMin.innerHTML = displayEta != null
          ? `${displayEta}<small>min</small>`
          : '—<small>min</small>';
      }
      if (title) {
        title.textContent = enRoute || hasLocation
          ? t('client.service.live_enroute_title')
          : (request?.technicianName
            ? `${request.technicianName} tomó tu pedido`
            : t('client.service.live_assigned_title'));
      }
      if (sub) {
        if (request?.etaLabel && !hasLocation) {
          sub.textContent = `Llegada estimada: ${request.etaLabel}`;
        } else {
          const dist = distanceKm != null ? t('client.js.live_distance', { km: distanceKm }) : '';
          sub.textContent = displayEta != null
            ? `${t('client.js.live_eta', { n: displayEta })} ${dist}`.trim()
            : (request?.etaLabel ? `Llegada estimada: ${request.etaLabel}` : t('client.service.live_enroute_sub'));
        }
      }
      if (badge) badge.textContent = enRoute ? t('client.service.live_badge_enroute') : t('client.service.assigned_badge');
      return;
    }

    etaBox.classList.add('is-waiting');
    if (etaMin) etaMin.innerHTML = '—<small>min</small>';
    if (title) title.textContent = t('client.service.live_assigned_title');
    if (sub) sub.textContent = t('client.service.live_assigned_sub');
    if (badge) badge.textContent = t('client.service.assigned_badge');
  }

  function ensureTrackingMap(request, provider) {
    if (!request?.coords || typeof FandezMap === 'undefined') return;
    const shell = document.getElementById('liveTrackShell');
    const tMap = document.getElementById('trackingMap');
    if (!shell || !tMap) return;
    shell.classList.remove('hidden');
    page.dataset.destLat = request.coords.lat;
    page.dataset.destLng = request.coords.lng;

    const prov = provider?.location;
    const showLivePin = isLiveTrackingActive(request) && prov?.lat != null;

    if (!FandezMap.maps.trackingMap) {
      FandezMap.initTracking(tMap, {
        destLat: request.coords.lat,
        destLng: request.coords.lng,
        destLabel: request.address,
        providerLat: showLivePin ? prov.lat : null,
        providerLng: showLivePin ? prov.lng : null
      });
    } else if (showLivePin) {
      FandezMap.updateProviderLocation('trackingMap', prov.lat, prov.lng, request.coords.lat, request.coords.lng);
    }
    setTimeout(() => FandezMap.maps.trackingMap?.invalidateSize?.(), 200);
  }

  function syncTripFromRequest(request) {
    if (!request) return;
    lastTrackedRequest = request;
    if (request.urgencyTier) page.dataset.urgencyTier = request.urgencyTier;
    const ts = request.techStatus;
    let step = 'assigned';
    if (request.status === 'completed' || ts === 'completado') {
      step = 'done';
    } else if (['diagnostico', 'reparando', 'comprando', 'presupuesto_pendiente', 'presupuesto_aprobado'].includes(ts)) {
      step = 'working';
    } else if (ts === 'en_sitio') {
      step = 'arrived';
    } else if (ts === 'en_camino') {
      step = 'enroute';
    } else if (ts === 'aceptado' || ts === 'asignado' || request.providerId) {
      step = 'assigned';
    } else {
      return;
    }
    advanceTripStep(step);
    updateTripStatusHero(request, step);
    updateLiveTrackBanner(request);

    if (lastTripStepAlert === step) return;
    // Solo alertar en hitos de movimiento (no al asignar, eso ya lo hace showProvider)
    if (step === 'enroute' || step === 'arrived') {
      lastTripStepAlert = step;
      if (step === 'enroute') {
        const name = request.technicianName || document.getElementById('providerName')?.textContent || '';
        const body = t('client.js.enroute_alert_body', { name: name || 'Tu técnico' });
        if (window.FandezAlerts) {
          FandezAlerts.notify({
            type: 'alert',
            title: t('client.js.enroute_alert_title'),
            body,
            tag: 'fandez-enroute-' + (request.id || '')
          });
        } else {
          FandezNotify.show(body, 'info');
        }
        document.getElementById('liveTrackShell')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        if (window.FandezAlerts) FandezAlerts.notify({ type: 'update', title: t('client.js.arrived_alert_title'), body: t('client.js.arrived'), tag: 'fandez-arrived' });
        else FandezNotify.show(t('client.js.arrived'), 'info');
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
    if (wasHidden && window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'payment',
        title: t('client.js.budget_alert_title'),
        body: t('client.js.budget_sent', { amount: fmtCLP(sr.budgetAmount), desc: sr.budgetDescription || '' }),
        tag: 'fandez-budget-' + (request.id || currentRequestId)
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
    if (wasHidden && window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'alert',
        title: t('client.js.activity_change_alert_title'),
        body: `${label}: ${change.fromActivityName || '—'} → ${change.toActivityName || '—'}`,
        tag: 'fandez-activity-' + (request.id || currentRequestId),
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
    if (wasHidden && window.FandezAlerts) {
      FandezAlerts.notify({
        type: 'payment',
        title: t('client.js.additional_payment_alert_title'),
        body: `${charge.description || 'Ajuste de servicio'} · ${fmtCLP(charge.amountDue || 0)}`,
        tag: 'fandez-addpay-' + (request.id || currentRequestId),
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
      FandezNotify.show(data.error || t('client.js.respond_error'), 'error');
      return;
    }
    FandezNotify.show(
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
      FandezNotify.show(data.error || t('client.js.respond_error'), 'error');
      return;
    }
    FandezNotify.show(
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

  function roleLabelChat(senderType) {
    if (senderType === 'provider') return 'Socio';
    if (senderType === 'tecnico') return 'Técnico';
    if (senderType === 'client') return 'Cliente';
    return 'Fandez';
  }

  function displayChatName(msg) {
    const raw = String(msg.senderName || '').trim();
    const role = roleLabelChat(msg.senderType);
    if (!raw) return role;
    if (raw.includes('·')) return raw.split('·')[0].trim() || role;
    if (/^(socio|técnico|tecnico|cliente|fandez)/i.test(raw)) return raw;
    return raw;
  }

  function renderJobChatMessage(msg) {
    const isSystem = msg.senderType === 'system';
    const isMine = !isSystem && msg.senderType === 'client';
    const role = msg.senderType || 'system';
    if (isSystem) {
      return `<div class="job-chat-bubble job-chat-bubble--system" data-msg-id="${escapeChatHtml(msg.id)}">${escapeChatHtml(msg.body)}</div>`;
    }
    const cls = `job-chat-bubble ${isMine ? 'job-chat-bubble--mine' : 'job-chat-bubble--theirs'} job-chat-bubble--role-${role}`;
    const meta = `
      <span class="job-chat-meta">
        <span class="job-chat-role job-chat-role--${role}">${escapeChatHtml(roleLabelChat(role))}</span>
        <span class="job-chat-name">${escapeChatHtml(displayChatName(msg))}</span>
        <span class="job-chat-meta__time">${escapeChatHtml(formatChatTime(msg.createdAt))}</span>
      </span>`;
    return `<div class="${cls}" data-msg-id="${escapeChatHtml(msg.id)}">${meta}${escapeChatHtml(msg.body)}</div>`;
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
        FandezNotify.show(err.message || 'No se pudo enviar', 'error');
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
    if (request) {
      lastTrackedRequest = request;
      if (request.urgencyTier) page.dataset.urgencyTier = request.urgencyTier;
    }

    document.getElementById('providerAvatar').textContent = provider.avatar;
    document.getElementById('providerName').textContent = provider.name;
    document.getElementById('providerRating').textContent = provider.rating;
    document.getElementById('providerReviews').textContent = t('client.js.reviews_count', { count: provider.reviewsCount });
    document.getElementById('providerStars').textContent = '★'.repeat(Math.round(provider.rating));
    document.getElementById('providerBio').textContent = provider.bio;
    const adherenceEl = document.getElementById('providerAdherence');
    if (adherenceEl) {
      if (provider.adherenceRate != null || provider.desertionRate != null) {
        adherenceEl.classList.remove('hidden');
        adherenceEl.textContent = `Adherencia ${provider.adherenceRate ?? 100}% · Deserción ${provider.desertionRate ?? 0}% (${provider.jobsTakenCount || 0} pedidos)`;
      } else {
        adherenceEl.classList.add('hidden');
      }
    }
    const changeBtn = document.getElementById('btnChangeProvider');
    if (changeBtn) {
      const canChange = Boolean(request?.canChangeProvider);
      changeBtn.classList.toggle('hidden', !canChange);
      changeBtn.dataset.requestId = request?.id || '';
    }
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
      ensureTrackingMap(request, provider);
      updateLiveTrackBanner(request, {
        hasLocation: Boolean(provider?.location?.lat),
        etaMinutes: declaredEtaMinutes(request),
        distanceKm: null
      });
      const locStatus = document.getElementById('providerLocationStatus');
      if (locStatus) {
        const showLive = isLiveTrackingActive(request) && provider?.location;
        locStatus.classList.toggle('hidden', !showLive);
        if (showLive) {
          locStatus.textContent = provider.location?.label
            ? `${provider.location.label} · ${t('client.js.tech_moving')}`
            : t('client.js.tech_live_location');
        } else if (request?.etaLabel) {
          locStatus.classList.remove('hidden');
          locStatus.textContent = `Llegada estimada: ${request.etaLabel}`;
        }
      }
      const tripEta = document.getElementById('tripEta');
      if (tripEta && request?.etaLabel) {
        tripEta.textContent = `ETA ${request.etaLabel}`;
      }
    }

    loaderOverlay.classList.add('hidden');
    providerCard.classList.remove('hidden');
    requestForm.classList.add('hidden');
    hideNoProviderChoice();
    stopSearchExperience();
    const providerReqId = request?.id || currentRequestId;
    if (window.FandezAlerts && lastProviderAlertId !== providerReqId) {
      lastProviderAlertId = providerReqId;
      FandezAlerts.notify({
        type: 'order',
        title: t('client.js.provider_found'),
        body: provider?.name ? t('client.js.provider_found_body', { name: provider.name }) : t('client.js.provider_found'),
        tag: 'fandez-provider-' + providerReqId
      });
    } else {
      FandezNotify.show(t('client.js.provider_found'), 'success');
    }
  }

  function pollForProvider(requestId, attempts = 0, startedAt = Date.now()) {
    fetch(`/cliente/solicitud/${requestId}`)
      .then(async (r) => {
        if (r.status === 503) {
          throw new Error('store_not_ready');
        }
        return r.json();
      })
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
        if (data.request?.status === 'searching' && isPastSearchTimeout(data.request)) {
          triggerSearchTimeout(requestId);
          return;
        }
        if (Date.now() - (searchStartedAt || startedAt) >= SEARCH_TIMEOUT_MS) {
          triggerSearchTimeout(requestId);
          return;
        }
        setTimeout(() => pollForProvider(requestId, attempts + 1, startedAt), SEARCH_POLL_MS);
      })
      .catch((err) => {
        if (err?.message === 'store_not_ready') {
          const sub = document.getElementById('loaderSub');
          if (sub) {
            sub.textContent = t('client.service.searching_sub_retry')
              || 'La app se está reconectando. Tu pedido sigue en cola; reintentamos en unos segundos…';
          }
        }
        const delay = err?.message === 'store_not_ready' ? 5000 : SEARCH_POLL_MS;
        setTimeout(() => pollForProvider(requestId, attempts + 1, startedAt), delay);
      });
  }

  function startTracking(requestId) {
    currentRequestId = requestId;
    if (window.FandezAlerts) FandezAlerts.ensurePermission();
    // Estado inicial: se define al primer poll / socket.
    fetch(`/cliente/solicitud/${requestId}`)
      .then(async (r) => {
        if (r.status === 503) {
          throw new Error('store_not_ready');
        }
        return r.json();
      })
      .then((data) => {
        if (data.request?.status === 'scheduled') {
          showScheduledPanel(data.request);
        } else if (data.provider) {
          showProvider(data.provider, data.request);
        } else if (data.request?.noProviderDecisionStatus === 'pending') {
          showNoProviderChoice(data.request);
        } else if (data.request?.status === 'searching' && isPastSearchTimeout(data.request)) {
          triggerSearchTimeout(data.request.id || requestId);
        } else {
          hideScheduledPanel();
          loaderOverlay?.classList.remove('hidden');
          startSearchExperience(data.request);
        }
      })
      .catch(() => {
        loaderOverlay?.classList.remove('hidden');
        const sub = document.getElementById('loaderSub');
        if (sub) {
          sub.textContent = t('client.service.searching_sub_retry') || 'La app se está reconectando. Tu pedido sigue en cola; reintentamos en unos segundos…';
        }
        startSearchExperience();
        setTimeout(() => {
          if (currentRequestId === requestId) pollForProvider(requestId, 0, Date.now());
        }, 4000);
      });

    const joinRoom = () => socket.emit('register_client', requestId);
    joinRoom();
    if (!socket.__fandezClientReconnectBound) {
      socket.__fandezClientReconnectBound = true;
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
        hideNoProviderChoice();
        providerCard?.classList.add('hidden');
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
        if (payload.request?.coords) {
          ensureTrackingMap(payload.request, { location: null });
          updateLiveTrackBanner(payload.request);
        }
        const completed = payload.request.status === 'completed' || payload.request.techStatus === 'completado';
        if (completed && lastCompletionAlertId !== requestId) {
          lastCompletionAlertId = requestId;
          if (window.FandezAlerts) FandezAlerts.notify({
            type: 'success',
            title: t('client.js.service_completed_title'),
            body: t('client.js.service_completed_body'),
            tag: 'fandez-complete-' + requestId
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
      const shell = document.getElementById('liveTrackShell');
      shell?.classList.remove('hidden');
      if (!FandezMap.maps.trackingMap && !isNaN(destLat)) {
        const tMap = document.getElementById('trackingMap');
        if (tMap) {
          FandezMap.initTracking(tMap, {
            destLat,
            destLng,
            destLabel: '',
            providerLat: payload.lat,
            providerLng: payload.lng
          });
        }
      } else if (!isNaN(destLat) && typeof FandezMap !== 'undefined') {
        FandezMap.updateProviderLocation('trackingMap', payload.lat, payload.lng, destLat, destLng);
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
      updateLiveTrackBanner(lastTrackedRequest || {
        techStatus: 'en_camino',
        providerId: true,
        urgencyTier: page.dataset.urgencyTier || 'immediate'
      }, { etaMinutes: payload.etaMinutes, distanceKm: payload.distanceKm, hasLocation: true });
      if (lastTrackedRequest) lastTrackedRequest.techStatus = 'en_camino';
      advanceTripStep('enroute');
    });
    pollForProvider(requestId);
  }

  async function submitRequest() {
    if (submitInFlight) return;

    const address = addressInput.value.trim();
    if (!address) {
      addressInput.focus();
      FandezNotify.show(t('client.js.address_required'), 'warning');
      return;
    }

    const isGift = giftToggle?.checked;
    let gift = null;
    if (isGift) {
      const name = document.getElementById('giftName')?.value.trim();
      const phone = document.getElementById('giftPhone')?.value.trim();
      if (!name) {
        FandezNotify.show(t('client.js.beneficiary_required'), 'warning');
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
      FandezNotify.show(t('client.js.need_subservice'), 'warning');
      document.getElementById('activityId')?.focus();
      return;
    }
    if (activityId === 'otro' && customName.length < 4) {
      FandezNotify.show('En Otro, describe el servicio que necesitas', 'warning');
      document.getElementById('customActivityName')?.focus();
      return;
    }
    if (!notes) {
      FandezNotify.show(t('client.js.need_notes'), 'warning');
      document.getElementById('notes')?.focus();
      return;
    }

    const brandOptional = page?.dataset.brandOptional === '1';
    let brandNotVisible = Boolean(brandNotVisibleCheck?.checked) || brandOptional;
    const hasProblemPhoto = Boolean(cachedProblemPhoto || clientPhotoInput?.files?.length);
    const hasBrandPhoto = Boolean(cachedBrandPhoto || clientBrandPhotoInput?.files?.length);
    if (!brandNotVisible && !hasBrandPhoto) {
      // Foto de marca recomendada, no bloqueante: si no hay, tratamos como sin marca
      brandNotVisible = true;
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
        FandezNotify.show(t('client.js.coverage_blocked'), 'warning');
        return;
      }

      let clientPhoto = null;
      if (hasProblemPhoto) {
        clientPhoto = await resolvePhotoDataUrl(clientPhotoInput, cachedProblemPhoto);
        if (!clientPhoto) {
          setBusy(false);
          FandezNotify.show(t('client.js.need_photo'), 'warning');
          return;
        }
        cachedProblemPhoto = clientPhoto;
      }

      let clientBrandPhoto = null;
      if (!brandNotVisible && hasBrandPhoto) {
        clientBrandPhoto = await resolvePhotoDataUrl(clientBrandPhotoInput, cachedBrandPhoto);
        if (!clientBrandPhoto) {
          setBusy(false);
          FandezNotify.show(t('client.js.need_brand_photo'), 'warning');
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
      FandezNotify.show(err.message || t('client.js.process_error'), 'error');
    }
  }

  btnRequest.addEventListener('click', submitRequest);

  function openTrackingChat() {
    const btn = document.getElementById('openJobChatBtn');
    const panel = document.getElementById('jobChatPanel');
    if (btn) btn.click();
    else {
      panel?.classList.remove('hidden');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  document.getElementById('tripHeroChat')?.addEventListener('click', openTrackingChat);
  document.getElementById('stickyTrackChat')?.addEventListener('click', openTrackingChat);

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

  document.getElementById('btnChangeProvider')?.addEventListener('click', async () => {
    const id = document.getElementById('btnChangeProvider')?.dataset?.requestId || currentRequestId;
    if (!id) return;
    if (!confirm('¿Cambiar de socio? Seguiremos buscando otro equipo. Esto afecta la tasa de adherencia del socio actual.')) return;
    const btn = document.getElementById('btnChangeProvider');
    if (btn) btn.disabled = true;
    try {
      const response = await fetch(`/cliente/solicitud/${encodeURIComponent(id)}/cambiar-socio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: '{}'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo cambiar de socio');
      FandezNotify.show('Buscando otro socio para tu pedido…', 'info');
      hideNoProviderChoice();
      providerCard?.classList.add('hidden');
      loaderOverlay?.classList.remove('hidden');
      startTracking(id);
    } catch (err) {
      if (btn) btn.disabled = false;
      FandezNotify.show(err.message || 'No se pudo cambiar de socio', 'error');
    }
  });

  socket.on('no_provider_choice_required', (payload) => {
    const req = payload?.request;
    if (req && (!currentRequestId || req.id === currentRequestId)) {
      showNoProviderChoice(req);
    }
  });

  socket.on('client_open_request_alert', (payload) => {
    if (!window.FandezAlerts) return;
    FandezAlerts.notify({
      type: 'alert',
      title: payload?.title || 'Solicitud abierta',
      body: payload?.body || 'Tienes una solicitud pendiente.',
      tag: 'fandez-open-' + (payload?.requestId || currentRequestId || 'x'),
      requireInteraction: true,
      url: payload?.url || window.location.pathname,
      system: true
    });
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

(function () {
  const form = document.getElementById('registrationForm');
  const addressInput = document.getElementById('address');
  if (!form || !addressInput) return;

  function t(key, vars) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key, vars) : key;
  }

  const communeSelect = document.getElementById('address_commune');
  const communeSearch = document.getElementById('address_commune_search');
  const communeSuggestionsEl = document.getElementById('communeSuggestions');
  const regionSelect = document.getElementById('address_region');
  const latInput = document.getElementById('address_lat');
  const lngInput = document.getElementById('address_lng');
  const placeInput = document.getElementById('address_place_id');
  const unitInput = document.getElementById('address_unit');
  const suggestionsEl = document.getElementById('addressSuggestions');
  const mapStatus = document.getElementById('addressMapStatus');
  const mapActions = document.getElementById('addressMapActions');
  const useGpsBtn = document.getElementById('addressUseGps');
  const confirmBtn = document.getElementById('addressConfirmManual');
  const coverageAlert = document.getElementById('addressCoverageAlert');
  const coverageInterestOpen = document.getElementById('coverageInterestOpen');
  const coverageInterestBlock = document.getElementById('coverageInterestBlock');
  const coverageInterestCommune = document.getElementById('coverage_interest_commune');
  const coverageInterestEmail = document.getElementById('coverage_interest_email');
  const coverageInterestSubmit = document.getElementById('coverageInterestSubmit');
  const coverageInterestStatus = document.getElementById('coverageInterestStatus');
  const addressLabel = document.getElementById('addressLabel');
  const addressHint = document.getElementById('addressHint');
  const roleInputs = document.querySelectorAll('input[name="role"]');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');

  const SANTIAGO = { lat: -33.4489, lng: -70.6693 };
  let suggestTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];
  let addressConfirmed = false;
  let lastSelectedLabel = '';
  let selectedCommune = null;
  let communeCatalog = [];
  let communeFilterTimer = null;
  let communeActiveIndex = -1;
  let communeMatches = [];
  let suggestAbort = null;
  let suggestSeq = 0;
  let mapResetTimer = null;

  function currentRole() {
    const role = document.querySelector('input[name="role"]:checked');
    return role ? role.value : 'provider';
  }

  function isProviderRole() {
    return currentRole() === 'provider';
  }

  function hideCoverage() {
    if (!coverageAlert) return;
    coverageAlert.classList.add('hidden');
    coverageAlert.textContent = '';
  }

  let lastCoverage = null;
  let interestSent = false;

  function setInterestOpen(open, { prefills = true } = {}) {
    if (!coverageInterestBlock) return;
    coverageInterestBlock.classList.toggle('hidden', !open);
    coverageInterestBlock.dataset.open = open ? '1' : '0';
    if (coverageInterestOpen) {
      coverageInterestOpen.classList.toggle('hidden', open);
    }
    if (open && prefills) {
      if (coverageInterestEmail && emailInput && emailInput.value && !coverageInterestEmail.value) {
        coverageInterestEmail.value = emailInput.value.trim();
      }
      if (coverageInterestCommune && !coverageInterestCommune.value) {
        const fromCoverage = lastCoverage && !lastCoverage.covered
          ? (lastCoverage.communeName || '')
          : '';
        const fromSelect = communeSelect && communeSelect.selectedOptions[0]
          ? communeSelect.selectedOptions[0].textContent.trim()
          : '';
        coverageInterestCommune.value = fromCoverage || fromSelect || '';
      }
    }
  }

  function coverageMessageKey(messageKey, forProvider) {
    const key = messageKey || 'coverage.not_available';
    if (!forProvider) return key;
    if (key === 'coverage.region_disabled') return 'coverage.provider_region_disabled';
    if (key === 'coverage.unknown_commune') return 'coverage.provider_unknown_commune';
    return 'coverage.provider_not_available';
  }

  function showCoverage(coverage) {
    if (!coverageAlert) return;
    lastCoverage = coverage || null;
    if (!coverage || coverage.covered) {
      hideCoverage();
      return;
    }
    const forProvider = isProviderRole();
    const key = coverageMessageKey(coverage.messageKey, forProvider);
    coverageAlert.textContent = forProvider
      ? (t(key) || 'Revisa las comunas habilitadas para servicio.')
      : (coverage.message || t(key) || t('coverage.not_available'));
    coverageAlert.classList.remove('hidden');
    if (!interestSent) setInterestOpen(true);
  }

  async function submitCoverageInterest() {
    if (!coverageInterestSubmit || interestSent) return;
    const commune = coverageInterestCommune ? coverageInterestCommune.value.trim() : '';
    const email = (coverageInterestEmail && coverageInterestEmail.value.trim())
      || (emailInput && emailInput.value.trim())
      || '';
    if (coverageInterestStatus) {
      coverageInterestStatus.textContent = '';
      coverageInterestStatus.classList.remove('text-red-600', 'text-emerald-700');
    }
    coverageInterestSubmit.disabled = true;
    try {
      const res = await fetch('/registro/interes-zona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          commune,
          email,
          phone: phoneInput ? phoneInput.value.trim() : '',
          role: currentRole(),
          source: 'registro'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const msg = data.error
          || t(data.errorKey || 'coverage.interest_error')
          || t('coverage.interest_error');
        if (coverageInterestStatus) {
          coverageInterestStatus.textContent = msg;
          coverageInterestStatus.classList.add('text-red-600');
        }
        return;
      }
      interestSent = true;
      if (coverageInterestStatus) {
        coverageInterestStatus.textContent = data.message || t('coverage.interest_thanks');
        coverageInterestStatus.classList.add('text-emerald-700');
      }
      if (coverageInterestSubmit) coverageInterestSubmit.disabled = true;
    } catch (_) {
      if (coverageInterestStatus) {
        coverageInterestStatus.textContent = t('coverage.interest_error');
        coverageInterestStatus.classList.add('text-red-600');
      }
    } finally {
      if (coverageInterestSubmit && !interestSent) coverageInterestSubmit.disabled = false;
    }
  }

  if (coverageInterestOpen) {
    coverageInterestOpen.addEventListener('click', () => setInterestOpen(true));
  }
  if (coverageInterestSubmit) {
    coverageInterestSubmit.addEventListener('click', submitCoverageInterest);
  }
  if (emailInput && coverageInterestEmail) {
    emailInput.addEventListener('change', () => {
      if (!coverageInterestEmail.value) coverageInterestEmail.value = emailInput.value.trim();
    });
  }

  function syncAddressCopy() {
    if (addressLabel) {
      addressLabel.textContent = t('register.address_street');
    }
    if (addressHint) {
      addressHint.textContent = isProviderRole()
        ? t('register.zone_hint')
        : t('register.zone_hint_client');
    }
    if (unitInput) unitInput.required = !isProviderRole();
    if (lastCoverage && !lastCoverage.covered) showCoverage(lastCoverage);
  }

  function setMapStatus(text) {
    if (mapStatus) mapStatus.textContent = text || '';
  }

  function setSearching(isSearching) {
    addressInput.classList.toggle('is-searching', Boolean(isSearching));
    addressInput.setAttribute('aria-busy', isSearching ? 'true' : 'false');
  }

  function parseStreetAndNumber(query) {
    let trimmed = String(query || '').trim().replace(/\s+/g, ' ');
    trimmed = trimmed.split(',')[0].trim();
    const match = trimmed.match(/^(.+?)\s+(?:n[°ºo.]?\s*|nro\.?\s*|no\.?\s*|#\s*)?(\d{1,5}[A-Za-z]?(?:-\d{1,3}[A-Za-z]?)?)$/i);
    if (!match) return null;
    const street = match[1].trim().replace(/[,\s]+$/g, '');
    if (street.length < 2) return null;
    return { street, number: match[2] };
  }

  function syncConfirmButton() {
    if (!confirmBtn) return;
    const canConfirm = !addressInput.disabled
      && !addressConfirmed
      && Boolean(parseStreetAndNumber(addressInput.value));
    confirmBtn.hidden = !canConfirm;
    confirmBtn.disabled = !canConfirm;
  }

  function communeCopy(kind) {
    if (!communeSelect) {
      if (kind === 'placeholder') return t('register.commune_placeholder') || 'Selecciona tu comuna';
      if (kind === 'loading') return t('register.commune_loading') || 'Cargando…';
      if (kind === 'searchPlaceholder') return t('register.commune_search_placeholder') || 'Escribe para buscar tu comuna';
      if (kind === 'noResults') return t('register.commune_no_results') || 'No hay comunas con ese nombre';
      return t('register.commune_region_first') || 'Primero elige la región';
    }
    if (kind === 'placeholder') {
      return communeSelect.dataset.placeholder
        || t('register.commune_placeholder')
        || 'Selecciona tu comuna';
    }
    if (kind === 'loading') {
      return communeSelect.dataset.loading
        || t('register.commune_loading')
        || 'Cargando…';
    }
    if (kind === 'searchPlaceholder') {
      return communeSelect.dataset.searchPlaceholder
        || t('register.commune_search_placeholder')
        || 'Escribe para buscar tu comuna';
    }
    if (kind === 'noResults') {
      return communeSelect.dataset.noResults
        || t('register.commune_no_results')
        || 'No hay comunas con ese nombre';
    }
    return communeSelect.dataset.regionFirst
      || t('register.commune_region_first')
      || 'Primero elige la región';
  }

  function normalizeSearch(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n')
      .trim();
  }

  function setCommuneSearchEnabled(enabled, placeholder) {
    if (!communeSearch) return;
    communeSearch.disabled = !enabled;
    communeSearch.placeholder = placeholder || (enabled ? communeCopy('searchPlaceholder') : communeCopy('regionFirst'));
    if (!enabled) {
      communeSearch.value = '';
      hideCommuneSuggestions();
    }
  }

  function hideCommuneSuggestions() {
    communeActiveIndex = -1;
    communeMatches = [];
    if (communeSuggestionsEl) {
      communeSuggestionsEl.classList.add('hidden');
      communeSuggestionsEl.innerHTML = '';
    }
    if (communeSearch) communeSearch.setAttribute('aria-expanded', 'false');
  }

  function highlightCommuneSuggestion() {
    if (!communeSuggestionsEl) return;
    communeSuggestionsEl.querySelectorAll('.commune-suggestion').forEach((btn, i) => {
      btn.classList.toggle('bg-zilo-accent-soft', i === communeActiveIndex);
    });
  }

  function pickCommune(commune, { close = true } = {}) {
    if (!commune || !communeSelect) return;
    communeSelect.value = commune.code;
    communeSelect.disabled = false;
    communeSelect.setCustomValidity('');
    if (communeSearch) {
      communeSearch.value = commune.name;
      communeSearch.setCustomValidity('');
    }
    if (close) hideCommuneSuggestions();
    loadCommune(commune.code);
  }

  function renderCommuneSuggestions(items, query) {
    if (!communeSuggestionsEl) return;
    communeMatches = items;
    communeActiveIndex = -1;
    if (!items.length) {
      if (query) {
        communeSuggestionsEl.innerHTML = `<p class="px-3 py-2.5 text-sm text-zilo-muted">${escapeHtml(communeCopy('noResults'))}</p>`;
        communeSuggestionsEl.classList.remove('hidden');
        if (communeSearch) communeSearch.setAttribute('aria-expanded', 'true');
      } else {
        hideCommuneSuggestions();
      }
      return;
    }

    communeSuggestionsEl.innerHTML = items.map((item, index) => (
      `<button type="button" class="commune-suggestion w-full text-left px-3 py-2.5 text-sm hover:bg-zilo-accent-soft transition border-b border-zilo-border last:border-b-0" data-index="${index}" role="option">
        <span class="block font-medium text-zilo-text">${escapeHtml(item.name)}</span>
      </button>`
    )).join('');
    communeSuggestionsEl.classList.remove('hidden');
    if (communeSearch) communeSearch.setAttribute('aria-expanded', 'true');
    communeSuggestionsEl.querySelectorAll('.commune-suggestion').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = communeMatches[Number(btn.dataset.index)];
        if (item) pickCommune(item);
      });
    });
  }

  function filterCommunes(query, { showAllIfEmpty = false } = {}) {
    const q = normalizeSearch(query);
    if (!q) {
      if (showAllIfEmpty) {
        renderCommuneSuggestions(communeCatalog.slice(0, 40), '');
      } else {
        hideCommuneSuggestions();
      }
      return;
    }
    const matches = communeCatalog.filter((c) => normalizeSearch(c.name).includes(q));
    matches.sort((a, b) => {
      const an = normalizeSearch(a.name);
      const bn = normalizeSearch(b.name);
      const aStarts = an.startsWith(q) ? 0 : 1;
      const bStarts = bn.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return an.localeCompare(bn);
    });
    renderCommuneSuggestions(matches.slice(0, 40), query);
  }

  function syncCommuneSearchFromSelect() {
    if (!communeSearch || !communeSelect) return;
    const opt = communeSelect.selectedOptions && communeSelect.selectedOptions[0];
    const name = opt && communeSelect.value ? opt.textContent.trim() : '';
    communeSearch.value = name;
  }

  function onPinDrag(lat, lng) {
    if (latInput) latInput.value = Number(lat).toFixed(6);
    if (lngInput) lngInput.value = Number(lng).toFixed(6);
    setMapStatus(t('register.address_pin_adjusted'));
  }

  function enablePinAdjustment(label) {
    if (mapActions) mapActions.classList.remove('hidden');
    setMapStatus(t('register.address_map_tap_hint'));
    if (typeof FandezMap !== 'undefined') {
      FandezMap.enableMapPick('registerAddressMap', onPinDrag, {
        draggable: true,
        onMarkerDrag: onPinDrag
      });
    }
    if (label && typeof FandezMap !== 'undefined') {
      const marker = FandezMap.markers?.registerAddressMap?.destination;
      if (marker) marker.bindPopup(label);
    }
  }

  function disablePinAdjustment() {
    if (mapActions) mapActions.classList.add('hidden');
    if (typeof FandezMap !== 'undefined') {
      FandezMap.disableMapPick('registerAddressMap');
    }
  }

  function showMapAt(lat, lng, label, zoom, { draggable = false } = {}) {
    if (typeof FandezMap === 'undefined' || typeof L === 'undefined') return;
    const mapEl = document.getElementById('registerAddressMap');
    if (!mapEl) return;

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;

    const mapZoom = zoom || 16;
    const markerOptions = {
      zoom: mapZoom,
      markerDraggable: draggable,
      onMarkerDrag: draggable ? onPinDrag : null
    };

    if (!FandezMap.maps.registerAddressMap) {
      FandezMap.init(mapEl, {
        lat: latitude,
        lng: longitude,
        label: label || '',
        zoom: mapZoom,
        interactive: true,
        markerDraggable: draggable,
        onMarkerDrag: draggable ? onPinDrag : null
      });
    } else {
      FandezMap.update('registerAddressMap', latitude, longitude, label || '', markerOptions);
    }
  }

  function resetMapToDefault() {
    showMapAt(SANTIAGO.lat, SANTIAGO.lng, 'Santiago, Chile', 11);
    setMapStatus('');
  }

  function resetMapToCommune() {
    if (selectedCommune) {
      showMapAt(selectedCommune.lat, selectedCommune.lng, selectedCommune.name, 13);
      return;
    }
    resetMapToDefault();
  }

  function scheduleMapReset() {
    clearTimeout(mapResetTimer);
    mapResetTimer = setTimeout(() => resetMapToCommune(), 280);
  }

  function clearAddressConfirmation({ resetMap = true } = {}) {
    addressConfirmed = false;
    lastSelectedLabel = '';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    if (placeInput) placeInput.value = '';
    hideCoverage();
    disablePinAdjustment();
    if (resetMap) scheduleMapReset();
    syncConfirmButton();
  }

  function setAddressFieldEnabled(enabled) {
    addressInput.disabled = !enabled;
    addressInput.placeholder = enabled
      ? t('register.address_street_placeholder')
      : t('register.address_commune_first');
    syncConfirmButton();
  }

  function hideSuggestions() {
    activeIndex = -1;
    currentSuggestions = [];
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
    }
    addressInput.setAttribute('aria-expanded', 'false');
  }

  function getRegionCode() {
    return regionSelect ? regionSelect.value : '';
  }

  function getCommuneCode() {
    return communeSelect ? communeSelect.value : '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resetCommuneOptions(placeholder) {
    if (!communeSelect) return;
    communeCatalog = [];
    communeSelect.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
    communeSelect.value = '';
    communeSelect.disabled = true;
    setCommuneSearchEnabled(false, placeholder);
  }

  function fillCommuneOptions(communes, selectedCode) {
    if (!communeSelect) return;
    communeCatalog = (communes || []).map((c) => ({ code: c.code, name: c.name }));
    const options = [`<option value="">${escapeHtml(communeCopy('placeholder'))}</option>`]
      .concat(communeCatalog.map((c) => (
        `<option value="${escapeHtml(c.code)}"${selectedCode === c.code ? ' selected' : ''}>${escapeHtml(c.name)}</option>`
      )));
    communeSelect.innerHTML = options.join('');
    communeSelect.disabled = false;
    setCommuneSearchEnabled(true, communeCopy('searchPlaceholder'));
    if (selectedCode) {
      communeSelect.value = selectedCode;
      syncCommuneSearchFromSelect();
    } else if (communeSearch) {
      communeSearch.value = '';
    }
    hideCommuneSuggestions();
  }

  async function loadRegionCommunes(regionCode, { preserveCommune = '', preserveAddress = false } = {}) {
    const savedAddress = preserveAddress ? addressInput.value : '';
    const savedLat = preserveAddress && latInput ? latInput.value : '';
    const savedLng = preserveAddress && lngInput ? lngInput.value : '';
    const savedPlace = preserveAddress && placeInput ? placeInput.value : '';

    selectedCommune = null;
    if (!preserveAddress) {
      setAddressFieldEnabled(false);
      addressInput.value = '';
      hideSuggestions();
      hideCoverage();
      clearAddressConfirmation({ resetMap: false });
    }
    clearTimeout(mapResetTimer);

    if (!regionCode) {
      resetCommuneOptions(communeCopy('regionFirst'));
      resetMapToDefault();
      return;
    }

    resetCommuneOptions(communeCopy('loading'));
    try {
      const res = await fetch(`/registro/regiones/${encodeURIComponent(regionCode)}/comunas`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'region_error');
      fillCommuneOptions(data.communes || [], preserveCommune);
      if (preserveCommune && communeSelect?.value === preserveCommune) {
        await loadCommune(preserveCommune, { preserveAddress });
        if (preserveAddress) {
          if (savedAddress) addressInput.value = savedAddress;
          if (latInput && savedLat) latInput.value = savedLat;
          if (lngInput && savedLng) lngInput.value = savedLng;
          if (placeInput && savedPlace) placeInput.value = savedPlace;
          if (savedLat && savedLng) {
            addressConfirmed = true;
            lastSelectedLabel = savedAddress.trim();
            setAddressFieldEnabled(true);
            showMapAt(parseFloat(savedLat), parseFloat(savedLng), savedAddress, 19, { draggable: true });
            enablePinAdjustment(savedAddress);
          }
        }
      } else if (!preserveAddress) {
        resetMapToDefault();
        setMapStatus('');
      }
    } catch (_) {
      resetCommuneOptions(communeCopy('placeholder'));
      setMapStatus(t('register.address_search_fail'));
    }
  }

  async function loadCommune(code, { preserveAddress = false } = {}) {
    const regionCode = getRegionCode();
    if (!code || !regionCode) {
      selectedCommune = null;
      setAddressFieldEnabled(false);
      if (!preserveAddress) addressInput.value = '';
      hideSuggestions();
      hideCoverage();
      resetMapToDefault();
      return;
    }

    setMapStatus(communeCopy('loading'));
    try {
      const res = await fetch(
        `/registro/comunas/${encodeURIComponent(regionCode)}/${encodeURIComponent(code)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'commune_error');

      selectedCommune = {
        code: data.code,
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        regionCode: data.regionCode || regionCode
      };

      setAddressFieldEnabled(true);
      if (!preserveAddress) {
        addressInput.value = '';
        clearAddressConfirmation({ resetMap: false });
      }
      clearTimeout(mapResetTimer);
      if (!preserveAddress || !latInput?.value || !lngInput?.value) {
        showMapAt(data.lat, data.lng, data.name, 13);
      }
      if (data.coverage) showCoverage(data.coverage);
      setMapStatus(t('register.commune_selected', { name: data.name }));
      syncConfirmButton();
    } catch (_) {
      selectedCommune = null;
      setAddressFieldEnabled(false);
      setMapStatus(t('register.address_search_fail'));
    }
  }

  function resolveTypedCommune() {
    if (getCommuneCode()) return true;
    if (!communeSearch || !communeCatalog.length) return false;
    const q = normalizeSearch(communeSearch.value);
    if (!q) return false;
    const exact = communeCatalog.find((c) => normalizeSearch(c.name) === q);
    const starts = communeCatalog.filter((c) => normalizeSearch(c.name).startsWith(q));
    const includes = communeCatalog.filter((c) => normalizeSearch(c.name).includes(q));
    const match = exact
      || (starts.length === 1 ? starts[0] : null)
      || (includes.length === 1 ? includes[0] : null);
    if (!match || !communeSelect) return false;
    communeSelect.disabled = false;
    communeSelect.value = match.code;
    communeSearch.value = match.name;
    selectedCommune = selectedCommune && selectedCommune.code === match.code
      ? selectedCommune
      : { code: match.code, name: match.name, lat: null, lng: null, regionCode: getRegionCode() };
    return true;
  }

  function markConfirmed(item) {
    addressInput.value = item.label;
    lastSelectedLabel = item.label;
    addressConfirmed = true;
    if (latInput) latInput.value = String(item.lat);
    if (lngInput) lngInput.value = String(item.lng);
    if (placeInput) placeInput.value = item.placeId || '';
    hideSuggestions();
    showMapAt(item.lat, item.lng, item.label, item.approximate ? 16 : 19, { draggable: true });
    enablePinAdjustment(item.label);
    syncConfirmButton();
    addressInput.setCustomValidity('');
  }

  function selectSuggestion(item) {
    markConfirmed(item);
    setMapStatus(item.approximate
      ? t('register.address_approx_hint')
      : t('register.address_map_tap_hint'));

    fetch('/registro/direcciones/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: item.label,
        lat: item.lat,
        lng: item.lng,
        placeId: item.placeId,
        regionCode: getRegionCode(),
        communeCode: getCommuneCode()
      })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          // Mantener selección: el usuario ya eligió calle+número y puede ajustar el pin.
          setMapStatus(data.error || t('register.address_approx_hint'));
          return data;
        }
        if (data.coverage) showCoverage(data.coverage);
        if (data.coords?.lat != null && data.coords?.lng != null) {
          if (latInput) latInput.value = Number(data.coords.lat).toFixed(6);
          if (lngInput) lngInput.value = Number(data.coords.lng).toFixed(6);
        }
        return data;
      })
      .catch(() => {
        setMapStatus(t('register.address_approx_hint'));
      });
  }

  function renderSuggestions(items) {
    if (!suggestionsEl) return;
    currentSuggestions = items;
    activeIndex = -1;
    if (!items.length) {
      hideSuggestions();
      return;
    }

    suggestionsEl.innerHTML = items.map((item, index) => (
      `<button type="button" class="address-suggestion w-full text-left px-3 py-2.5 text-sm hover:bg-zilo-accent-soft transition border-b border-zilo-border last:border-b-0" data-index="${index}">
        <span class="block font-medium text-zilo-text">${escapeHtml(item.label)}</span>
        <span class="block text-[11px] text-zilo-muted mt-0.5 truncate">${escapeHtml(item.approximate ? (t('register.address_approx_badge') || 'Aprox. — ajusta el pin') : item.displayName)}</span>
      </button>`
    )).join('');

    suggestionsEl.classList.remove('hidden');
    addressInput.setAttribute('aria-expanded', 'true');
    suggestionsEl.querySelectorAll('.address-suggestion').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = currentSuggestions[Number(btn.dataset.index)];
        if (item) selectSuggestion(item);
      });
    });
  }

  async function fetchSuggestions(query) {
    const communeCode = getCommuneCode();
    const regionCode = getRegionCode();
    if (!regionCode || !communeCode) {
      setMapStatus(!regionCode
        ? t('register.validation_region_required')
        : t('register.validation_commune_required'));
      setSearching(false);
      return;
    }

    if (suggestAbort) suggestAbort.abort();
    const controller = new AbortController();
    suggestAbort = controller;
    const seq = ++suggestSeq;
    setSearching(true);

    try {
      const res = await fetch(
        `/registro/direcciones?q=${encodeURIComponent(query)}&region=${encodeURIComponent(regionCode)}&commune=${encodeURIComponent(communeCode)}`,
        { signal: controller.signal }
      );
      if (seq !== suggestSeq) return;
      const data = await res.json();
      const suggestions = data.suggestions || [];
      renderSuggestions(suggestions);
      if (!suggestions.length && query.length >= 3) {
        if (parseStreetAndNumber(query)) {
          setMapStatus(t('register.address_manual_hint'));
          syncConfirmButton();
        } else {
          setMapStatus(t('register.address_no_results'));
        }
      } else if (suggestions.length) {
        setMapStatus(t('register.address_pick_hint'));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setMapStatus(t('register.address_search_fail'));
      hideSuggestions();
    } finally {
      if (seq === suggestSeq) setSearching(false);
    }
  }

  async function confirmManualAddress() {
    const value = addressInput.value.trim();
    const parsed = parseStreetAndNumber(value);
    if (!parsed || !selectedCommune) {
      addressInput.setCustomValidity(t('register.error_address_street_number'));
      addressInput.reportValidity();
      return;
    }

    setSearching(true);
    setMapStatus(t('register.address_searching'));
    hideSuggestions();

    try {
      const res = await fetch(
        `/registro/direcciones?q=${encodeURIComponent(value)}&region=${encodeURIComponent(getRegionCode())}&commune=${encodeURIComponent(getCommuneCode())}`
      );
      const data = await res.json();
      const first = (data.suggestions || [])[0];
      if (first) {
        selectSuggestion(first);
        return;
      }

      selectSuggestion({
        label: `${parsed.street} ${parsed.number}, ${selectedCommune.name}`,
        displayName: `${parsed.street} ${parsed.number}, ${selectedCommune.name}`,
        lat: selectedCommune.lat,
        lng: selectedCommune.lng,
        placeId: '',
        approximate: true,
        hasStreetNumber: true
      });
    } catch (_) {
      selectSuggestion({
        label: `${parsed.street} ${parsed.number}, ${selectedCommune.name}`,
        displayName: `${parsed.street} ${parsed.number}, ${selectedCommune.name}`,
        lat: selectedCommune.lat,
        lng: selectedCommune.lng,
        placeId: '',
        approximate: true,
        hasStreetNumber: true
      });
    } finally {
      setSearching(false);
    }
  }

  if (regionSelect) {
    regionSelect.addEventListener('change', () => {
      regionSelect.setCustomValidity('');
      loadRegionCommunes(regionSelect.value);
    });
  }

  if (communeSelect) {
    communeSelect.addEventListener('change', () => {
      communeSelect.setCustomValidity('');
      if (communeSearch) communeSearch.setCustomValidity('');
      loadCommune(communeSelect.value);
    });
  }

  if (communeSearch) {
    communeSearch.addEventListener('focus', () => {
      if (communeSearch.disabled || !communeCatalog.length) return;
      filterCommunes(communeSearch.value, { showAllIfEmpty: true });
    });

    communeSearch.addEventListener('input', () => {
      communeSearch.setCustomValidity('');
      if (communeSelect) communeSelect.setCustomValidity('');

      const value = communeSearch.value.trim();
      const selectedName = communeSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
      if (communeSelect?.value && normalizeSearch(value) !== normalizeSearch(selectedName)) {
        communeSelect.value = '';
        selectedCommune = null;
        setAddressFieldEnabled(false);
        addressInput.value = '';
        hideSuggestions();
        clearAddressConfirmation({ resetMap: false });
        resetMapToDefault();
        setMapStatus('');
      }

      clearTimeout(communeFilterTimer);
      communeFilterTimer = setTimeout(() => {
        filterCommunes(value, { showAllIfEmpty: !value });
      }, 120);
    });

    communeSearch.addEventListener('keydown', (e) => {
      if (!communeMatches.length || !communeSuggestionsEl || communeSuggestionsEl.classList.contains('hidden')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = normalizeSearch(communeSearch.value);
          const exact = communeCatalog.find((c) => normalizeSearch(c.name) === q)
            || (communeCatalog.filter((c) => normalizeSearch(c.name).includes(q)).length === 1
              ? communeCatalog.find((c) => normalizeSearch(c.name).includes(q))
              : null);
          if (exact) pickCommune(exact);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        communeActiveIndex = Math.min(communeActiveIndex + 1, communeMatches.length - 1);
        highlightCommuneSuggestion();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        communeActiveIndex = Math.max(communeActiveIndex - 1, 0);
        highlightCommuneSuggestion();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = communeActiveIndex >= 0
          ? communeMatches[communeActiveIndex]
          : communeMatches[0];
        if (item) pickCommune(item);
      } else if (e.key === 'Escape') {
        hideCommuneSuggestions();
      }
    });

    communeSearch.addEventListener('blur', () => {
      setTimeout(() => hideCommuneSuggestions(), 150);
    });
  }

  if (useGpsBtn) {
    useGpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setMapStatus(t('register.address_gps_error'));
        return;
      }
      if (!addressConfirmed) {
        setMapStatus(t('register.address_gps_need_confirm'));
        addressInput?.focus();
        return;
      }
      setMapStatus(t('register.address_gps_loading'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          onPinDrag(latitude, longitude);
          showMapAt(latitude, longitude, addressInput.value, 19, { draggable: true });
          enablePinAdjustment(addressInput.value);
        },
        () => setMapStatus(t('register.address_gps_error')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      confirmManualAddress();
    });
  }

  addressInput.addEventListener('input', () => {
    if (addressInput.disabled) return;
    addressInput.setCustomValidity('');

    const value = addressInput.value.trim();

    // Solo invalidar confirmación cuando había una dirección elegida (evita reiniciar el mapa en cada tecla).
    if (addressConfirmed && value !== lastSelectedLabel) {
      clearAddressConfirmation({ resetMap: true });
    }

    syncConfirmButton();
    clearTimeout(suggestTimer);

    if (value.length < 3) {
      hideSuggestions();
      if (!addressConfirmed && selectedCommune) {
        setMapStatus(t('register.commune_selected', { name: selectedCommune.name }));
      } else if (!addressConfirmed) {
        setMapStatus('');
      }
      return;
    }

    setMapStatus(t('register.address_searching'));
    suggestTimer = setTimeout(() => fetchSuggestions(value), 380);
  });

  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !addressConfirmed && parseStreetAndNumber(addressInput.value)) {
      if (!currentSuggestions.length || suggestionsEl.classList.contains('hidden')) {
        e.preventDefault();
        confirmManualAddress();
        return;
      }
    }

    if (!currentSuggestions.length || suggestionsEl.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentSuggestions.length - 1);
      highlightSuggestion();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightSuggestion();
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(currentSuggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  function highlightSuggestion() {
    suggestionsEl.querySelectorAll('.address-suggestion').forEach((btn, i) => {
      btn.classList.toggle('bg-zilo-accent-soft', i === activeIndex);
    });
  }

  document.addEventListener('click', (e) => {
    if (suggestionsEl && !suggestionsEl.classList.contains('hidden')) {
      if (e.target !== addressInput && !suggestionsEl.contains(e.target)) {
        hideSuggestions();
      }
    }
    if (communeSuggestionsEl && !communeSuggestionsEl.classList.contains('hidden')) {
      if (e.target !== communeSearch && !communeSuggestionsEl.contains(e.target)) {
        hideCommuneSuggestions();
      }
    }
  });

  roleInputs.forEach((r) => r.addEventListener('change', syncAddressCopy));

  form.addEventListener('submit', (e) => {
    resolveTypedCommune();

    if (!getRegionCode()) {
      e.preventDefault();
      if (regionSelect) {
        regionSelect.setCustomValidity(t('register.validation_region_required'));
        regionSelect.reportValidity();
      }
      return;
    }
    if (!getCommuneCode()) {
      e.preventDefault();
      if (communeSelect) {
        communeSelect.disabled = false;
      }
      if (communeSearch) {
        communeSearch.disabled = false;
        communeSearch.setCustomValidity(t('register.validation_commune_required'));
        communeSearch.reportValidity();
        communeSearch.focus();
      } else if (communeSelect) {
        communeSelect.setCustomValidity(t('register.validation_commune_required'));
        communeSelect.reportValidity();
      }
      return;
    }
    if (!addressConfirmed || !latInput.value || !lngInput.value) {
      e.preventDefault();
      if (parseStreetAndNumber(addressInput.value) && !addressConfirmed) {
        setMapStatus(t('register.address_manual_hint'));
        syncConfirmButton();
        if (confirmBtn) {
          confirmBtn.hidden = false;
          confirmBtn.disabled = false;
          confirmBtn.focus();
        }
      }
      addressInput.setCustomValidity(t('register.validation_address_select'));
      addressInput.reportValidity();
      return;
    }
    if (!isProviderRole() && unitInput && unitInput.value.trim().length < 2) {
      e.preventDefault();
      unitInput.setCustomValidity(t('register.error_address_unit_required'));
      unitInput.reportValidity();
      return;
    }
    if (regionSelect) {
      regionSelect.disabled = false;
      regionSelect.setCustomValidity('');
    }
    if (communeSelect) {
      communeSelect.disabled = false;
      communeSelect.setCustomValidity('');
    }
    if (communeSearch) {
      communeSearch.disabled = false;
      communeSearch.setCustomValidity('');
    }
    addressInput.disabled = false;
    addressInput.setCustomValidity('');
    if (unitInput) unitInput.setCustomValidity('');

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && !submitBtn.dataset.submitting) {
      submitBtn.dataset.submitting = '1';
      submitBtn.dataset.originalLabel = submitBtn.textContent || '';
      submitBtn.disabled = true;
      submitBtn.textContent = t('register.submitting') || 'Creando cuenta…';
      setTimeout(() => {
        if (!submitBtn.dataset.submitting) return;
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalLabel || t('register.submit') || 'Crear cuenta';
        delete submitBtn.dataset.submitting;
        setMapStatus(t('register.error_address_timeout') || 'La creación está tardando. Intenta de nuevo.');
        if (typeof FandezNotify !== 'undefined') {
          FandezNotify.show(t('register.error_address_timeout') || 'La creación está tardando. Intenta de nuevo.', 'warning');
        }
      }, 20000);
    }
  });

  form.addEventListener('invalid', (event) => {
    const field = event.target;
    if (field === regionSelect) {
      field.setCustomValidity(t('register.validation_region_required'));
      return;
    }
    if (field === communeSelect || field === communeSearch) {
      field.setCustomValidity(t('register.validation_commune_required'));
      return;
    }
    if (field !== addressInput) return;
    field.setCustomValidity('');
    if (field.validity.valueMissing) {
      field.setCustomValidity(t('register.validation_required'));
    } else if (!addressConfirmed || !latInput.value) {
      field.setCustomValidity(t('register.validation_address_select'));
    }
  }, true);

  if (regionSelect) regionSelect.addEventListener('change', () => regionSelect.setCustomValidity(''));
  if (communeSelect) communeSelect.addEventListener('change', () => {
    communeSelect.setCustomValidity('');
    if (communeSearch) communeSearch.setCustomValidity('');
  });
  if (communeSearch) communeSearch.addEventListener('input', () => communeSearch.setCustomValidity(''));
  if (unitInput) unitInput.addEventListener('input', () => unitInput.setCustomValidity(''));

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(async () => {
    syncAddressCopy();

    const savedAddress = addressInput.value.trim();
    const regionCode = getRegionCode();
    const communeCode = getCommuneCode();

    if (regionCode) {
      const savedLat = latInput ? latInput.value : '';
      const savedLng = lngInput ? lngInput.value : '';
      const savedPlaceId = placeInput ? placeInput.value : '';
      const hadConfirmedAddress = Boolean(savedAddress && savedLat && savedLng);

      if (communeSelect && communeSelect.options.length <= 1) {
        await loadRegionCommunes(regionCode, {
          preserveCommune: communeCode,
          preserveAddress: hadConfirmedAddress
        });
      } else if (communeSelect) {
        communeCatalog = Array.from(communeSelect.options)
          .filter((opt) => opt.value)
          .map((opt) => ({ code: opt.value, name: opt.textContent.trim() }));
        communeSelect.disabled = false;
        setCommuneSearchEnabled(true, communeCopy('searchPlaceholder'));
        syncCommuneSearchFromSelect();
        if (communeCode) {
          await loadCommune(communeCode, { preserveAddress: hadConfirmedAddress });
        }
      }

      if (savedAddress) addressInput.value = savedAddress;
      if (latInput && savedLat) latInput.value = savedLat;
      if (lngInput && savedLng) lngInput.value = savedLng;
      if (placeInput && savedPlaceId) placeInput.value = savedPlaceId;

      const hasCoords = latInput && latInput.value && lngInput && lngInput.value;
      if (hasCoords && communeCode) {
        showMapAt(
          parseFloat(latInput.value),
          parseFloat(lngInput.value),
          addressInput.value,
          19,
          { draggable: true }
        );
        enablePinAdjustment(addressInput.value);
        addressConfirmed = true;
        lastSelectedLabel = addressInput.value.trim();
        setAddressFieldEnabled(true);
      }
      syncConfirmButton();
    } else {
      resetCommuneOptions(communeCopy('regionFirst'));
      setAddressFieldEnabled(false);
      resetMapToDefault();
    }
  });
})();

(function () {
  const page = document.getElementById('trabajoPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  const returnUrl = page.dataset.returnUrl || '/tecnico';
  const isCleaningJob = page.dataset.cleaning === '1' || page.dataset.serviceId === 'limpieza';
  const notify = (msg, type) => { if (window.FandezNotify) window.FandezNotify.show(msg, type); };

  async function fileToBase64(input) {
    const file = input?.files?.[0];
    if (!file) throw new Error('Selecciona un archivo');
    if (window.FandezUpload?.prepareUploadFile) {
      return window.FandezUpload.prepareUploadFile(file);
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('Máximo 5 MB');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function previewFile(input, previewEl) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      previewEl.querySelector('img').src = reader.result;
      previewEl.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  const photoStart = document.getElementById('photoStart');
  const photoEnd = document.getElementById('photoEnd');
  if (photoStart) photoStart.addEventListener('change', () => previewFile(photoStart, document.getElementById('photoStartPreview')));
  if (photoEnd) photoEnd.addEventListener('change', () => previewFile(photoEnd, document.getElementById('photoEndPreview')));

  const hasGardenDeliverables = page.dataset.gardenDeliverables === '1';
  const gardenDeliverablesEditable = page.dataset.observer !== '1';

  function updateGardenDeliverablesUi(progress) {
    const panel = document.querySelector('#stepCierre #gardenDeliverablesPanel');
    if (!panel || !progress) return;
    const count = document.getElementById('gardenDeliverablesCount');
    const bar = document.getElementById('gardenDeliverablesBar');
    const hint = document.getElementById('gardenDeliverablesHint');
    const btn = document.getElementById('btnCompletar');
    if (count) count.textContent = `${progress.done}/${progress.total}`;
    if (bar && progress.total) {
      bar.style.width = `${Math.round((progress.done / progress.total) * 100)}%`;
    }
    panel.dataset.done = String(progress.done);
    panel.dataset.total = String(progress.total);
    if (hint) {
      if (progress.complete) {
        hint.className = 'text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 leading-relaxed';
        hint.textContent = 'Entregables completos. Ya puedes cerrar la visita.';
      } else {
        hint.className = 'text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed';
        hint.textContent = `Para marcar “Trabajo listo” debes subir los ${progress.total} entregables obligatorios.`;
      }
    }
    if (btn && hasGardenDeliverables && gardenDeliverablesEditable) {
      btn.disabled = !progress.complete;
    }
  }

  function markDeliverableCardDone(card, deliverable) {
    if (!card) return;
    card.dataset.status = 'uploaded';
    card.classList.remove('border-zilo-border', 'bg-white');
    card.classList.add('border-emerald-200', 'bg-emerald-50/60');
    const check = card.querySelector('[data-role="deliverable-check"]');
    if (check) {
      check.textContent = '✓';
      check.className = 'mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold bg-emerald-600 text-white';
    }
    const pick = card.querySelector('.fandez-media-pick');
    if (pick) pick.classList.add('hidden');
    let fileLine = card.querySelector('[data-role="deliverable-file"]');
    if (!fileLine) {
      fileLine = document.createElement('p');
      fileLine.className = 'text-[11px] text-emerald-800 mt-1.5';
      fileLine.dataset.role = 'deliverable-file';
      card.querySelector('.min-w-0')?.appendChild(fileLine);
    }
    const name = deliverable?.fileName || 'Ver archivo';
    if (deliverable?.fileUrl) {
      fileLine.innerHTML = '';
      const a = document.createElement('a');
      a.href = deliverable.fileUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'underline font-medium';
      a.textContent = name;
      fileLine.appendChild(a);
    } else {
      fileLine.textContent = 'Archivo cargado';
    }
  }

  async function uploadGardenDeliverable(deliverableId, input) {
    const card = document.querySelector(`#stepCierre [data-deliverable-id="${deliverableId}"]`);
    const statusEl = card?.querySelector('[data-role="deliverable-status"]');
    if (statusEl) {
      statusEl.textContent = 'Subiendo…';
      statusEl.classList.remove('hidden');
    }
    try {
      const file = input?.files?.[0];
      if (!file) throw new Error('Selecciona un archivo');
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      let fileData;
      if (isPdf) {
        if (file.size > 8 * 1024 * 1024) throw new Error('El PDF supera 8 MB');
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
          reader.readAsDataURL(file);
        });
      } else {
        fileData = await fileToBase64(input);
      }
      const res = await fetch(`/tecnico/trabajo/${requestId}/entregables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          deliverableId,
          file: fileData,
          fileName: file.name,
          mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo subir');
      markDeliverableCardDone(card, data.deliverable);
      updateGardenDeliverablesUi(data.progress);
      notify('Entregable cargado', 'success');
      if (statusEl) statusEl.classList.add('hidden');
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || 'Error al subir';
        statusEl.classList.remove('hidden');
      }
      notify(err.message || 'Error al subir entregable', 'error');
      if (input) input.value = '';
    }
  }

  if (hasGardenDeliverables && gardenDeliverablesEditable) {
    document.querySelectorAll('#stepCierre [data-deliverable-input]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.getAttribute('data-deliverable-input');
        if (id && input.files?.length) uploadGardenDeliverable(id, input);
      });
    });
    const panel = document.querySelector('#stepCierre #gardenDeliverablesPanel');
    if (panel) {
      updateGardenDeliverablesUi({
        done: Number(panel.dataset.done || 0),
        total: Number(panel.dataset.total || 0),
        complete: Number(panel.dataset.done || 0) > 0
          && Number(panel.dataset.done) === Number(panel.dataset.total)
      });
    }
  }

  document.querySelectorAll('.diagnosis-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('is-selected');
      chip.classList.toggle('border-zilo-accent');
      chip.classList.toggle('bg-zilo-accent/10');
      chip.classList.toggle('text-zilo-accent');
    });
  });

  document.getElementById('btnTrayecto')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const body = { techStatus: btn.dataset.nextStatus };
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
      const res = await fetch(`/tecnico/status/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar el estado');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo actualizar el estado', 'error');
    }
  });

  document.getElementById('btnConfirmServiceSame')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/confirmar-servicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo confirmar');
      notify('Servicio confirmado', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo confirmar', 'error');
    }
  });

  document.getElementById('btnShowServiceChange')?.addEventListener('click', () => {
    showWizardPanel('cambio');
  });

  document.getElementById('btnToggleServiceChange')?.addEventListener('click', () => {
    const panel = document.getElementById('stepCambioServicio');
    if (!panel) return;
    if (panel.classList.contains('hidden')) showWizardPanel('cambio');
    else syncFieldWizard();
  });

  document.getElementById('btnGoToCierre')?.addEventListener('click', () => {
    showWizardPanel('cierre');
  });

  document.getElementById('btnBackToMaterials')?.addEventListener('click', () => {
    showWizardPanel('materiales');
  });

  const WIZARD_PANELS = ['confirmar', 'trayecto', 'llegada', 'diagnostico', 'accion', 'presupuesto', 'espera', 'mat-propuesta', 'mat-espera', 'materiales', 'cierre', 'cambio'];

  function resolveWizardStep() {
    const nav = document.getElementById('fieldWizard');
    const fromNav = nav?.dataset.step;
    if (fromNav && fromNav !== 'done') return fromNav;
    const ts = page.dataset.techStatus || nav?.dataset.techStatus || '';
    const confirm = nav?.dataset.confirmStatus || '';
    const codeOk = document.getElementById('stepLlegada')?.dataset.codeVerified === '1'
      || document.getElementById('stepDiagnostico')?.dataset.codeVerified === '1';
    if (confirm === 'change_pending') return 'cambio';
    if (ts === 'aceptado' || ts === 'en_camino') return 'trayecto';
    if (ts === 'en_sitio' && !codeOk) return 'llegada';
    if (ts === 'en_sitio' && confirm === 'pending') return 'confirmar';
    if (ts === 'en_sitio') return 'diagnostico';
    if (ts === 'diagnostico') return 'accion';
    if (ts === 'presupuesto_pendiente') return 'presupuesto';
    if (nav?.dataset.matPurchase === 'clarification_pending') return 'mat-propuesta';
    if (ts === 'materiales_pendiente') {
      const matSt = nav?.dataset.matPurchase || '';
      return ['pending', 'payment_pending'].includes(matSt) ? 'mat-espera' : 'mat-propuesta';
    }
    if (ts === 'comprando') return 'materiales';
    if (ts === 'reparando' || ts === 'presupuesto_aprobado') return 'cierre';
    return 'trayecto';
  }

  function showWizardPanel(step) {
    WIZARD_PANELS.forEach((id) => {
      const el = document.querySelector(`[data-wizard-panel="${id}"]`);
      if (!el) return;
      el.classList.toggle('hidden', id !== step);
    });
    const nav = document.getElementById('fieldWizard');
    if (nav && step !== 'cambio') nav.dataset.step = step;
    const active = document.querySelector(`[data-wizard-panel="${step}"]`);
    active?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function syncFieldWizard() {
    showWizardPanel(resolveWizardStep());
  }

  syncFieldWizard();

  document.getElementById('btnVerifyArrivalCode')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnVerifyArrivalCode');
    const code = document.getElementById('arrivalCodeInput')?.value.trim();
    if (!code || code.replace(/\D/g, '').length !== 6) {
      return notify('Ingresa el código de 6 dígitos del cliente', 'warning');
    }
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/codigo-llegada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Código inválido');
      notify('Código verificado', 'success');
      document.getElementById('arrivalCodeGate')?.classList.add('hidden');
      document.getElementById('arrivalCodeOk')?.classList.remove('hidden');
      document.getElementById('stepLlegada')?.setAttribute('data-code-verified', '1');
      document.getElementById('stepDiagnostico')?.setAttribute('data-code-verified', '1');
      const confirm = document.getElementById('fieldWizard')?.dataset.confirmStatus
        || document.getElementById('stepLlegada')?.dataset.confirmStatus
        || '';
      document.getElementById('fieldExtraActions')?.classList.remove('hidden');
      if (confirm === 'pending') {
        document.getElementById('arrivalReviewForm')?.classList.add('hidden');
        showWizardPanel('confirmar');
      } else {
        document.getElementById('arrivalReviewForm')?.classList.remove('hidden');
        showWizardPanel('diagnostico');
      }    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Código incorrecto', 'error');
    }
  });

  document.getElementById('arrivalCodeInput')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('btnLlegada')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnLlegada');
    const chipEls = [...document.querySelectorAll('.diagnosis-chip.is-selected')];
    const chipText = chipEls.map((el) => el.dataset.chip).filter(Boolean).join(', ');
    const detail = document.getElementById('diagnosis').value.trim();
    const diagnosis = [chipText, detail].filter(Boolean).join('. ');
    if (!diagnosis) return notify('Elige al menos una opción o escribe un detalle', 'warning');
    const codeVerified = document.getElementById('stepLlegada')?.dataset.codeVerified === '1'
      || document.getElementById('stepDiagnostico')?.dataset.codeVerified === '1';
    const arrivalCode = document.getElementById('arrivalCodeInput')?.value.trim();
    if (!codeVerified && (!arrivalCode || arrivalCode.replace(/\D/g, '').length !== 6)) {
      return notify('Primero valida el código de seguridad del cliente', 'warning');
    }
    btn.disabled = true;
    try {
      const photoData = await fileToBase64(photoStart);
      const res = await fetch(`/tecnico/trabajo/${requestId}/llegada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ diagnosis, photoStart: photoData, arrivalCode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Llegada registrada', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo registrar', 'error');
    }
  });

  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await fetch(`/tecnico/trabajo/${requestId}/accion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: btn.dataset.action })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');
        notify('Acción registrada', 'success');
        location.reload();
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'Error', 'error');
      }
    });
  });

  document.getElementById('btnMaterialesCompra')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnMaterialesCompra');
    const catalogItems = collectCatalogPickerItems('matPurchaseItems');
    if (!catalogItems.length) return notify('Selecciona al menos un producto del catálogo', 'warning');
    const estimatedAmount = catalogItems.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
    let description = document.getElementById('matPurchaseDesc')?.value.trim() || '';
    if (!description) {
      description = catalogItems.map((i) => `${i.name} ×${i.qty}`).join(', ');
    }
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/materiales-compra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ estimatedAmount, description, catalogItems })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify(
        data.included
          ? 'Material bajo $10.000: incluido en el servicio. Puedes registrar lo usado.'
          : 'Propuesta enviada al cliente. Esperando su decisión.',
        'success'
      );
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo enviar', 'error');
    }
  });

  function collectCatalogPickerItems(containerId) {
    return [...document.querySelectorAll(`#${containerId} [data-catalog-row]`)].map((row) => ({
      catalogId: row.dataset.catalogId || null,
      name: row.dataset.name || '',
      unit: row.dataset.unit || 'unidad',
      qty: Math.max(1, parseInt(row.querySelector('[data-catalog-qty]')?.value, 10) || 1),
      unitPrice: Math.max(0, parseInt(row.dataset.unitPrice, 10) || 0)
    })).filter((i) => i.name && i.unitPrice >= 100);
  }

  function fmtCLP(n) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n) || 0);
  }

  function refreshCatalogPickerTotal(containerId, totalElId, amountInputId) {
    const items = collectCatalogPickerItems(containerId);
    const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const el = document.getElementById(totalElId);
    if (el) el.textContent = fmtCLP(total);
    if (amountInputId) {
      const amount = document.getElementById(amountInputId);
      if (amount && total > 0) amount.value = String(total);
    }
    return total;
  }

  function addCatalogPickerRow(containerId, totalElId, amountInputId, preset) {
    const wrap = document.getElementById(containerId);
    if (!wrap || !preset?.name) return;
    const existing = wrap.querySelector(`[data-catalog-row][data-catalog-id="${preset.catalogId}"]`);
    if (existing && preset.catalogId) {
      const qtyEl = existing.querySelector('[data-catalog-qty]');
      if (qtyEl) qtyEl.value = String((parseInt(qtyEl.value, 10) || 1) + 1);
      refreshCatalogPickerTotal(containerId, totalElId, amountInputId);
      return;
    }
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 p-2 rounded-lg border border-zilo-border bg-white text-sm';
    row.dataset.catalogRow = '1';
    row.dataset.catalogId = preset.catalogId || '';
    row.dataset.name = preset.name;
    row.dataset.unit = preset.unit || 'unidad';
    row.dataset.unitPrice = String(preset.unitPrice || 0);
    row.innerHTML = `
      <div class="min-w-0 flex-1">
        <p class="font-medium truncate">${preset.name}</p>
        <p class="text-[11px] text-zilo-muted">${fmtCLP(preset.unitPrice || 0)} / ${preset.unit || 'unidad'}</p>
      </div>
      <input type="number" data-catalog-qty class="zilo-input !py-1.5 !w-16 text-sm" min="1" max="20" value="${preset.qty || 1}">
      <button type="button" data-catalog-remove class="text-[11px] text-red-600 font-semibold shrink-0">Quitar</button>
    `;
    row.querySelector('[data-catalog-remove]')?.addEventListener('click', () => {
      row.remove();
      refreshCatalogPickerTotal(containerId, totalElId, amountInputId);
    });
    row.querySelector('[data-catalog-qty]')?.addEventListener('input', () => {
      refreshCatalogPickerTotal(containerId, totalElId, amountInputId);
    });
    wrap.appendChild(row);
    refreshCatalogPickerTotal(containerId, totalElId, amountInputId);
  }

  document.getElementById('btnAddMatPurchaseItem')?.addEventListener('click', () => {
    const sel = document.getElementById('matPurchaseCatalog');
    const opt = sel?.selectedOptions?.[0];
    if (!opt?.value) return notify('Elige un producto del catálogo', 'warning');
    addCatalogPickerRow('matPurchaseItems', 'matPurchaseCatalogTotal', 'matPurchaseAmount', {
      catalogId: opt.value,
      name: opt.dataset.name || opt.textContent,
      unit: opt.dataset.unit || 'unidad',
      unitPrice: parseInt(opt.dataset.price, 10) || 0,
      qty: 1
    });
    const desc = document.getElementById('matPurchaseDesc');
    if (desc && !desc.value.trim()) desc.value = opt.dataset.name || '';
    sel.value = '';
  });

  document.getElementById('btnAddChangeProduct')?.addEventListener('click', () => {
    const sel = document.getElementById('changeProductCatalog');
    const opt = sel?.selectedOptions?.[0];
    if (!opt?.value) return notify('Elige un producto del catálogo', 'warning');
    addCatalogPickerRow('changeProductItems', 'changeProductTotal', null, {
      catalogId: opt.value,
      name: opt.dataset.name || opt.textContent,
      unit: opt.dataset.unit || 'unidad',
      unitPrice: parseInt(opt.dataset.price, 10) || 0,
      qty: 1
    });
    sel.value = '';
  });

  document.getElementById('btnRequestMaterialsOk')?.addEventListener('click', () => {
    const amount = document.getElementById('matAmount')?.value;
    const desc = document.getElementById('matDesc')?.value.trim()
      || document.getElementById('matCatalog')?.selectedOptions?.[0]?.dataset?.name
      || '';
    if (amount) {
      const wrap = document.getElementById('matPurchaseAmount');
      if (wrap) wrap.value = amount;
    }
    if (desc) {
      const d = document.getElementById('matPurchaseDesc');
      if (d) d.value = desc;
    }
    const cat = document.getElementById('matCatalog')?.selectedOptions?.[0];
    if (cat?.value) {
      addCatalogPickerRow('matPurchaseItems', 'matPurchaseCatalogTotal', 'matPurchaseAmount', {
        catalogId: cat.value,
        name: cat.dataset.name || cat.textContent,
        unit: cat.dataset.unit || 'unidad',
        unitPrice: parseInt(cat.dataset.price, 10) || 0,
        qty: Math.max(1, parseInt(document.getElementById('matQty')?.value, 10) || 1)
      });
    }
    showWizardPanel('mat-propuesta');
  });

  function toggleOtherFields() {
    const select = document.getElementById('changeActivityId');
    const box = document.getElementById('changeOtherFields');
    const manual = document.getElementById('changeManualPriceWrap');
    if (!select || !box) return;
    const isOther = select.value === 'otro';
    box.classList.toggle('hidden', !isOther || isCleaningJob);
    if (manual) {
      const lines = collectChangeLineItems();
      manual.classList.toggle('hidden', isCleaningJob || !(isOther && lines.length === 0));
    }
  }

  function collectChangeLineItems() {
    if (isCleaningJob) return [];
    const rows = [...document.querySelectorAll('#changeLineItems [data-line-row]')];
    return rows.map((row) => {
      const description = row.querySelector('[data-line-desc]')?.value.trim() || '';
      const unit = row.querySelector('[data-line-unit]')?.value || 'unidad';
      const qty = parseFloat(row.querySelector('[data-line-qty]')?.value);
      const unitPrice = parseInt(row.querySelector('[data-line-price]')?.value, 10);
      return { description, unit, qty, unitPrice };
    }).filter((item) => item.description && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0);
  }

  function readCleaningReeval() {
    const m2 = parseFloat(document.getElementById('changeSquareMeters')?.value);
    return {
      squareMeters: Number.isFinite(m2) ? m2 : null,
      hasPets: Boolean(document.getElementById('changeHasPets')?.checked),
      postEvent: Boolean(document.getElementById('changePostEvent')?.checked)
    };
  }

  function estimateCleaningBase(m2, hasPets, postEvent) {
    const area = Math.max(20, Number(m2) || 20);
    let base = Math.max(30000, Math.round(area * 1500));
    let mult = 1;
    if (hasPets) mult += 0.15;
    if (postEvent) mult += 0.15;
    return Math.round(base * mult);
  }

  function refreshCleaningPreview() {
    const el = document.getElementById('changeCleaningPreview');
    if (!el || !isCleaningJob) return;
    const f = readCleaningReeval();
    if (f.squareMeters == null || f.squareMeters < 20) {
      el.textContent = '—';
      return;
    }
    el.textContent = fmtCLP(estimateCleaningBase(f.squareMeters, f.hasPets, f.postEvent));
  }

  function refreshChangeLineTotal() {
    const items = collectChangeLineItems();
    const total = items.reduce((sum, item) => sum + Math.round(item.qty * item.unitPrice), 0);
    const el = document.getElementById('changeLineTotal');
    if (el) el.textContent = fmtCLP(total);
    const custom = document.getElementById('changeCustomBasePrice');
    if (custom && items.length) custom.value = String(total);
    toggleOtherFields();
    return total;
  }

  function addChangeLineRow(preset = {}) {
    if (isCleaningJob) return;
    const wrap = document.getElementById('changeLineItems');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'p-2.5 rounded-lg border border-zilo-border bg-white space-y-2';
    row.dataset.lineRow = '1';
    row.innerHTML = `
      <input type="text" data-line-desc class="zilo-input w-full !py-2 text-sm" maxlength="160" placeholder="Tarea (ej: demolicion radier)" value="${preset.description || ''}">
      <div class="grid grid-cols-3 gap-2">
        <select data-line-unit class="zilo-input !py-2 text-xs">
          <option value="unidad">Unidad</option>
          <option value="m2">m²</option>
          <option value="ml">ml</option>
          <option value="glb">Global</option>
        </select>
        <input type="number" data-line-qty class="zilo-input !py-2 text-sm" min="0.1" step="0.1" placeholder="Cant." value="${preset.qty != null ? preset.qty : '1'}">
        <input type="number" data-line-price class="zilo-input !py-2 text-sm" min="0" step="1000" placeholder="$ / und" value="${preset.unitPrice != null ? preset.unitPrice : ''}">
      </div>
      <button type="button" data-line-remove class="text-[11px] text-red-600 font-semibold">Quitar</button>
    `;
    const unitSel = row.querySelector('[data-line-unit]');
    if (preset.unit && unitSel) unitSel.value = preset.unit;
    row.querySelector('[data-line-remove]')?.addEventListener('click', () => {
      row.remove();
      refreshChangeLineTotal();
    });
    row.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', refreshChangeLineTotal);
      el.addEventListener('change', refreshChangeLineTotal);
    });
    wrap.appendChild(row);
    refreshChangeLineTotal();
  }

  document.getElementById('btnAddChangeLine')?.addEventListener('click', () => addChangeLineRow());
  if (!isCleaningJob && document.getElementById('changeLineItems')) {
    addChangeLineRow({ description: '', unit: 'unidad', qty: 1 });
  }

  ['changeSquareMeters', 'changeHasPets', 'changePostEvent'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', refreshCleaningPreview);
    el?.addEventListener('change', refreshCleaningPreview);
  });
  refreshCleaningPreview();

  async function loadChangeActivities() {
    const select = document.getElementById('changeActivityId');
    if (!select) return;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/subservicios`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      select.innerHTML = isCleaningJob
        ? '<option value="">Elige el tipo de limpieza…</option>'
        : '<option value="">Elige el subservicio correcto…</option>';
      (data.activities || []).forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        const same = a.id === data.currentActivityId;
        opt.dataset.perM2 = a.pricePerM2 || '';
        opt.textContent = same
          ? `${a.name} — mismo tipo + ajuste de condiciones`
          : `${a.name} — ${a.basePriceLabel}`;
        if (same) opt.selected = true;
        select.appendChild(opt);
      });
      if (!isCleaningJob) {
        const other = document.createElement('option');
        other.value = 'otro';
        other.textContent = 'Otro / obra adicional — con lista de tareas';
        select.appendChild(other);
      }
      select.addEventListener('change', toggleOtherFields);
      toggleOtherFields();
    } catch (_) {
      select.innerHTML = '<option value="">No se pudieron cargar subservicios</option>';
    }
  }
  loadChangeActivities();

  document.getElementById('btnProposeChange')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnProposeChange');
    const activityId = document.getElementById('changeActivityId')?.value;
    const notes = document.getElementById('changeNotes')?.value.trim();
    const customName = document.getElementById('changeCustomName')?.value.trim();
    const lineItems = collectChangeLineItems();
    const lineTotal = lineItems.reduce((sum, item) => sum + Math.round(item.qty * item.unitPrice), 0);
    const materialsPreview = isCleaningJob ? [] : collectCatalogPickerItems('changeProductItems');
    const customBasePrice = lineTotal > 0
      ? lineTotal
      : document.getElementById('changeCustomBasePrice')?.value;
    const cleaning = isCleaningJob ? readCleaningReeval() : null;
    if (!activityId) return notify(isCleaningJob ? 'Elige el tipo de limpieza' : 'Elige el nuevo subservicio', 'warning');
    if (!notes) return notify('Explica el cambio / reevaluación', 'warning');
    if (isCleaningJob) {
      if (cleaning.squareMeters == null || cleaning.squareMeters < 20) {
        return notify('Indica los m² reales (mín. 20)', 'warning');
      }
    } else if (activityId === 'otro') {
      if (!customName || customName.length < 4) {
        return notify('En Otro, escribe el nombre del servicio', 'warning');
      }
      if ((!customBasePrice || Number(customBasePrice) < 100000) && !materialsPreview.length) {
        return notify('Indica el nuevo precio (mín. $100.000), agrega ítems o un producto', 'warning');
      }
    }
    btn.disabled = true;
    try {
      const photo = await fileToBase64(document.getElementById('changePhoto'));
      const payload = {
        activityId,
        notes,
        photo,
        customName,
        customBasePrice,
        lineItems,
        materialsPreview,
        catalogItems: materialsPreview
      };
      if (isCleaningJob) {
        payload.squareMeters = cleaning.squareMeters;
        payload.cleaningFactors = {
          hasPets: cleaning.hasPets,
          postEvent: cleaning.postEvent
        };
      }
      const res = await fetch(`/tecnico/trabajo/${requestId}/cambio-servicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Cambio de precio enviado al cliente para su decisión', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'No se pudo proponer el cambio', 'error');
    }
  });

  document.getElementById('btnPresupuesto')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnPresupuesto');
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/presupuesto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          amount: document.getElementById('budgetAmount').value,
          description: document.getElementById('budgetDesc').value
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Presupuesto enviado al cliente', 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error', 'error');
    }
  });

  function syncMaterialSourceUi() {
    const source = document.querySelector('input[name="matSource"]:checked')?.value || 'stock';
    const receiptWrap = document.getElementById('matReceiptWrap');
    const stockHint = document.getElementById('matStockHint');
    receiptWrap?.classList.toggle('hidden', source !== 'purchased');
    stockHint?.classList.toggle('hidden', source === 'purchased');
    document.querySelectorAll('label.zilo-choice-card').forEach((label) => {
      const input = label.querySelector('input[name="matSource"]');
      if (!input) return;
      label.classList.toggle('border-zilo-accent', input.checked);
      label.classList.toggle('bg-zilo-accent-soft/40', input.checked);
    });
  }

  function syncMaterialCatalogUi() {
    const select = document.getElementById('matCatalog');
    const opt = select?.selectedOptions?.[0];
    const desc = document.getElementById('matDesc');
    const amount = document.getElementById('matAmount');
    const qty = Math.max(1, parseInt(document.getElementById('matQty')?.value, 10) || 1);
    if (!opt || !opt.value) return;
    if (desc && !desc.value) desc.value = opt.dataset.name || opt.textContent || '';
    if (desc && opt.dataset.name) desc.value = opt.dataset.name;
    const unitPrice = parseInt(opt.dataset.price, 10) || 0;
    if (amount && unitPrice) amount.value = String(unitPrice * qty);
  }

  document.querySelectorAll('input[name="matSource"]').forEach((el) => {
    el.addEventListener('change', syncMaterialSourceUi);
  });
  document.getElementById('matCatalog')?.addEventListener('change', syncMaterialCatalogUi);
  document.getElementById('matQty')?.addEventListener('input', syncMaterialCatalogUi);
  syncMaterialSourceUi();

  document.getElementById('btnAddMaterial')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnAddMaterial');
    const catalogId = document.getElementById('matCatalog')?.value || '';
    const description = document.getElementById('matDesc').value.trim();
    const amount = document.getElementById('matAmount').value;
    const quantity = document.getElementById('matQty')?.value || 1;
    const source = document.querySelector('input[name="matSource"]:checked')?.value || 'stock';
    if (!description && !catalogId) return notify('Elige un material del catálogo o escribe el nombre', 'warning');
    if (!amount && !catalogId) return notify('Indica el precio del material', 'warning');
    const receiptInput = document.getElementById('matReceipt');
    if (source === 'purchased' && !receiptInput?.files?.[0]) {
      return notify('Sube la boleta o factura del material comprado', 'warning');
    }
    btn.disabled = true;
    btn.textContent = source === 'purchased' ? 'Revisando boleta…' : 'Agregando…';
    try {
      let receipt = null;
      if (source === 'purchased' && receiptInput?.files?.[0]) receipt = await fileToBase64(receiptInput);
      const res = await fetch(`/tecnico/trabajo/${requestId}/material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          description,
          amount,
          quantity,
          catalogId: catalogId || null,
          source,
          receipt
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      const reviewMsg = data.review?.status === 'approved'
        ? 'Material agregado'
        : (data.review?.status === 'pending_founder'
          ? 'Material agregado · boleta pendiente del founder'
          : (data.review?.status === 'pending_manual'
            ? 'Material agregado · boleta pendiente de revisión'
            : 'Material agregado'));
      notify(reviewMsg, 'success');
      location.reload();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '+ Agregar material';
      notify(err.message || 'Error', 'error');
    }
  });

  document.getElementById('btnCompletar')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnCompletar');
    if (hasGardenDeliverables) {
      const panel = document.querySelector('#stepCierre #gardenDeliverablesPanel');
      const done = Number(panel?.dataset?.done || 0);
      const total = Number(panel?.dataset?.total || 0);
      if (total > 0 && done < total) {
        return notify(`Faltan entregables (${done}/${total}). Súbelos antes de cerrar.`, 'warning');
      }
    }
    const workNotes = document.getElementById('workNotes').value.trim();
    if (!workNotes) return notify('Escribe el resumen del trabajo', 'warning');

    const checks = [...document.querySelectorAll('#attentionChecklist [data-checklist-id]')];
    const items = {};
    let missing = 0;
    checks.forEach((el) => {
      items[el.dataset.checklistId] = el.checked;
      if (!el.checked) missing += 1;
    });
    if (missing > 0) {
      const ok = confirm(`Faltan ${missing} ítem(s) del checklist de atención. ¿Completar de todos modos?`);
      if (!ok) return;
    }

    btn.disabled = true;
    try {
      const photoData = await fileToBase64(photoEnd);
      const res = await fetch(`/tecnico/trabajo/${requestId}/completar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          workNotes,
          photoEnd: photoData,
          attentionChecklist: { items, incompleteWarned: missing > 0 }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      if (data.additionalCharge) {
        notify(`Visita completada · Cliente debe pagar materiales (${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(data.additionalCharge.amountDue || 0)})`, 'success');
      } else {
        notify('¡Visita completada!', 'success');
      }
      showSettlement(data.settlement);
    } catch (err) {
      btn.disabled = false;
      notify(err.message || 'Error al completar', 'error');
    }
  });

  function showSettlement(s) {
    const box = document.getElementById('settlementResult');
    if (!s || !s.completed || !box) {
      setTimeout(() => { window.location.href = returnUrl; }, 800);
      return;
    }
    const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const techPay = s.technicianPay || null;
    const heroAmount = techPay && techPay.technicianPayout != null
      ? techPay.technicianPayout
      : s.providerPayout;
    const isSelf = Boolean(techPay?.selfOperator);
    const configured = techPay?.configured !== false;

    set('setCharged', fmt(s.grandTotal));
    set('setCardLabel', `Mercado Pago valor presente ${s.merchantCardFeePercent || 0}%`);
    set('setCard', `−${fmt(s.cardFee)}`);
    set('setAppLabel', `Comisión Fandez ${Math.round((s.laborCommissionRate || 0) * 100)}% IVA incl.`);
    set('setApp', `−${fmt(s.laborCommission)}`);
    if (s.materialsTotal) {
      set('setMaterialsKeep', fmt(s.materialsTotal));
    } else {
      document.getElementById('setMaterialsKeepRow')?.classList.add('hidden');
    }
    document.getElementById('setMaterialsRow')?.classList.add('hidden');
    set('setIvaLabel', `IVA incluido en comisión y MP (desglose)`);
    set('setIva', fmt(s.ivaOnFees));
    set('setCompanyNet', fmt(s.providerPayout));
    set('setPayout', fmt(heroAmount));
    set('setPayoutHero', fmt(heroAmount));

    const titleEl = document.getElementById('setPayoutTitle');
    const lineLabel = document.getElementById('setPayoutLineLabel');
    const labelEl = document.getElementById('setTechPayLabel');
    const noteEl = document.getElementById('setSettlementNote');
    if (isSelf) {
      if (titleEl) titleEl.textContent = 'Tu ganancia';
      if (lineLabel) lineLabel.textContent = 'Tu neto';
      if (labelEl) labelEl.textContent = 'Eres el socio: recibes el neto de la empresa.';
      if (noteEl) {
        noteEl.textContent = 'De la mano de obra: comisión Fandez e IVA incluido y costo Mercado Pago. Los materiales son 100% de la empresa.';
      }
    } else if (configured && techPay?.technicianPayout != null) {
      if (titleEl) titleEl.textContent = 'Tu pago';
      if (lineLabel) lineLabel.textContent = 'Tu pago';
      if (labelEl) labelEl.textContent = techPay.label || 'Según acuerdo con tu socio';
      if (noteEl) {
        noteEl.textContent = 'Monto según el acuerdo que definió tu socio (% o fijo sobre el neto de la empresa).';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Neto empresa';
      if (lineLabel) lineLabel.textContent = 'Neto empresa';
      if (labelEl) labelEl.textContent = 'Tu socio aún no definió tu pago en Equipo.';
      if (noteEl) {
        noteEl.textContent = 'Pide a tu socio que configure tu % o monto fijo en Mi equipo.';
      }
    }

    document.querySelectorAll('#trabajoPage main > section.field-step, #trabajoPage main > #fieldExtraActions').forEach((el) => {
      el.classList.add('hidden');
    });
    document.querySelectorAll('#trabajoPage main > section').forEach((el) => {
      if (el.id !== 'settlementResult') el.classList.add('hidden');
    });
    box.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const socket = io();
  socket.on(`request_update_${requestId}`, (payload) => {
    const r = payload.request;
    if (r?.siteReport?.budgetStatus === 'approved' && r.techStatus === 'presupuesto_aprobado') {
      if (window.FandezAlerts) FandezAlerts.notify({
        type: 'payment',
        title: 'Presupuesto aprobado',
        body: 'El cliente aprobó el presupuesto. Puedes continuar el trabajo.',
        tag: 'fandez-budget-approved-' + requestId
      });
      else notify('¡El cliente aprobó el presupuesto!', 'success');
      setTimeout(() => location.reload(), 900);
    }
    if (payload?.chatMessage) appendChat(payload.chatMessage);
  });

  const isObserver = page.dataset.observer === '1';
  const chatBase = page.dataset.chatBase || '/tecnico';
  const myChatRole = isObserver ? 'provider' : 'tecnico';
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
      return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

  function renderChatMsg(msg) {
    const isSystem = msg.senderType === 'system';
    const isMine = !isSystem && msg.senderType === myChatRole;
    const role = msg.senderType || 'system';
    if (isSystem) {
      return `<div class="job-chat-bubble job-chat-bubble--system" data-msg-id="${escapeHtml(msg.id)}">${escapeHtml(msg.body)}</div>`;
    }
    const cls = `job-chat-bubble ${isMine ? 'job-chat-bubble--mine' : 'job-chat-bubble--theirs'} job-chat-bubble--role-${role}`;
    const meta = `
      <span class="job-chat-meta">
        <span class="job-chat-role job-chat-role--${role}">${escapeHtml(roleLabel(role))}</span>
        <span class="job-chat-name">${escapeHtml(displayName(msg))}</span>
        <span class="job-chat-meta__time">${escapeHtml(formatTime(msg.createdAt))}</span>
      </span>`;
    const photo = window.FandezJobChat ? FandezJobChat.renderPhotoBlock(msg, escapeHtml) : '';
    const text = window.FandezJobChat ? FandezJobChat.renderBodyBlock(msg, escapeHtml) : escapeHtml(msg.body || '');
    return `<div class="${cls}" data-msg-id="${escapeHtml(msg.id)}">${meta}${text}${photo}</div>`;
  }

  function appendChat(msg) {
    if (!chatThread || !msg?.id) return;
    if (chatThread.querySelector(`[data-msg-id="${msg.id}"]`)) return;
    chatThread.insertAdjacentHTML('beforeend', renderChatMsg(msg));
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function openChat() {
    if (!chatModal) return;
    chatModal.classList.remove('hidden');
    try {
      const res = await fetch(`${chatBase}/chat/${requestId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo abrir el chat');
      if (chatTitle && data.peerName) chatTitle.textContent = data.peerName;
      const youAre = document.getElementById('jobChatYouAre');
      if (youAre && data.youAre) youAre.textContent = `Escribes como ${data.youAre}`;
      if (chatThread) {
        chatThread.innerHTML = (data.messages || []).map(renderChatMsg).join('')
          || '<p class="text-xs text-zilo-muted text-center px-4">Coordina llegada, acceso y detalles del servicio.</p>';
        chatThread.scrollTop = chatThread.scrollHeight;
      }
      socket.emit('register_client', requestId);
      chatInput?.focus();
    } catch (err) {
      notify(err.message || 'No se pudo abrir el chat', 'error');
      chatModal.classList.add('hidden');
    }
  }

  function closeChat() {
    chatModal?.classList.add('hidden');
  }

  document.getElementById('btnOpenFieldChat')?.addEventListener('click', openChat);
  document.getElementById('btnOpenFieldChatFab')?.addEventListener('click', openChat);
  document.getElementById('btnOpenFieldChatFromTips')?.addEventListener('click', openChat);

  const SAFETY_CATS = [
    { id: 'unsafe_feeling', label: 'Me siento inseguro/a' },
    { id: 'harassment', label: 'Acoso o conducta indebida' },
    { id: 'theft', label: 'Robo o hurto' },
    { id: 'assault_threat', label: 'Amenaza o agresión' },
    { id: 'fraud', label: 'Fraude o cobro indebido' },
    { id: 'other_safety', label: 'Otro problema de seguridad' }
  ];
  let techSafetyCat = null;

  function closeTechSafetyModal() {
    const modal = document.getElementById('safetyModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    techSafetyCat = null;
    const notes = document.getElementById('safetyNotes');
    if (notes) notes.value = '';
    const end = document.getElementById('safetyEndVisit');
    if (end) end.checked = false;
    const submit = document.getElementById('safetyModalSubmit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Enviar alerta';
    }
  }

  function openTechSafetyModal() {
    const modal = document.getElementById('safetyModal');
    const list = document.getElementById('safetyCategoryList');
    const submit = document.getElementById('safetyModalSubmit');
    if (!modal || !list || page.dataset.observer === '1') return;
    list.innerHTML = SAFETY_CATS.map((c) => (
      `<button type="button" data-safety-cat="${c.id}" class="w-full text-left px-3 py-3 rounded-xl border border-zilo-border text-sm hover:border-red-300 hover:bg-red-50">${c.label}</button>`
    )).join('');
    list.querySelectorAll('[data-safety-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        techSafetyCat = btn.getAttribute('data-safety-cat');
        list.querySelectorAll('[data-safety-cat]').forEach((b) => {
          b.classList.toggle('border-red-400', b === btn);
          b.classList.toggle('bg-red-50', b === btn);
        });
        if (submit) submit.disabled = false;
      });
    });
    if (submit) submit.disabled = true;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function submitTechSafety() {
    if (!requestId || !techSafetyCat) return;
    const submit = document.getElementById('safetyModalSubmit');
    const notes = document.getElementById('safetyNotes')?.value || '';
    const endVisit = Boolean(document.getElementById('safetyEndVisit')?.checked);
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Enviando…';
    }
    try {
      const res = await fetch(`/tecnico/trabajo/${encodeURIComponent(requestId)}/seguridad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ categoryId: techSafetyCat, channel: 'sos', notes, endVisit })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      closeTechSafetyModal();
      notify(data.message || 'Alerta registrada. Si hay riesgo llama al 133.', 'success');
    } catch (err) {
      notify(err.message || 'Error', 'error');
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Enviar alerta';
      }
    }
  }

  document.getElementById('btnTechSafety')?.addEventListener('click', openTechSafetyModal);
  document.getElementById('safetyModalClose')?.addEventListener('click', closeTechSafetyModal);
  document.getElementById('safetyModalBackdrop')?.addEventListener('click', closeTechSafetyModal);
  document.getElementById('safetyModalSubmit')?.addEventListener('click', submitTechSafety);
  chatModal?.querySelector('[data-role="chat-close"]')?.addEventListener('click', closeChat);
  chatModal?.querySelector('[data-role="chat-backdrop"]')?.addEventListener('click', closeChat);
  socket.on(`request_chat_${requestId}`, (payload) => {
    if (payload?.message) appendChat(payload.message);
  });

  const photoCtl = window.FandezJobChat ? FandezJobChat.bindPhotoComposer(chatForm) : null;

  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = chatInput?.value.trim() || '';
    const photo = photoCtl?.getPhoto?.() || null;
    if (!body && !photo) return;
    if (chatInput) chatInput.value = '';
    try {
      const res = await fetch(`${chatBase}/chat/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body, photo })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      photoCtl?.clear?.();
      appendChat(data.message);
    } catch (err) {
      notify(err.message || 'No se pudo enviar', 'error');
    }
  });

  if (isObserver) {
    document.querySelectorAll('#trabajoPage button, #trabajoPage input, #trabajoPage textarea, #trabajoPage select')
      .forEach((el) => {
        if (el.closest('#jobChatModal') || el.id === 'btnOpenFieldChat' || el.id === 'btnOpenFieldChatFab' || el.id === 'btnOpenFieldChatFromTips') return;
        if (el.closest('[data-role="provider-reassign"]')) return;
        if (el.closest('[data-role="provider-chat-note"]')) return;
        if (el.closest('a')) return;
        el.disabled = true;
      });

    document.getElementById('btnFieldReassign')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnFieldReassign');
      const select = document.getElementById('fieldTechSelect');
      const technicianId = select?.value;
      if (!technicianId) {
        notify('Selecciona un técnico', 'warning');
        select?.focus();
        return;
      }
      btn.disabled = true;
      try {
        const res = await fetch(`/proveedor/asignar/${requestId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ technicianId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo reasignar');
        if (data.selfOperator) {
          notify('Quedaste asignado tú. Abriendo terreno…', 'success');
          setTimeout(() => { window.location.href = `/proveedor/trabajo/${encodeURIComponent(requestId)}`; }, 500);
          return;
        }
        notify(
          data.reassigned
            ? `Reasignado a ${data.request.technicianName}. Le llega correo y aviso.`
            : `Asignado a ${data.request.technicianName}.`,
          'success'
        );
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        btn.disabled = false;
        notify(err.message || 'No se pudo reasignar', 'error');
      }
    });

    document.getElementById('btnProviderExtraNote')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnProviderExtraNote');
      const input = document.getElementById('providerExtraNote');
      const body = String(input?.value || '').trim();
      if (body.length < 4) {
        notify('Escribe el adicional o cambio (mín. 4 caracteres)', 'warning');
        input?.focus();
        return;
      }
      btn.disabled = true;
      try {
        const res = await fetch(`${chatBase}/chat/${requestId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ body: `Adicional / cambio: ${body}` })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
        if (input) input.value = '';
        notify('Enviado al chat del cliente', 'success');
        if (data.message) appendChat(data.message);
        openChat();
      } catch (err) {
        notify(err.message || 'No se pudo enviar', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Mapa + GPS en vivo (técnico envía; socio solo observa)
  const destLat = parseFloat(page.dataset.destLat);
  const destLng = parseFloat(page.dataset.destLng);
  const mapEl = document.getElementById('fieldMap');
  const liveBadge = document.getElementById('fieldLiveBadge');
  if (mapEl && typeof FandezMap !== 'undefined' && !isNaN(destLat) && !isNaN(destLng)) {
    FandezMap.initTracking(mapEl, {
      destLat,
      destLng,
      destLabel: 'Domicilio',
      providerLat: null,
      providerLng: null
    });
  }

  if (!isObserver && navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (liveBadge) {
          liveBadge.textContent = 'En vivo · Técnico Fandez';
          liveBadge.className = 'text-[10px] text-zilo-success font-medium';
        }
        if (typeof FandezMap !== 'undefined' && !isNaN(destLat)) {
          FandezMap.updateProviderLocation('fieldMap', lat, lng, destLat, destLng);
        }
        fetch('/tecnico/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, requestId })
        }).catch(() => {});
      },
      () => {
        if (liveBadge) liveBadge.textContent = 'Activa el GPS para que el cliente te vea';
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  } else if (isObserver && liveBadge) {
    liveBadge.textContent = 'Supervisión · el técnico envía su ubicación';
  }

  socket.on(`provider_location_${requestId}`, (payload) => {
    if (!payload || payload.lat == null) return;
    if (liveBadge) {
      liveBadge.textContent = payload.etaMinutes
        ? `En vivo · ETA ${payload.etaMinutes} min`
        : 'En vivo';
      liveBadge.className = 'text-[10px] text-zilo-success font-medium';
    }
    if (typeof FandezMap !== 'undefined' && !isNaN(destLat)) {
      FandezMap.updateProviderLocation('fieldMap', payload.lat, payload.lng, destLat, destLng);
    }
  });
  socket.emit('register_client', requestId);

  if (window.FandezCall && !window.__fandezCallReady) {
    FandezCall.init({
      socket,
      role: isObserver ? 'provider' : 'tecnico',
      name: page.dataset.userName || (isObserver ? 'Socio' : 'Técnico')
    });
    window.__fandezCallReady = true;
  }

  document.getElementById('btnJobVoiceCall')?.addEventListener('click', async () => {
    try {
      await FandezCall.start(requestId, chatTitle?.textContent || 'Cliente');
    } catch (err) {
      notify(err.message || 'No se pudo iniciar la llamada', 'error');
    }
  });

  function resumeFieldJob() {
    socket.emit('register_client', requestId);
    if (isObserver || !navigator.geolocation || !requestId) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        fetch('/tecnico/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, requestId })
        }).catch(() => {});
        if (typeof FandezMap !== 'undefined' && !isNaN(destLat)) {
          FandezMap.updateProviderLocation('fieldMap', lat, lng, destLat, destLng);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  }

  if (window.FandezMobile?.onResume) {
    FandezMobile.onResume(() => resumeFieldJob());
  } else {
    window.addEventListener('fandez:resume', () => resumeFieldJob());
  }
})();

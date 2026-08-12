(function () {
  const page = document.getElementById('trabajoPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  const returnUrl = page.dataset.returnUrl || '/tecnico';
  const notify = (msg, type) => { if (window.FundezNotify) window.FundezNotify.show(msg, type); };

  function fileToBase64(input) {
    return new Promise((resolve, reject) => {
      const file = input?.files?.[0];
      if (!file) return reject(new Error('Selecciona un archivo'));
      if (file.size > 6 * 1024 * 1024) return reject(new Error('Máximo 6 MB'));
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

  document.getElementById('btnTrayecto')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const res = await fetch(`/tecnico/status/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ techStatus: btn.dataset.nextStatus })
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

  const WIZARD_PANELS = ['confirmar', 'trayecto', 'llegada', 'accion', 'presupuesto', 'espera', 'materiales', 'cierre', 'cambio'];

  function resolveWizardStep() {
    const nav = document.getElementById('fieldWizard');
    const fromNav = nav?.dataset.step;
    if (fromNav && fromNav !== 'done') return fromNav;
    const ts = page.dataset.techStatus || nav?.dataset.techStatus || '';
    const confirm = nav?.dataset.confirmStatus || '';
    if (ts === 'aceptado' && confirm === 'pending') return 'confirmar';
    if (confirm === 'change_pending') return 'cambio';
    if (ts === 'aceptado' || ts === 'en_camino') return 'trayecto';
    if (ts === 'en_sitio') return 'llegada';
    if (ts === 'diagnostico') return 'accion';
    if (ts === 'presupuesto_pendiente') return 'presupuesto';
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

  document.getElementById('btnLlegada')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnLlegada');
    const diagnosis = document.getElementById('diagnosis').value.trim();
    if (!diagnosis) return notify('Describe lo que observas', 'warning');
    btn.disabled = true;
    try {
      const photoData = await fileToBase64(photoStart);
      const res = await fetch(`/tecnico/trabajo/${requestId}/llegada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ diagnosis, photoStart: photoData })
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

  function toggleOtherFields() {
    const select = document.getElementById('changeActivityId');
    const box = document.getElementById('changeOtherFields');
    if (!select || !box) return;
    box.classList.toggle('hidden', select.value !== 'otro');
  }

  async function loadChangeActivities() {
    const select = document.getElementById('changeActivityId');
    if (!select) return;
    try {
      const res = await fetch(`/tecnico/trabajo/${requestId}/subservicios`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error');
      select.innerHTML = '<option value="">Elige el subservicio correcto…</option>';
      (data.activities || []).forEach((a) => {
        if (a.id === data.currentActivityId) return;
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.name} — ${a.basePriceLabel}`;
        select.appendChild(opt);
      });
      const other = document.createElement('option');
      other.value = 'otro';
      other.textContent = 'Otro — describir manualmente';
      select.appendChild(other);
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
    const customBasePrice = document.getElementById('changeCustomBasePrice')?.value;
    if (!activityId) return notify('Elige el nuevo subservicio', 'warning');
    if (!notes) return notify('Explica el cambio', 'warning');
    if (activityId === 'otro') {
      if (!customName || customName.length < 4) {
        return notify('En Otro, escribe el nombre del servicio', 'warning');
      }
      if (!customBasePrice || Number(customBasePrice) < 100000) {
        return notify('En Otro, indica el precio base (mín. $100.000)', 'warning');
      }
    }
    btn.disabled = true;
    try {
      const photo = await fileToBase64(document.getElementById('changePhoto'));
      const res = await fetch(`/tecnico/trabajo/${requestId}/cambio-servicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ activityId, notes, photo, customName, customBasePrice })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      notify('Cambio enviado al cliente para aprobación', 'success');
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

  document.getElementById('btnAddMaterial')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnAddMaterial');
    const description = document.getElementById('matDesc').value.trim();
    const amount = document.getElementById('matAmount').value;
    if (!description || !amount) return notify('Completa descripción y precio', 'warning');
    const receiptInput = document.getElementById('matReceipt');
    if (!receiptInput?.files?.[0]) return notify('Sube la boleta o factura del material', 'warning');
    btn.disabled = true;
    btn.textContent = 'Revisando boleta…';
    try {
      let receipt = null;
      if (receiptInput?.files?.[0]) receipt = await fileToBase64(receiptInput);
      const res = await fetch(`/tecnico/trabajo/${requestId}/material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ description, amount, receipt })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error');
      const reviewMsg = data.review?.status === 'approved'
        ? 'Material agregado · boleta aprobada por IA'
        : (data.review?.status === 'pending_manual'
          ? 'Material agregado · boleta pendiente de revisión'
          : 'Material agregado');
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
      const ok = confirm(`Faltan ${missing} ítem(s) del Procedimiento de atención Fundez. ¿Completar de todos modos?`);
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
      notify('¡Visita completada!', 'success');
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

    set('setCharged', fmt(s.grandTotal));
    set('setCardLabel', `Tarjeta y administración ${s.merchantCardFeePercent || 0}%`);
    set('setCard', `−${fmt(s.cardFee)}`);
    set('setAppLabel', `Fee aplicación ${Math.round((s.laborCommissionRate || 0) * 100)}%`);
    set('setApp', `−${fmt(s.laborCommission)}`);
    if (s.materialsTotal) {
      set('setMaterialsKeep', fmt(s.materialsTotal));
    } else {
      document.getElementById('setMaterialsKeepRow')?.classList.add('hidden');
    }
    document.getElementById('setMaterialsRow')?.classList.add('hidden');
    set('setIvaLabel', `IVA ${Math.round((s.ivaRate || 0) * 100)}% sobre comisión/cargos`);
    set('setIva', `−${fmt(s.ivaOnFees)}`);
    set('setPayout', fmt(s.providerPayout));

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
      if (window.FundezAlerts) FundezAlerts.notify({
        type: 'payment',
        title: 'Presupuesto aprobado',
        body: 'El cliente aprobó el presupuesto. Puedes continuar el trabajo.',
        tag: 'fundez-budget-approved-' + requestId
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
    return 'Fundez';
  }

  function displayName(msg) {
    const raw = String(msg.senderName || '').trim();
    const role = roleLabel(msg.senderType);
    if (!raw) return role;
    if (raw.includes('·')) return raw.split('·')[0].trim() || role;
    if (/^(socio|técnico|tecnico|cliente|fundez)/i.test(raw)) return raw;
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
    return `<div class="${cls}" data-msg-id="${escapeHtml(msg.id)}">${meta}${escapeHtml(msg.body)}</div>`;
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
  chatModal?.querySelector('[data-role="chat-close"]')?.addEventListener('click', closeChat);
  chatModal?.querySelector('[data-role="chat-backdrop"]')?.addEventListener('click', closeChat);
  socket.on(`request_chat_${requestId}`, (payload) => {
    if (payload?.message) appendChat(payload.message);
  });

  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = chatInput?.value.trim();
    if (!body) return;
    chatInput.value = '';
    try {
      const res = await fetch(`${chatBase}/chat/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      appendChat(data.message);
    } catch (err) {
      notify(err.message || 'No se pudo enviar', 'error');
    }
  });

  if (isObserver) {
    document.querySelectorAll('#trabajoPage button, #trabajoPage input, #trabajoPage textarea, #trabajoPage select')
      .forEach((el) => {
        if (el.closest('#jobChatModal') || el.id === 'btnOpenFieldChat' || el.id === 'btnOpenFieldChatFab') return;
        if (el.closest('a')) return;
        el.disabled = true;
      });
  }

  // Mapa + GPS en vivo (técnico envía; socio solo observa)
  const destLat = parseFloat(page.dataset.destLat);
  const destLng = parseFloat(page.dataset.destLng);
  const mapEl = document.getElementById('fieldMap');
  const liveBadge = document.getElementById('fieldLiveBadge');
  if (mapEl && typeof FundezMap !== 'undefined' && !isNaN(destLat) && !isNaN(destLng)) {
    FundezMap.initTracking(mapEl, {
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
          liveBadge.textContent = 'En vivo · Técnico Fundez';
          liveBadge.className = 'text-[10px] text-zilo-success font-medium';
        }
        if (typeof FundezMap !== 'undefined' && !isNaN(destLat)) {
          FundezMap.updateProviderLocation('fieldMap', lat, lng, destLat, destLng);
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
    if (typeof FundezMap !== 'undefined' && !isNaN(destLat)) {
      FundezMap.updateProviderLocation('fieldMap', payload.lat, payload.lng, destLat, destLng);
    }
  });
  socket.emit('register_client', requestId);
})();

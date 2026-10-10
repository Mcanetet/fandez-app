(function () {
  const root = document.getElementById('alandFabRoot');
  if (!root) return;

  const panel = document.getElementById('alandFabPanel');
  const toggle = document.getElementById('alandFabToggle');
  const closeBtn = document.getElementById('alandFabClose');
  const messagesEl = document.getElementById('alandFabMessages');
  const form = document.getElementById('alandFabForm');
  const input = document.getElementById('alandFabInput');
  const sendBtn = form?.querySelector('button[type="submit"]');

  let conversationId = null;
  let socket = null;
  let starting = false;
  let sending = false;
  let clientId = null;

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMessage(msg) {
    const isClient = msg.senderType === 'client';
    const isAland = msg.senderType === 'aland';
    const isSystem = msg.senderType === 'system';
    const align = isClient ? 'text-right' : 'text-left';
    const bg = isClient
      ? 'bg-aland text-white'
      : isAland
        ? 'bg-white border border-slate-200'
        : isSystem
          ? 'bg-amber-50 text-amber-900 border border-amber-200'
          : 'bg-blue-50 border border-blue-100';
    const name = msg.senderName || (isAland ? 'Sofía' : msg.senderType);
    return `<div class="${align}"><div class="inline-block max-w-[92%] px-3 py-2 rounded-xl text-sm ${bg}"><span class="block text-[10px] opacity-70 mb-0.5">${escapeHtml(name)}</span>${escapeHtml(msg.body).replace(/\n/g, '<br>')}</div></div>`;
  }

  function appendMessage(msg) {
    if (!messagesEl || !msg) return;
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(msg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setBusy(on) {
    if (sendBtn) {
      sendBtn.disabled = Boolean(on);
      sendBtn.textContent = on ? 'Enviando…' : 'Enviar';
    }
    if (input) input.disabled = Boolean(on);
  }

  async function fetchJson(url, options, timeoutMs = 25000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        ...options,
        signal: ctrl?.signal,
        credentials: 'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function ensureSocket(joinClientId) {
    if (!window.io) return null;
    if (!socket) {
      socket = window.FandezSocket?.socket || io();
      socket.on('aland_message', (payload) => {
        if (!payload?.message) return;
        if (payload.conversationId && conversationId && payload.conversationId !== conversationId) {
          conversationId = payload.conversationId;
          messagesEl.innerHTML = '';
          appendMessage(payload.message);
          openPanel(true);
          notifyIncoming(payload.message, true);
          return;
        }
        if (!conversationId || payload.conversationId === conversationId) {
          if (!conversationId && payload.conversationId) conversationId = payload.conversationId;
          appendMessage(payload.message);
          notifyIncoming(payload.message, !panel || panel.classList.contains('hidden'));
        }
      });
      socket.on('journey_update', async (payload) => {
        if (payload?.conversationId && payload.conversationId !== conversationId) {
          await adoptConversation(payload.conversationId, payload.message);
        } else if (payload?.message) {
          appendMessage(payload.message);
        }
        openPanel(true);
        if (window.FandezAlerts && payload?.message) {
          FandezAlerts.notify({
            type: 'message',
            title: 'Sofía',
            body: payload.message.body || 'Actualización de tu servicio',
            tag: 'fandez-journey',
            toast: false
          });
        }
      });
      socket.on('no_provider_choice_required', async (payload) => {
        if (payload?.conversationId) await adoptConversation(payload.conversationId, payload.message);
        openPanel(true);
      });
    }
    if (joinClientId || clientId) {
      clientId = joinClientId || clientId;
      socket.emit('aland_join', { clientId, conversationId: conversationId || undefined });
    }
    return socket;
  }

  function notifyIncoming(msg, panelHidden) {
    if (!msg || msg.senderType === 'client' || msg.senderType === 'system') return;
    if (!window.FandezAlerts) return;
    FandezAlerts.notify({
      type: 'message',
      title: msg.senderName || 'Sofía',
      body: msg.body || 'Tienes un mensaje nuevo',
      tag: 'fandez-aland-msg',
      system: panelHidden || document.hidden
    });
  }

  async function adoptConversation(id, seedMessage) {
    if (!id) return;
    conversationId = id;
    ensureSocket(clientId);
    if (socket) socket.emit('aland_join', { conversationId: id, clientId });
    try {
      const { res, data } = await fetchJson('/aland/client/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mode: 'support', conversationId: id })
      });
      if (res.ok && data.success && data.messages) {
        messagesEl.innerHTML = '';
        data.messages.forEach(appendMessage);
        return;
      }
    } catch (_) { /* fallback seed */ }
    if (seedMessage) {
      messagesEl.innerHTML = '';
      appendMessage(seedMessage);
    }
  }

  async function startSupportChat() {
    if (conversationId) return conversationId;
    if (starting) {
      // Esperar un inicio en curso en vez de ignorar el envío.
      for (let i = 0; i < 40 && starting; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (conversationId) return conversationId;
    }
    starting = true;
    try {
      const { res, data } = await fetchJson('/aland/client/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mode: 'support' })
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo iniciar Sofía');
      }
      conversationId = data.conversation.id;
      clientId = data.conversation.clientId;
      messagesEl.innerHTML = '';
      (data.messages || []).forEach(appendMessage);
      ensureSocket(clientId);
      if (socket) socket.emit('aland_join', { conversationId, clientId });

      if (!data.openaiConfigured) {
        appendMessage({
          senderType: 'system',
          senderName: 'Sofía',
          body: 'Estoy en modo asistencia rápida (sin IA). Igual te oriento con pedidos, pagos y cobertura.'
        });
      }
      return conversationId;
    } finally {
      starting = false;
    }
  }

  async function openPanel(skipStart) {
    panel.classList.remove('hidden');
    if (window.FandezAlerts) FandezAlerts.ensurePermission();
    if (!conversationId && !skipStart) {
      try {
        await startSupportChat();
      } catch (err) {
        if (window.FandezNotify) FandezNotify.show(err.message, 'error');
        else appendMessage({ senderType: 'system', senderName: 'Sistema', body: err.message });
      }
    }
    input?.focus();
  }

  function closePanel() {
    panel.classList.add('hidden');
  }

  if (window.io) {
    const presetClientId = root.dataset.clientId || null;
    ensureSocket(presetClientId);
  }

  toggle?.addEventListener('click', () => {
    if (panel.classList.contains('hidden')) openPanel();
    else closePanel();
  });
  closeBtn?.addEventListener('click', closePanel);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = (input?.value || '').trim();
    if (!text || sending) return;

    sending = true;
    setBusy(true);
    // Optimistic UI: el mensaje se ve al instante aunque el socket esté caído.
    appendMessage({
      senderType: 'client',
      senderName: 'Tú',
      body: text
    });
    input.value = '';

    try {
      if (!conversationId) await startSupportChat();
      if (!conversationId) throw new Error('No se pudo abrir la conversación con Sofía.');

      const { res, data } = await fetchJson(`/aland/client/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message: text })
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo enviar. Revisa la conexión e intenta de nuevo.');
      }
      // Evitar duplicar el mensaje del cliente (ya lo mostramos optimistic).
      if (data.alandMessage) appendMessage(data.alandMessage);
      if (data.handoffMessage) appendMessage(data.handoffMessage);
    } catch (err) {
      const msg = err?.name === 'AbortError'
        ? 'Tiempo de espera agotado. Reintenta en unos segundos.'
        : (err.message || 'No se pudo enviar');
      appendMessage({
        senderType: 'system',
        senderName: 'Sistema',
        body: msg
      });
      if (window.FandezNotify) FandezNotify.show(msg, 'error');
    } finally {
      sending = false;
      setBusy(false);
      input?.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-open-aland], a[href="#aland-support"], #whatsappSupport, a[data-support-aland]');
    if (!a) return;
    e.preventDefault();
    openPanel();
  });

  if (/[?&]aland=1\b/.test(location.search) || location.hash === '#aland-support') {
    setTimeout(() => openPanel(), 300);
  }

  window.FandezOpenAland = openPanel;
})();

/**
 * Helpers compartidos del chat del servicio (cliente ↔ socio/técnico).
 */
(function (global) {
  async function fileToDataUrl(input) {
    const file = input?.files?.[0];
    if (!file) return null;
    if (global.FandezUpload?.prepareUploadFile) {
      return global.FandezUpload.prepareUploadFile(file);
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera 5 MB');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la foto'));
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPhotoBlock(msg, escapeFn) {
    const esc = escapeFn || escapeHtml;
    if (!msg?.photoUrl) return '';
    const src = esc(msg.photoUrl);
    return `<a href="${src}" target="_blank" rel="noopener" class="job-chat-photo"><img src="${src}" alt="Foto" loading="lazy"></a>`;
  }

  function renderBodyBlock(msg, escapeFn) {
    const esc = escapeFn || escapeHtml;
    const text = String(msg?.body || '').trim();
    if (!text) return '';
    return `<span class="job-chat-text">${esc(text)}</span>`;
  }

  function bindPhotoComposer(form, { onClear } = {}) {
    if (!form || form.dataset.photoBound === '1') return null;
    form.dataset.photoBound = '1';
    const input = form.querySelector('[data-role="chat-photo-input"]');
    const btn = form.querySelector('[data-role="chat-photo-btn"]');
    const preview = form.querySelector('[data-role="chat-photo-preview"]');
    const clearBtn = form.querySelector('[data-role="chat-photo-clear"]');
    const thumb = form.querySelector('[data-role="chat-photo-thumb"]');
    let pendingDataUrl = null;

    function clearPending() {
      pendingDataUrl = null;
      if (input) input.value = '';
      if (preview) preview.classList.add('hidden');
      if (thumb) {
        thumb.removeAttribute('src');
        thumb.alt = '';
      }
      if (typeof onClear === 'function') onClear();
    }

    btn?.addEventListener('click', () => input?.click());
    clearBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      clearPending();
    });
    input?.addEventListener('change', async () => {
      try {
        const dataUrl = await fileToDataUrl(input);
        if (!dataUrl) return;
        pendingDataUrl = dataUrl;
        if (thumb) {
          thumb.src = dataUrl;
          thumb.alt = 'Vista previa';
        }
        preview?.classList.remove('hidden');
      } catch (err) {
        clearPending();
        if (global.FandezNotify) {
          global.FandezNotify.show(err.message || 'No se pudo cargar la foto', 'error');
        }
      }
    });

    return {
      getPhoto: () => pendingDataUrl,
      clear: clearPending
    };
  }

  function pickReason() {
    return new Promise((resolve) => {
      const existing = document.querySelector('.job-chat-conduct');
      if (existing) existing.remove();
      const wrap = document.createElement('div');
      wrap.className = 'job-chat-conduct';
      wrap.innerHTML = `
        <div class="job-chat-conduct__card">
          <p class="job-chat-conduct__title">Este contenido no cumple la convivencia de Fandez</p>
          <p class="job-chat-conduct__sub">Se oculta el mensaje y se bloquea a esa persona.</p>
          <button type="button" data-reason="ugc_sex">Contenido sexual</button>
          <button type="button" data-reason="ugc_violence">Violencia</button>
          <button type="button" data-reason="ugc_language">Lenguaje ofensivo</button>
          <button type="button" data-reason="" class="job-chat-conduct__cancel">Cancelar</button>
        </div>`;
      function finish(value) {
        wrap.remove();
        resolve(value || '');
      }
      wrap.addEventListener('click', (ev) => {
        if (ev.target === wrap) finish('');
        const b = ev.target.closest('[data-reason]');
        if (b) finish(b.getAttribute('data-reason') || '');
      });
      document.body.appendChild(wrap);
    });
  }

  function reportButtonHtml(msg, escapeFn) {
    const esc = escapeFn || escapeHtml;
    if (!msg?.senderId || msg.hidden || msg.senderType === 'system') return '';
    return `<button type="button" class="job-chat-report" data-report-msg="${esc(msg.id)}" data-report-user="${esc(msg.senderId)}">Reportar y bloquear</button>`;
  }

  function setComposerBlocked(form, blocked) {
    if (!form) return;
    const on = Boolean(blocked);
    form.classList.toggle('is-blocked', on);
    const input = form.querySelector('#jobChatInput, .job-chat-input');
    const submit = form.querySelector('.job-chat-send, button[type="submit"]');
    const photoBtn = form.querySelector('[data-role="chat-photo-btn"]');
    const hint = form.querySelector('.job-chat-composer__hint');
    if (input) {
      if (!input.dataset.openPlaceholder) {
        input.dataset.openPlaceholder = input.getAttribute('placeholder') || 'Escribe o adjunta una foto…';
      }
      input.disabled = on;
      input.setAttribute('placeholder', on
        ? 'Chat bloqueado por convivencia de Fandez'
        : input.dataset.openPlaceholder);
    }
    if (submit) submit.disabled = on;
    if (photoBtn) photoBtn.disabled = on;
    if (hint) {
      if (!hint.dataset.openHint) hint.dataset.openHint = hint.innerHTML;
      hint.innerHTML = on
        ? 'Bloqueaste a esta persona. Ya no pueden escribirse.'
        : hint.dataset.openHint;
    }
  }

  function bindReportActions(thread, { endpointPrefix, requestId, getRequestId, form } = {}) {
    if (!thread || thread.dataset.conductBound === '1') return;
    thread.dataset.conductBound = '1';
    thread.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-report-msg]');
      if (!btn) return;
      const reasonId = await pickReason();
      if (!reasonId) return;
      btn.disabled = true;
      const rid = (typeof getRequestId === 'function' ? getRequestId() : requestId) || '';
      try {
        const res = await fetch(`${endpointPrefix}/comunidad/reportar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            requestId: rid,
            messageId: btn.getAttribute('data-report-msg'),
            targetUserId: btn.getAttribute('data-report-user'),
            reasonId,
            alsoBlock: true
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'No se pudo reportar');
        const bubble = btn.closest('.job-chat-bubble');
        if (bubble) {
          bubble.innerHTML = '<span class="job-chat-text">Mensaje oculto: no cumple la convivencia de Fandez.</span>';
        }
        if (data.chatBlocked) setComposerBlocked(form, true);
        if (global.FandezNotify) {
          global.FandezNotify.show(data.message || 'Persona bloqueada.', 'success');
        }
      } catch (err) {
        btn.disabled = false;
        if (global.FandezNotify) global.FandezNotify.show(err.message || 'Error', 'error');
      }
    });
  }

  global.FandezJobChat = {
    fileToDataUrl,
    escapeHtml,
    renderPhotoBlock,
    renderBodyBlock,
    bindPhotoComposer,
    reportButtonHtml,
    bindReportActions,
    setComposerBlocked
  };
})(typeof window !== 'undefined' ? window : globalThis);

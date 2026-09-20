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

  global.FandezJobChat = {
    fileToDataUrl,
    escapeHtml,
    renderPhotoBlock,
    renderBodyBlock,
    bindPhotoComposer
  };
})(typeof window !== 'undefined' ? window : globalThis);

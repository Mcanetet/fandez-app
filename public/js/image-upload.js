/**
 * Normaliza fotos de celular (cámara HEIC, JPEG enorme) a JPEG comprimido
 * que el servidor acepta. PDFs se envían tal cual si caben en el límite.
 */
(function (global) {
  const MAX_BYTES = 5 * 1024 * 1024;

  function isPdf(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    return type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  }

  function isLikelyImage(file) {
    if (!file || isPdf(file)) return false;
    const type = String(file.type || '').toLowerCase();
    if (!type || type === 'application/octet-stream') return true;
    return type.startsWith('image/');
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo. Intenta de nuevo.'));
      reader.readAsDataURL(file);
    });
  }

  function loadHtmlImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la foto del celular. En iPhone elige «Archivos» o toma la foto de nuevo y espera a que se guarde.'));
      };
      img.src = url;
    });
  }

  async function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file);
      } catch (_) {
        return loadHtmlImage(file);
      }
    }
    return loadHtmlImage(file);
  }

  function canvasToJpeg(source, maxSide, quality) {
    const w = source.videoWidth || source.width || source.naturalWidth || 0;
    const h = source.videoHeight || source.height || source.naturalHeight || 0;
    if (!w || !h) throw new Error('La foto no tiene un tamaño válido. Tómala de nuevo.');
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la foto en este navegador.');
    ctx.drawImage(source, 0, 0, width, height);
    if (typeof source.close === 'function') {
      try { source.close(); } catch (_) { /* ImageBitmap opcional */ }
    }
    let q = quality;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > MAX_BYTES * 1.37 && q > 0.42) {
      q -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    if (dataUrl.length > MAX_BYTES * 1.37) {
      throw new Error('La foto sigue siendo muy pesada. Aléjate un poco, baja la resolución de la cámara o elige un archivo más liviano.');
    }
    return dataUrl;
  }

  async function fileToJpegDataUrl(file, { maxSide = 1600, quality = 0.82 } = {}) {
    const source = await loadBitmap(file);
    return canvasToJpeg(source, maxSide, quality);
  }

  async function prepareUploadFile(file, opts = {}) {
    if (!file) throw new Error('Selecciona un archivo o toma una foto.');
    if (isPdf(file)) {
      if (file.size > MAX_BYTES) {
        throw new Error('El PDF supera 5 MB. Comprime el archivo e inténtalo de nuevo.');
      }
      return readAsDataUrl(file);
    }
    if (!isLikelyImage(file)) {
      throw new Error('Solo se aceptan fotos (JPEG, PNG, HEIC) o PDF.');
    }
    try {
      return await fileToJpegDataUrl(file, opts);
    } catch (err) {
      const type = String(file.type || '').toLowerCase();
      if (file.size <= MAX_BYTES && /^image\/(jpeg|jpg|png|webp)$/.test(type)) {
        return readAsDataUrl(file);
      }
      throw err;
    }
  }

  function captureVideoFrame(video, { maxSide = 960, quality = 0.82 } = {}) {
    if (!video || !video.videoWidth) {
      throw new Error('Espera a que la cámara cargue o sube una foto.');
    }
    return canvasToJpeg(video, maxSide, quality);
  }

  function waitForVideoFrame(video, timeoutMs = 8000) {
    if (video && video.readyState >= 2 && video.videoWidth) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('La cámara tardó demasiado. Sube una foto o recarga.')), timeoutMs);
      const onReady = () => {
        if (!video.videoWidth) return;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('loadeddata', onReady);
        resolve();
      };
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('loadeddata', onReady);
    });
  }

  function transferFileToInput(targetInput, file) {
    if (!targetInput || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      targetInput.files = dt.files;
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function setPickStatus(forId, file, source) {
    let wrap = null;
    try {
      wrap = document.querySelector(`[data-media-pick="${CSS.escape(forId)}"]`);
    } catch (_) {
      wrap = document.querySelector(`[data-media-pick="${forId}"]`);
    }
    const status = wrap?.querySelector('[data-role="pick-status"]');
    if (!status || !file) return;
    const via = source === 'camera' ? 'Cámara' : 'Archivos';
    status.textContent = `${via}: ${file.name || 'archivo listo'}`;
    status.classList.add('text-zilo-success');
  }

  function bindMediaPickDelegation(root) {
    const scope = root || document;
    if (scope.__fandezMediaPickBound) return;
    scope.__fandezMediaPickBound = true;
    scope.addEventListener('change', (ev) => {
      const src = ev.target;
      if (!src || !src.classList || !src.classList.contains('fandez-media-src')) return;
      const forId = src.dataset.for;
      const file = src.files && src.files[0];
      if (!forId || !file) return;
      const target = document.getElementById(forId);
      if (!target) return;
      if (transferFileToInput(target, file)) {
        setPickStatus(forId, file, src.dataset.src || 'files');
      }
      // Permite volver a elegir el mismo archivo después
      src.value = '';
    });
  }

  /**
   * Convierte inputs sueltos (legacy capture=environment o data-pick=both)
   * en selector Cámara + Archivos, preservando id y accept.
   */
  function enhanceMediaPickers(root) {
    const scope = root || document;
    bindMediaPickDelegation(document);
    const inputs = scope.querySelectorAll
      ? scope.querySelectorAll('input[type="file"][data-pick="both"]:not(.js-media-master):not([data-enhanced="1"]), input[type="file"][capture]:not(.fandez-media-src):not([data-enhanced="1"])')
      : [];
    inputs.forEach((input) => {
      if (input.closest('.fandez-media-pick')) {
        input.dataset.enhanced = '1';
        return;
      }
      const id = input.id || `media-${Math.random().toString(36).slice(2, 9)}`;
      if (!input.id) input.id = id;
      const accept = input.getAttribute('accept') || 'image/*,application/pdf';
      const allowCamera = /image/i.test(accept);
      input.classList.add('hidden', 'js-media-master');
      input.dataset.pick = 'both';
      input.dataset.enhanced = '1';
      input.removeAttribute('capture');

      const wrap = document.createElement('div');
      wrap.className = 'fandez-media-pick space-y-1.5';
      wrap.dataset.mediaPick = id;
      wrap.innerHTML = `
        <div class="grid ${allowCamera ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
          ${allowCamera ? `
          <label class="inline-flex items-center justify-center gap-1.5 min-h-[2.75rem] px-2 rounded-xl border border-zilo-border bg-white text-xs font-semibold text-zilo-text cursor-pointer">
            <svg class="w-4 h-4 shrink-0 text-zilo-accent" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Cámara
            <input type="file" accept="image/*" capture="environment" class="sr-only fandez-media-src" data-for="${id}" data-src="camera" tabindex="-1">
          </label>` : ''}
          <label class="inline-flex items-center justify-center gap-1.5 min-h-[2.75rem] px-2 rounded-xl border border-zilo-border bg-white text-xs font-semibold text-zilo-text cursor-pointer">
            <svg class="w-4 h-4 shrink-0 text-zilo-accent" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            Archivos
            <input type="file" accept="${accept.replace(/"/g, '&quot;')}" class="sr-only fandez-media-src" data-for="${id}" data-src="files" tabindex="-1">
          </label>
        </div>
        <p class="text-[10px] text-zilo-muted" data-role="pick-status">${allowCamera ? 'Elige Cámara o Archivos (galería / documentos).' : 'Elige un archivo desde tu dispositivo.'}</p>
      `;
      input.parentNode.insertBefore(wrap, input);
      wrap.insertBefore(input, wrap.firstChild);
    });
  }

  function bootMediaPickers() {
    bindMediaPickDelegation(document);
    enhanceMediaPickers(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMediaPickers);
  } else {
    bootMediaPickers();
  }

  global.FandezUpload = {
    MAX_BYTES,
    prepareUploadFile,
    fileToJpegDataUrl,
    captureVideoFrame,
    waitForVideoFrame,
    enhanceMediaPickers,
    transferFileToInput
  };
})(window);

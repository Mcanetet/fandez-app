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

  global.FandezUpload = {
    MAX_BYTES,
    prepareUploadFile,
    fileToJpegDataUrl,
    captureVideoFrame,
    waitForVideoFrame
  };
})(window);

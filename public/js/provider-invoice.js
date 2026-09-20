(function () {
  async function fileToDataUrl(input) {
    const file = input?.files?.[0];
    if (!file) throw new Error('Adjunta la factura o boleta');
    if (window.FandezUpload?.prepareUploadFile) {
      return window.FandezUpload.prepareUploadFile(file);
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera 5 MB');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  function t(key, vars) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key, vars) : key;
  }

  document.querySelectorAll('[data-role="register-invoice"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const form = button.closest('.provider-invoice-form');
      if (!form) return;
      button.disabled = true;
      try {
        const file = await fileToDataUrl(form.querySelector('[data-role="invoice-file"]'));
        const res = await fetch(`/proveedor/factura/${form.dataset.requestId}/registrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            documentType: form.querySelector('[data-role="invoice-type"]').value,
            folio: form.querySelector('[data-role="invoice-folio"]').value.trim(),
            file
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || t('provider.invoice.error'));
        if (window.FandezNotify) {
          FandezNotify.show(t('provider.invoice.registered'), 'success');
        }
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        button.disabled = false;
        if (window.FandezNotify) {
          FandezNotify.show(err.message || t('provider.invoice.error'), 'error');
        } else {
          alert(err.message || t('provider.invoice.error'));
        }
      }
    });
  });
})();

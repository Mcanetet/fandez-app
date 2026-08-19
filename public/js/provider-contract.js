(function () {
  const page = document.getElementById('providerContractPage');
  const form = document.getElementById('contractForm');
  if (!page || !form) return;

  const catalog = JSON.parse(document.getElementById('contractDocsCatalog')?.textContent || '{}');
  const uploaded = JSON.parse(document.getElementById('contractUploaded')?.textContent || '{}');
  const docsList = document.getElementById('documentsList');

  function getEntityType() {
    return form.querySelector('input[name="entityType"]:checked')?.value || page.dataset.entityType || '';
  }

  function renderDocuments() {
    const entityType = getEntityType();
    if (!entityType) {
      docsList.innerHTML = '<p class="text-xs text-zilo-muted">Selecciona persona natural o empresa para ver los documentos requeridos.</p>';
      return;
    }
    const docs = Object.values(catalog).filter((d) => d.entities.includes(entityType));
    docsList.innerHTML = docs.map((doc) => {
      const existing = doc.key === 'technical_certs'
        ? (uploaded.technicalCerts || []).length
        : uploaded.documents?.[doc.key]?.url;
      const status = existing ? '<span class="text-emerald-600 text-[10px] font-bold">✓ Subido</span>' : (doc.required ? '<span class="text-red-500 text-[10px]">Obligatorio</span>' : '<span class="text-zilo-muted text-[10px]">Opcional</span>');
      return `
        <div class="p-3 rounded-xl border border-zilo-border" data-doc-key="${doc.key}">
          <div class="flex justify-between gap-2 mb-1">
            <strong class="text-xs">${doc.label}</strong>
            ${status}
          </div>
          <p class="text-[10px] text-zilo-muted mb-2">${doc.hint}</p>
          <input type="file" accept="image/*,application/pdf" class="contract-doc-input text-xs w-full" data-key="${doc.key}" data-multiple="${doc.multiple ? '1' : '0'}">
        </div>`;
    }).join('');

    docsList.querySelectorAll('.contract-doc-input').forEach((input) => {
      input.addEventListener('change', () => uploadDocument(input));
    });
  }

  async function uploadDocument(input) {
    const file = input.files?.[0];
    if (!file || file.size > 6 * 1024 * 1024) {
      FandezNotify.show('Archivo inválido o mayor a 6 MB', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/proveedor/contrato/documento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docKey: input.dataset.key, data: reader.result, label: file.name })
        });
        const data = await res.json();
        if (data.success) {
          if (input.dataset.key === 'technical_certs') {
            uploaded.technicalCerts = data.contract.technicalCerts;
          } else {
            uploaded.documents = uploaded.documents || {};
            uploaded.documents[input.dataset.key] = { url: data.url };
          }
          FandezNotify.show('Documento guardado', 'success');
          renderDocuments();
        } else FandezNotify.show(data.error || 'Error al subir', 'error');
      } catch (_) {
        FandezNotify.show('Error de conexión', 'error');
      }
    };
    reader.readAsDataURL(file);
  }

  function collectFormData() {
    const fd = new FormData(form);
    const entityType = getEntityType();
    const declarations = {};
    form.querySelectorAll('input[name="declarations"]:checked').forEach((cb) => {
      declarations[cb.value] = true;
    });
    return {
      entityType,
      legalEntity: {
        rut: fd.get('legalEntity.rut'),
        legalName: fd.get('legalEntity.legalName'),
        tradeName: fd.get('legalEntity.tradeName'),
        giro: fd.get('legalEntity.giro'),
        fiscalAddress: fd.get('legalEntity.fiscalAddress'),
        commune: fd.get('legalEntity.commune'),
        region: fd.get('legalEntity.region'),
        email: fd.get('legalEntity.email'),
        phone: fd.get('legalEntity.phone')
      },
      legalRepresentative: {
        fullName: fd.get('legalRepresentative.fullName'),
        rut: fd.get('legalRepresentative.rut'),
        role: fd.get('legalRepresentative.role')
      },
      declarations,
      signature: {
        signerName: fd.get('signature.signerName'),
        signerRut: fd.get('signature.signerRut'),
        accepted: document.getElementById('acceptContract')?.checked || false
      }
    };
  }

  form.querySelectorAll('input[name="entityType"]').forEach((radio) => {
    radio.addEventListener('change', renderDocuments);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = collectFormData();
    if (!document.getElementById('acceptContract')?.checked) {
      FandezNotify.show('Debes aceptar el contrato', 'error');
      return;
    }
    const btn = document.getElementById('btnSubmitContract');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const res = await fetch('/proveedor/contrato/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FandezNotify.show('Expediente enviado a revisión legal', 'success');
        setTimeout(() => location.reload(), 900);
      } else {
        FandezNotify.show(data.error || (data.errors && data.errors[0]) || 'Revisa el formulario', 'error');
        btn.disabled = false;
        btn.textContent = 'Enviar a revisión legal';
      }
    } catch (_) {
      FandezNotify.show('Error de conexión', 'error');
      btn.disabled = false;
      btn.textContent = 'Enviar a revisión legal';
    }
  });

  renderDocuments();
})();

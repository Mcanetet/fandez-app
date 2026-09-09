(function () {
  const page = document.getElementById('providerContractPage');
  const form = document.getElementById('contractForm');
  if (!page) return;

  const catalog = JSON.parse(document.getElementById('contractDocsCatalog')?.textContent || '{}');
  const uploaded = JSON.parse(document.getElementById('contractUploaded')?.textContent || '{}');
  const docsList = document.getElementById('documentsList');
  const locked = page.dataset.status === 'pending_review';
  const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

  function getEntityType() {
    return form?.querySelector('input[name="entityType"]:checked')?.value || page.dataset.entityType || '';
  }

  function aiMeta(doc) {
    const status = doc?.ai?.status || 'pending';
    const map = {
      verified: { cls: 'text-emerald-700', label: 'IA: verificado' },
      suspicious: { cls: 'text-amber-700', label: 'IA: sospechoso' },
      fake: { cls: 'text-red-600', label: 'IA: posible falso' },
      unreadable: { cls: 'text-slate-600', label: 'IA: ilegible' },
      pending_manual: { cls: 'text-blue-700', label: 'IA: revisión humana' },
      pending: { cls: 'text-zilo-muted', label: 'IA: en revisión' }
    };
    return map[status] || map.pending;
  }

  function humanMeta(doc) {
    const status = doc?.human?.status || 'pending';
    const map = {
      approved: { cls: 'text-emerald-700', label: 'Equipo: aprobado' },
      rejected: { cls: 'text-red-600', label: 'Equipo: rechazado' },
      needs_info: { cls: 'text-amber-700', label: 'Equipo: pedir corrección' },
      pending: { cls: 'text-zilo-muted', label: 'Equipo: pendiente' }
    };
    return map[status] || map.pending;
  }

  function existingRecord(doc) {
    if (doc.key === 'technical_certs') {
      return (uploaded.technicalCerts || [])[0] || null;
    }
    return uploaded.documents?.[doc.key] || null;
  }

  function renderDocuments() {
    if (!docsList) return;
    const entityType = getEntityType();
    if (!entityType) {
      docsList.innerHTML = '<p class="text-xs text-zilo-muted">Selecciona persona natural o empresa para ver los documentos requeridos.</p>';
      return;
    }
    const docs = Object.values(catalog).filter((d) => d.entities.includes(entityType));
    docsList.innerHTML = docs.map((doc) => {
      const rec = existingRecord(doc);
      const hasFile = doc.key === 'technical_certs'
        ? (uploaded.technicalCerts || []).length
        : rec?.url;
      const ai = aiMeta(rec);
      const human = humanMeta(rec);
      const notes = rec?.human?.notes || rec?.ai?.reason || '';
      const status = hasFile
        ? `<span class="text-emerald-600 text-[10px] font-bold">✓ Subido</span>`
        : (doc.required ? '<span class="text-red-500 text-[10px]">Esencial</span>' : '<span class="text-zilo-muted text-[10px]">Opcional</span>');
      const review = hasFile ? `
        <div class="flex flex-wrap gap-2 mt-2 text-[10px] font-semibold">
          <span class="${ai.cls}">${ai.label}</span>
          <span class="${human.cls}">${human.label}</span>
        </div>
        ${notes ? `<p class="text-[11px] text-zilo-muted mt-1">${notes.replace(/</g, '&lt;')}</p>` : ''}
      ` : '';
      const upload = locked ? '' : `
        <input type="file" accept="${FILE_ACCEPT}" class="contract-doc-input text-xs w-full mt-2" data-key="${doc.key}" data-multiple="${doc.multiple ? '1' : '0'}">
      `;
      return `
        <div class="p-3 rounded-xl border border-zilo-border" data-doc-key="${doc.key}">
          <div class="flex justify-between gap-2 mb-1">
            <strong class="text-xs">${doc.label}</strong>
            ${status}
          </div>
          <p class="text-[10px] text-zilo-muted">${doc.hint}</p>
          ${review}
          ${upload}
        </div>`;
    }).join('');

    docsList.querySelectorAll('.contract-doc-input').forEach((input) => {
      input.addEventListener('change', () => uploadDocument(input));
    });
  }

  async function uploadDocument(input) {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      if (!window.FandezUpload?.prepareUploadFile) {
        throw new Error('Recarga la página para subir la foto.');
      }
      const data = await window.FandezUpload.prepareUploadFile(file);
      const res = await fetch('/proveedor/contrato/documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docKey: input.dataset.key, data, label: file.name })
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error || 'Error al subir');
      if (input.dataset.key === 'technical_certs') {
        uploaded.technicalCerts = payload.contract.technicalCerts;
      } else {
        uploaded.documents = payload.contract.documents || uploaded.documents || {};
      }
      FandezNotify.show(payload.ai?.status === 'fake'
        ? 'Guardado, pero la IA marcó el documento como posible falso'
        : 'Documento guardado y prechequeado', payload.ai?.status === 'fake' ? 'warning' : 'success');
      renderDocuments();
    } catch (err) {
      FandezNotify.show(err.message || 'Error al subir', 'error');
      input.value = '';
    } finally {
      input.disabled = false;
    }
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

  form?.querySelectorAll('input[name="entityType"]').forEach((radio) => {
    radio.addEventListener('change', renderDocuments);
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = collectFormData();
    if (!document.getElementById('acceptContract')?.checked) {
      FandezNotify.show('Acepta el contrato para enviarlo', 'error');
      return;
    }
    const decls = [...form.querySelectorAll('input[name="declarations"]')];
    if (decls.length && decls.some((cb) => !cb.checked)) {
      FandezNotify.show('Marca las tres declaraciones', 'error');
      decls.find((cb) => !cb.checked)?.focus();
      return;
    }
    const btn = document.getElementById('btnSubmitContract');
    btn.disabled = true;
    btn.textContent = 'Enviando y prechequeando…';
    try {
      const res = await fetch('/proveedor/contrato/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        FandezNotify.show('Expediente enviado. La IA ya dejó un estado en cada documento.', 'success');
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

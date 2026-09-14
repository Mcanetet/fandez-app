(function () {
  const notify = (msg, type) => {
    if (window.FandezNotify) window.FandezNotify.show(msg, type);
  };

  function collectEnabledServices() {
    return Array.from(document.querySelectorAll('.service-toggle:checked'))
      .map((input) => input.dataset.serviceId)
      .filter(Boolean);
  }

  function coverageLabel(svc) {
    if (!svc.enabled) return 'No ofrecido por la empresa';
    if (svc.covered) {
      return svc.readyCount === 1 ? '1 técnico listo' : `${svc.readyCount} técnicos listos`;
    }
    return 'Activo · falta técnico con expediente';
  }

  function coverageClass(svc) {
    if (!svc.enabled) return 'text-[10px] text-zilo-muted';
    return `text-[10px] ${svc.covered ? 'text-zilo-success' : 'text-amber-600'}`;
  }

  function applyServiceStatus(services) {
    services.forEach((svc) => {
      const input = document.querySelector(`.service-toggle[data-service-id="${svc.id}"]`);
      if (!input) return;
      input.checked = Boolean(svc.enabled);
      const label = input.closest('label');
      if (!label) return;
      const coverageSpan = Array.from(label.querySelectorAll('span')).find((el) =>
        /técnico|empresa|ofrecido|activo/i.test(el.textContent || '')
      );
      if (coverageSpan) {
        coverageSpan.className = coverageClass(svc);
        coverageSpan.textContent = coverageLabel(svc);
      }
    });
    // Tras cambiar servicios de la empresa, recargar para actualizar checkboxes del formulario de técnicos
    setTimeout(() => location.reload(), 600);
  }

  async function saveProviderServices(fromToggle) {
    const specialties = collectEnabledServices();
    const feedback = document.getElementById('servicesFeedback');
    try {
      const res = await fetch('/proveedor/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ specialties })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudieron guardar los servicios');
      notify('Servicios de la empresa actualizados', 'success');
      if (feedback) {
        feedback.textContent = specialties.length
          ? `${specialties.length} servicio(s) de la empresa`
          : 'La empresa no ofrece servicios';
        feedback.classList.remove('hidden');
      }
      if (Array.isArray(data.services)) applyServiceStatus(data.services);
      return true;
    } catch (err) {
      if (fromToggle) fromToggle.checked = !fromToggle.checked;
      notify(err.message || 'No se pudieron guardar los servicios', 'error');
      return false;
    }
  }

  document.querySelectorAll('.service-toggle').forEach((input) => {
    input.addEventListener('change', async () => {
      input.disabled = true;
      await saveProviderServices(input);
      input.disabled = false;
    });
  });

  document.querySelectorAll('.tech-toggle').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const active = input.checked;
      input.disabled = true;
      try {
        const res = await fetch(`/proveedor/equipo/${id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ active })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');
        notify(active ? 'Técnico activado' : 'Técnico desactivado', 'success');
        if (Array.isArray(data.services)) {
          data.services.forEach((svc) => {
            const el = document.querySelector(`.service-toggle[data-service-id="${svc.id}"]`);
            const label = el?.closest('label');
            const coverageSpan = label && Array.from(label.querySelectorAll('span')).find((span) =>
              /técnico|empresa|ofrecido|activo/i.test(span.textContent || '')
            );
            if (coverageSpan) {
              coverageSpan.className = coverageClass(svc);
              coverageSpan.textContent = coverageLabel(svc);
            }
          });
        }
      } catch (err) {
        input.checked = !active;
        notify('No se pudo actualizar el técnico', 'error');
      } finally {
        input.disabled = false;
      }
    });
  });

  document.querySelectorAll('.tech-claim-wall').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const enabled = input.checked;
      input.disabled = true;
      try {
        const res = await fetch(`/proveedor/equipo/${id}/claim-wall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error');
        notify(enabled ? 'Puede tomar pedidos del muro' : 'Solo tú le asignarás pedidos', 'success');
      } catch (err) {
        input.checked = !enabled;
        notify(err.message || 'No se pudo guardar el permiso', 'error');
      } finally {
        input.disabled = false;
      }
    });
  });

  const tabButtons = document.querySelectorAll('.equipo-tab');
  const panels = document.querySelectorAll('[data-equipo-panel]');
  function showEquipoTab(name) {
    tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.classList.toggle('bg-white', on);
      btn.classList.toggle('text-zilo-accent', on);
      btn.classList.toggle('shadow-sm', on);
      btn.classList.toggle('text-zilo-muted', !on);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.equipoPanel !== name);
    });
    try { history.replaceState(null, '', `#${name}`); } catch (_) {}
  }
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => showEquipoTab(btn.dataset.tab));
  });
  const hash = (location.hash || '').replace('#', '');
  if (['servicios', 'tecnicos', 'agregar'].includes(hash)) showEquipoTab(hash);
})();

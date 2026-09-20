/**
 * Cambia entre modo cliente y modo socio sin cerrar sesión.
 */
(function () {
  function notify(msg, type) {
    if (window.FandezNotify?.show) window.FandezNotify.show(msg, type || 'error');
    else alert(msg);
  }

  async function switchMode(mode, btn) {
    const url = mode === 'client' ? '/proveedor/modo-cliente' : '/cliente/modo-socio';
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      notify(data.error || 'No se pudo cambiar de modo');
      if (btn) btn.disabled = false;
    } catch (_) {
      notify('Error de red al cambiar de modo');
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-session-mode]');
    if (!btn || btn.disabled) return;
    const mode = btn.getAttribute('data-session-mode');
    if (mode !== 'client' && mode !== 'provider') return;
    switchMode(mode, btn);
  });
})();

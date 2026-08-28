(function () {
  if (typeof io === 'undefined') return;

  let banner = null;
  let hideTimer = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'fandezSocketBanner';
    banner.className = 'socket-reconnect-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.hidden = true;
    banner.innerHTML = '<span class="socket-reconnect-banner__dot" aria-hidden="true"></span><span data-role="msg"></span>';
    document.body.appendChild(banner);
    return banner;
  }

  function show(msg) {
    const el = ensureBanner();
    const msgEl = el.querySelector('[data-role="msg"]');
    if (msgEl) msgEl.textContent = msg;
    el.hidden = false;
    clearTimeout(hideTimer);
  }

  function hide() {
    if (!banner) return;
    banner.hidden = true;
  }

  function t(key, fallback) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key) : fallback;
  }

  const socket = io();
  socket.on('disconnect', () => {
    show(t('js.socket_reconnecting', 'Reconectando…'));
  });
  socket.on('connect', () => {
    show(t('js.socket_connected', 'Conexión restablecida'));
    hideTimer = setTimeout(hide, 2200);
  });
  socket.on('connect_error', () => {
    show(t('js.socket_error', 'Sin conexión. Reintentando…'));
  });

  window.FandezSocket = { socket, showStatus: show, hideStatus: hide };
})();

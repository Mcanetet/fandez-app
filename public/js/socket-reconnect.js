(function () {
  if (typeof io === 'undefined') return;

  let banner = null;
  let hideTimer = null;
  let wasConnected = false;

  const TONE_STYLES = {
    warning: {
      background: 'rgba(180, 83, 9, 0.96)',
      color: '#fff',
    },
    success: {
      background: 'rgba(22, 101, 52, 0.96)',
      color: '#fff',
    },
  };

  function baseBannerStyles() {
    return {
      position: 'fixed',
      top: 'auto',
      right: 'auto',
      left: '50%',
      bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      zIndex: '550',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      maxWidth: 'min(22rem, calc(100vw - 2rem))',
      width: 'max-content',
      padding: '0.625rem 0.875rem',
      borderRadius: '999px',
      fontSize: '0.8125rem',
      fontWeight: '600',
      lineHeight: '1.2',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
      transform: 'translateX(-50%)',
      pointerEvents: 'auto',
    };
  }

  function applyVisibleStyles(el, tone) {
    const toneStyle = TONE_STYLES[tone] || TONE_STYLES.warning;
    Object.assign(el.style, baseBannerStyles(), toneStyle);
  }

  function applyHiddenStyles(el) {
    el.style.display = 'none';
  }

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'fandezSocketBanner';
    banner.className = 'socket-reconnect-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.hidden = true;
    banner.innerHTML =
      '<span class="socket-reconnect-banner__dot" aria-hidden="true"></span>' +
      '<span data-role="msg"></span>' +
      '<button type="button" class="socket-reconnect-banner__close" aria-label="Cerrar">&times;</button>';
    banner.querySelector('.socket-reconnect-banner__close').addEventListener('click', hide);
    applyHiddenStyles(banner);
    document.body.appendChild(banner);
    return banner;
  }

  function show(msg, opts) {
    const options = opts || {};
    const el = ensureBanner();
    const msgEl = el.querySelector('[data-role="msg"]');
    if (msgEl) msgEl.textContent = msg;
    el.dataset.tone = options.tone || 'warning';
    el.hidden = false;
    applyVisibleStyles(el, el.dataset.tone);
    clearTimeout(hideTimer);
    if (options.autoHideMs) {
      hideTimer = setTimeout(hide, options.autoHideMs);
    }
  }

  function hide() {
    if (!banner || banner.hidden) return;
    clearTimeout(hideTimer);
    banner.hidden = true;
    applyHiddenStyles(banner);
  }

  function t(key, fallback) {
    return typeof FandezI18n !== 'undefined' ? FandezI18n.t(key) : fallback;
  }

  const socket = io();
  socket.on('connect', () => {
    if (wasConnected) {
      hide();
    }
    wasConnected = true;
  });
  socket.on('disconnect', () => {
    if (!wasConnected) return;
    show(t('js.socket_reconnecting', 'Reconectando…'), { tone: 'warning' });
  });
  socket.on('connect_error', () => {
    if (!wasConnected) return;
    show(t('js.socket_error', 'Sin conexión. Reintentando…'), { tone: 'warning' });
  });

  window.FandezSocket = { socket, showStatus: show, hideStatus: hide };
})();

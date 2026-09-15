/**
 * Telemetría ligera de errores de app para soporte técnico (admin).
 * No impersona: solo reporta fallos JS/red del usuario autenticado.
 */
(function () {
  if (typeof window === 'undefined') return;
  const endpoint = '/api/telemetry/error';
  let lastSent = '';
  let lastAt = 0;

  function shouldSkip(message) {
    const key = String(message || '').slice(0, 180);
    const now = Date.now();
    if (key && key === lastSent && now - lastAt < 15000) return true;
    lastSent = key;
    lastAt = now;
    return false;
  }

  function report(payload) {
    try {
      const message = String(payload.message || '').trim();
      if (!message || shouldSkip(message)) return;
      const body = JSON.stringify({
        message,
        stack: payload.stack ? String(payload.stack).slice(0, 2000) : null,
        url: location.href,
        path: location.pathname,
        source: payload.source || 'client',
        userAgent: navigator.userAgent,
        meta: payload.meta || null
      });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        credentials: 'same-origin',
        keepalive: true
      }).catch(() => {});
    } catch (_) { /* noop */ }
  }

  window.addEventListener('error', (event) => {
    const msg = event?.message || event?.error?.message;
    if (!msg) return;
    report({
      message: msg,
      stack: event?.error?.stack || null,
      source: 'window.onerror',
      meta: {
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || 'unhandledrejection');
    report({
      message,
      stack: reason?.stack || null,
      source: 'unhandledrejection'
    });
  });

  window.FandezTelemetry = { report };
})();

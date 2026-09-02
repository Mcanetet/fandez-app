/**
 * iOS/Android: al volver de background o bfcache, las apps deben resincronizar estado.
 */
(function () {
  function emitResume(reason) {
    window.dispatchEvent(new CustomEvent('fandez:resume', { detail: { reason } }));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emitResume('visibility');
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) emitResume('bfcache');
  });

  window.FandezMobile = {
    onResume(handler) {
      window.addEventListener('fandez:resume', (e) => handler(e.detail || {}));
    },
    isInAppBrowser() {
      const ua = navigator.userAgent || '';
      return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat|Pinterest|GSA\//i.test(ua);
    },
    isIos() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent || '')
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
  };
})();

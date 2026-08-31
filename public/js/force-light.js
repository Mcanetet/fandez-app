/**
 * Inicialización de tema Fandez — PWA standalone + color de barra del sistema.
 */
(function () {
  'use strict';

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    } catch (_) {
      return false;
    }
  }

  function isDark() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
      return false;
    }
  }

  function updateThemeColor() {
    var color = isDark() ? '#141210' : '#FFFFFF';
    try {
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
        meta.setAttribute('content', color);
      });
    } catch (_) { /* ignore */ }
  }

  function init() {
    var html = document.documentElement;
    if (isStandalone()) html.classList.add('fandez-standalone');
    updateThemeColor();
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
    } catch (_) { /* ignore */ }
  }

  init();
  window.FandezTheme = { refresh: init };
})();

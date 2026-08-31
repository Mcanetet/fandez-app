/**
 * Tema claro fijo — PWA standalone + barra del sistema siempre blanca.
 */
(function () {
  'use strict';

  var WHITE = '#FFFFFF';
  var TEXT = '#1A1814';

  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    } catch (_) {
      return false;
    }
  }

  function setOnlyLight(el) {
    if (!el) return;
    el.style.setProperty('color-scheme', 'only light', 'important');
    el.style.setProperty('background-color', WHITE, 'important');
  }

  function setThemeColor() {
    try {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      if (metas.length) {
        metas.forEach(function (meta) {
          meta.setAttribute('content', WHITE);
        });
      } else {
        var m = document.createElement('meta');
        m.name = 'theme-color';
        m.content = WHITE;
        document.head.appendChild(m);
      }
    } catch (_) { /* ignore */ }
  }

  function apply() {
    var html = document.documentElement;
    var body = document.body;
    html.classList.add('fandez-only-light');
    if (isStandalone()) html.classList.add('fandez-standalone');
    setOnlyLight(html);
    setOnlyLight(body);
    if (body) body.style.setProperty('color', TEXT, 'important');
    setThemeColor();
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('pageshow', apply);
  window.FandezTheme = { refresh: apply };
})();

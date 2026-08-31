/**
 * Fuerza tema claro en Android/iOS (Chrome auto-dark, PWA standalone).
 * Se ejecuta antes del paint y se repite tras cargar por si el navegador re-aplica oscuro.
 */
(function () {
  'use strict';

  var SURFACE_SEL = '.zilo-body,.min-h-screen,.min-h-full,.fandez-landing,.max-w-lg,main,header,footer';

  function paintRoot(el) {
    if (!el) return;
    el.classList.add('fandez-force-light');
    el.style.setProperty('color-scheme', 'only light', 'important');
    el.style.setProperty('background-color', '#ffffff', 'important');
    el.style.setProperty('background-image', 'linear-gradient(#ffffff,#ffffff)', 'important');
    el.style.setProperty('filter', 'none', 'important');
    el.style.setProperty('-webkit-filter', 'none', 'important');
  }

  function applyLightTheme() {
    var html = document.documentElement;
    var body = document.body;
    paintRoot(html);
    if (body) {
      paintRoot(body);
      body.style.setProperty('color', '#1a1814', 'important');
    }
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        html.classList.add('fandez-standalone');
      }
    } catch (_) { /* ignore */ }
    try {
      document.querySelectorAll(SURFACE_SEL).forEach(function (node) {
        node.style.setProperty('background-color', '#ffffff', 'important');
        node.style.setProperty('color-scheme', 'only light', 'important');
      });
    } catch (_) { /* ignore */ }
  }

  applyLightTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLightTheme);
  }
  window.addEventListener('pageshow', applyLightTheme);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) applyLightTheme();
  });

  var frames = 0;
  function rafPaint() {
    applyLightTheme();
    if (frames++ < 24) requestAnimationFrame(rafPaint);
  }
  requestAnimationFrame(rafPaint);

  window.FandezForceLight = { apply: applyLightTheme };
})();

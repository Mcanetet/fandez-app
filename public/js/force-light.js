/**
 * Tema claro fijo — bloquea auto-dark (Android Chrome, Samsung, iOS PWA).
 * Se carga al inicio del <head>, antes de CSS.
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

  function lockEl(el, withText) {
    if (!el || !el.style) return;
    try {
      el.style.setProperty('color-scheme', 'only light', 'important');
      el.style.setProperty('background-color', WHITE, 'important');
      el.style.setProperty('background-image', 'linear-gradient(#ffffff,#ffffff)', 'important');
      el.style.setProperty('forced-color-adjust', 'none', 'important');
      el.style.setProperty('-webkit-filter', 'none', 'important');
      el.style.setProperty('filter', 'none', 'important');
      if (withText) el.style.setProperty('color', TEXT, 'important');
    } catch (_) { /* ignore */ }
  }

  function setMeta(name, content) {
    try {
      var nodes = document.querySelectorAll('meta[name="' + name + '"]');
      if (nodes.length) {
        nodes.forEach(function (meta) {
          meta.setAttribute('content', content);
        });
        return;
      }
      if (!document.head) return;
      var m = document.createElement('meta');
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
    } catch (_) { /* ignore */ }
  }

  function apply() {
    var html = document.documentElement;
    var body = document.body;
    html.classList.add('fandez-only-light');
    if (isStandalone()) html.classList.add('fandez-standalone');
    html.setAttribute('data-color-scheme', 'light');
    lockEl(html, false);
    lockEl(body, true);
    setMeta('theme-color', WHITE);
    setMeta('color-scheme', 'only light');
    setMeta('supported-color-schemes', 'only light');
    setMeta('night-mode', 'disable');
  }

  apply();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.addEventListener('pageshow', apply);
  window.addEventListener('focus', apply);

  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq && mq.addListener) mq.addListener(apply);
  } catch (_) { /* ignore */ }

  window.FandezTheme = { refresh: apply, mode: 'light-only' };
})();

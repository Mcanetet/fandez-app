/**
 * Técnico stick (gorro jockey) — mini escenas en la landing.
 */
(function () {
  'use strict';

  var SCENES = ['drip', 'spark', 'leaf', 'key', 'wipe'];
  var SCENE_MS = 9200;
  var PAUSE_MS = 1600;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function splitWordmark(el) {
    if (!el || el.dataset.stickLetters === '1') return;
    var text = (el.textContent || '').trim();
    if (!text) return;
    el.textContent = '';
    el.dataset.stickLetters = '1';
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement('span');
      span.className = 'stick-tech-letter';
      span.textContent = text[i];
      span.setAttribute('aria-hidden', 'true');
      el.appendChild(span);
    }
    // Accesible: el nombre completo sigue en el brand vía texto visual; aria en header
    el.setAttribute('aria-label', text);
  }

  function clearWipe(root) {
    var letters = root.querySelectorAll('.stick-tech-letter--wipe');
    for (var i = 0; i < letters.length; i++) {
      letters[i].classList.remove('stick-tech-letter--wipe');
    }
  }

  function pickWipeLetter(root) {
    var letters = root.querySelectorAll('.landing-header__wordmark .stick-tech-letter');
    if (!letters.length) return null;
    // Preferir vocales del medio (más visibles)
    var candidates = [];
    for (var i = 0; i < letters.length; i++) {
      var ch = (letters[i].textContent || '').toLowerCase();
      if (/[aeiouáéíóú]/.test(ch)) candidates.push(letters[i]);
    }
    var pool = candidates.length ? candidates : Array.prototype.slice.call(letters);
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  function setScene(root, name) {
    root.setAttribute('data-scene', name || '');
    root.classList.toggle('is-wiping', name === 'wipe');
    clearWipe(document);
    if (name === 'wipe') {
      var letter = pickWipeLetter(document);
      if (letter) {
        letter.classList.add('stick-tech-letter--wipe');
      }
    }
  }

  function init() {
    var root = document.querySelector('[data-stick-tech]');
    if (!root) return;

    var wordmark = document.querySelector('.landing-header__wordmark');
    if (wordmark) splitWordmark(wordmark);

    if (prefersReducedMotion()) {
      root.setAttribute('data-scene', 'idle');
      root.classList.add('is-static');
      return;
    }

    var i = 0;
    var timer = null;

    function next() {
      var scene = SCENES[i % SCENES.length];
      // Limpiar letra solo en vueltas pares (aparece a ratos)
      if (scene === 'wipe' && (Math.floor(i / SCENES.length) % 2) === 1) {
        i += 1;
        scene = SCENES[i % SCENES.length] || 'drip';
      }
      setScene(root, scene);
      root.classList.remove('is-exiting');
      root.classList.add('is-active');

      clearTimeout(timer);
      timer = setTimeout(function () {
        root.classList.add('is-exiting');
        timer = setTimeout(function () {
          root.classList.remove('is-active');
          setScene(root, '');
          i += 1;
          timer = setTimeout(next, PAUSE_MS);
        }, 700);
      }, SCENE_MS);
    }

    // Arranque suave
    setTimeout(next, 900);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(timer);
        root.classList.remove('is-active');
        setScene(root, '');
      } else if (!prefersReducedMotion()) {
        clearTimeout(timer);
        timer = setTimeout(next, 600);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

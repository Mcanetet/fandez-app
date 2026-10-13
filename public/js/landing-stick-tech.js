/**
 * Técnico stick (gorra con visera) — interactúa con letras y arbusto.
 */
(function () {
  'use strict';

  // Escenas: oficios + interacciones con el wordmark / arbusto
  var SCENES = ['paint', 'bush', 'drip', 'break', 'spark', 'paint', 'bush'];
  var SCENE_MS = {
    paint: 7800,
    break: 8200,
    bush: 7600,
    drip: 7000,
    spark: 6500,
    default: 7200
  };
  var PAUSE_MS = 1400;

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
      span.dataset.letterIndex = String(i);
      span.setAttribute('aria-hidden', 'true');
      el.appendChild(span);
    }
    el.setAttribute('aria-label', text);
  }

  function letters() {
    return document.querySelectorAll('.landing-header__wordmark .stick-tech-letter');
  }

  function clearLetterFx() {
    var list = letters();
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove(
        'stick-tech-letter--faded',
        'stick-tech-letter--painting',
        'stick-tech-letter--painted',
        'stick-tech-letter--broken',
        'stick-tech-letter--lifting',
        'stick-tech-letter--restored',
        'stick-tech-letter--wipe'
      );
    }
  }

  /** Prefiere la "a" de Fandez (cerca del dibujo en móvil). */
  function pickLetter(prefer) {
    var list = letters();
    if (!list.length) return null;
    var preferCh = (prefer || 'a').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if ((list[i].textContent || '').toLowerCase() === preferCh) return list[i];
    }
    // fallback: vocal del medio
    for (var j = 0; j < list.length; j++) {
      if (/[aeiouáéíóú]/i.test(list[j].textContent || '')) return list[j];
    }
    return list[Math.min(1, list.length - 1)];
  }

  function clearDock(root) {
    root.classList.remove('is-letter-dock', 'is-bush-run', 'is-wiping');
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.width = '';
    root.style.height = '';
  }

  function dockNearLetter(root, letter) {
    var shell = root.closest('.landing-shell');
    if (!shell || !letter) return;
    var shellRect = shell.getBoundingClientRect();
    var letterRect = letter.getBoundingClientRect();
    var left = letterRect.left - shellRect.left - 6;
    var top = letterRect.bottom - shellRect.top + 2;
    // Mantener dentro del shell
    left = Math.max(4, Math.min(left, shellRect.width - 96));
    top = Math.max(2, Math.min(top, 120));
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.style.right = 'auto';
    root.style.width = '5.6rem';
    root.style.height = '6.4rem';
    root.classList.add('is-letter-dock');
  }

  function runPaint(root, letter, timers) {
    if (!letter) return;
    letter.classList.add('stick-tech-letter--faded');
    dockNearLetter(root, letter);
    timers.push(setTimeout(function () {
      letter.classList.add('stick-tech-letter--painting');
      root.classList.add('is-painting');
    }, 900));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--faded', 'stick-tech-letter--painting');
      letter.classList.add('stick-tech-letter--painted');
      root.classList.remove('is-painting');
    }, 4200));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--painted');
    }, 6200));
  }

  function runBreak(root, letter, timers) {
    if (!letter) return;
    letter.classList.add('stick-tech-letter--broken');
    dockNearLetter(root, letter);
    timers.push(setTimeout(function () {
      letter.classList.add('stick-tech-letter--lifting');
      root.classList.add('is-lifting');
    }, 1600));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--broken', 'stick-tech-letter--lifting');
      letter.classList.add('stick-tech-letter--restored');
      root.classList.remove('is-lifting');
    }, 4800));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--restored');
    }, 7000));
  }

  function runBush(root) {
    root.classList.add('is-bush-run');
    // Posición fija a la derecha del hero, con recorrido
    root.style.left = '';
    root.style.top = '';
    root.style.right = '0.1rem';
    root.style.width = '9.5rem';
    root.style.height = '9.5rem';
  }

  function setScene(root, name, timers) {
    clearLetterFx();
    clearDock(root);
    root.classList.remove('is-painting', 'is-lifting');
    root.setAttribute('data-scene', name || '');

    if (name === 'paint') {
      runPaint(root, pickLetter('a'), timers);
    } else if (name === 'break') {
      runBreak(root, pickLetter('a'), timers);
    } else if (name === 'bush') {
      runBush(root);
    }
  }

  function clearTimers(timers) {
    while (timers.length) clearTimeout(timers.pop());
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
    var loopTimer = null;
    var sceneTimers = [];

    function next() {
      clearTimers(sceneTimers);
      var scene = SCENES[i % SCENES.length];
      setScene(root, scene, sceneTimers);
      root.classList.remove('is-exiting');
      root.classList.add('is-active');

      var duration = SCENE_MS[scene] || SCENE_MS.default;
      clearTimeout(loopTimer);
      loopTimer = setTimeout(function () {
        root.classList.add('is-exiting');
        loopTimer = setTimeout(function () {
          root.classList.remove('is-active');
          clearTimers(sceneTimers);
          clearLetterFx();
          clearDock(root);
          root.setAttribute('data-scene', '');
          root.classList.remove('is-painting', 'is-lifting');
          i += 1;
          loopTimer = setTimeout(next, PAUSE_MS);
        }, 650);
      }, duration);
    }

    setTimeout(next, 700);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(loopTimer);
        clearTimers(sceneTimers);
        root.classList.remove('is-active', 'is-exiting', 'is-painting', 'is-lifting');
        clearLetterFx();
        clearDock(root);
        root.setAttribute('data-scene', '');
      } else if (!prefersReducedMotion()) {
        clearTimeout(loopTimer);
        loopTimer = setTimeout(next, 500);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

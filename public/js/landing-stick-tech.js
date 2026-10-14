/**
 * Técnico stick — aparece tras 5 min e interactúa pegado a las letras.
 */
(function () {
  'use strict';

  var SCENES = ['paint', 'break', 'bush', 'paint', 'drip', 'break'];
  var SCENE_MS = {
    paint: 8200,
    break: 8600,
    bush: 7600,
    drip: 6500,
    default: 7200
  };
  var BETWEEN_SCENES_MS = 5 * 60 * 1000; // 5 min entre cada aparición
  var FIRST_DELAY_MS = 5 * 60 * 1000; // primera vez a los 5 min

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

  function pickLetter(prefer) {
    var list = letters();
    if (!list.length) return null;
    var preferCh = (prefer || 'a').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if ((list[i].textContent || '').toLowerCase() === preferCh) return list[i];
    }
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

  /** Pegado a la letra para que se note que el monito hace el cambio. */
  function dockNearLetter(root, letter) {
    var shell = root.closest('.landing-shell');
    if (!shell || !letter) return;
    var shellRect = shell.getBoundingClientRect();
    var letterRect = letter.getBoundingClientRect();
    var actorW = 68;
    var actorH = 78;
    // Mano del monito sobre / al lado de la letra
    var left = letterRect.left - shellRect.left - 10;
    var top = letterRect.top - shellRect.top - 6;
    left = Math.max(2, Math.min(left, shellRect.width - actorW - 4));
    top = Math.max(0, Math.min(top, shellRect.height - actorH - 8));
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.style.right = 'auto';
    root.style.width = actorW + 'px';
    root.style.height = actorH + 'px';
    root.classList.add('is-letter-dock');
  }

  function runPaint(root, letter, timers) {
    if (!letter) return;
    dockNearLetter(root, letter);
    // Primero llega el monito; luego cambia la letra
    timers.push(setTimeout(function () {
      letter.classList.add('stick-tech-letter--faded');
      letter.classList.add('stick-tech-letter--painting');
      root.classList.add('is-painting');
    }, 700));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--faded', 'stick-tech-letter--painting');
      letter.classList.add('stick-tech-letter--painted');
      root.classList.remove('is-painting');
    }, 4800));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--painted');
    }, 7000));
  }

  function runBreak(root, letter, timers) {
    if (!letter) return;
    dockNearLetter(root, letter);
    timers.push(setTimeout(function () {
      letter.classList.add('stick-tech-letter--broken');
    }, 500));
    timers.push(setTimeout(function () {
      letter.classList.add('stick-tech-letter--lifting');
      root.classList.add('is-lifting');
    }, 1800));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--broken', 'stick-tech-letter--lifting');
      letter.classList.add('stick-tech-letter--restored');
      root.classList.remove('is-lifting');
    }, 5200));
    timers.push(setTimeout(function () {
      letter.classList.remove('stick-tech-letter--restored');
    }, 7400));
  }

  function runBush(root) {
    var letter = pickLetter('a');
    root.classList.add('is-bush-run');
    if (letter) {
      dockNearLetter(root, letter);
      root.style.width = '110px';
      root.style.height = '96px';
      // un poco más abajo para el arbusto
      var top = parseFloat(root.style.top) || 0;
      root.style.top = Math.min(top + 18, 110) + 'px';
    } else {
      root.style.left = '2.4rem';
      root.style.top = '2.6rem';
      root.style.right = 'auto';
      root.style.width = '110px';
      root.style.height = '96px';
    }
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
    } else if (name === 'drip') {
      var letter = pickLetter('a');
      if (letter) dockNearLetter(root, letter);
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

    // Hasta los 5 min no se muestra
    root.classList.add('is-waiting');
    root.setAttribute('data-scene', '');

    if (prefersReducedMotion()) {
      // Sin animación: no aparece
      return;
    }

    var i = 0;
    var loopTimer = null;
    var delayTimer = null;
    var sceneTimers = [];
    var started = false;

    function next() {
      clearTimers(sceneTimers);
      var scene = SCENES[i % SCENES.length];
      setScene(root, scene, sceneTimers);
      root.classList.remove('is-exiting', 'is-waiting');
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
          root.classList.add('is-waiting');
          root.classList.remove('is-painting', 'is-lifting');
          i += 1;
          // Una sola escena; la siguiente recién a los 5 minutos
          loopTimer = setTimeout(next, BETWEEN_SCENES_MS);
        }, 650);
      }, duration);
    }

    function startLoop() {
      if (started) return;
      started = true;
      root.classList.remove('is-waiting');
      next();
    }

    delayTimer = setTimeout(startLoop, FIRST_DELAY_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(loopTimer);
        clearTimers(sceneTimers);
        root.classList.remove('is-active', 'is-exiting', 'is-painting', 'is-lifting');
        clearLetterFx();
        clearDock(root);
        root.setAttribute('data-scene', '');
        if (!started) root.classList.add('is-waiting');
      } else if (started && !prefersReducedMotion()) {
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

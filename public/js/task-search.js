/**
 * Buscador universal de tareas → servicio (landing + home cliente).
 */
(function () {
  'use strict';

  var INTENT_KEY = 'fandez_service_intent';

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function t(key, fallback) {
    if (typeof FandezI18n !== 'undefined' && typeof FandezI18n.t === 'function') {
      var v = FandezI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function scoreEntry(entry, q, tokens) {
    var score = 0;
    var nameN = normalize(entry.name);
    var hay = entry.haystack || '';
    if (nameN === q) score += 100;
    else if (nameN.indexOf(q) !== -1) score += 60;
    if (hay.indexOf(q) !== -1) score += 40;
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (nameN.indexOf(token) !== -1) score += 18;
      if (hay.indexOf(token) !== -1) score += 10;
      var kws = entry.keywords || [];
      for (var k = 0; k < kws.length; k++) {
        var kn = normalize(kws[k]);
        if (kn === token) score += 14;
        else if (kn.indexOf(token) !== -1) score += 6;
      }
    }
    return score;
  }

  function search(query, index, limit) {
    var q = normalize(query);
    if (!q || q.length < 2) return [];
    var tokens = q.split(' ').filter(function (tok) { return tok.length >= 2; });
    if (!tokens.length) return [];
    var scored = (index || []).map(function (entry) {
      return { entry: entry, score: scoreEntry(entry, q, tokens) };
    }).filter(function (row) { return row.score > 0; });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.entry.name).localeCompare(String(b.entry.name), 'es');
    });
    return scored.slice(0, limit || 8).map(function (row) { return row.entry; });
  }

  function hrefFor(entry, mode) {
    var camino = entry.camino === 'proyecto' ? 'proyecto' : 'ahora';
    if (mode === 'client') {
      return '/cliente/servicio/' + encodeURIComponent(entry.id) + '?camino=' + camino;
    }
    return '/registro?role=client&billing=natural&servicio=' + encodeURIComponent(entry.id) + '&camino=' + camino;
  }

  function setIntent(entry) {
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify({
        id: entry.id,
        camino: entry.camino === 'proyecto' ? 'proyecto' : 'ahora'
      }));
    } catch (e) { /* ignore */ }
  }

  function consumeIntentIfAny() {
    try {
      var raw = sessionStorage.getItem(INTENT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(INTENT_KEY);
      var data = JSON.parse(raw);
      if (!data || !data.id) return;
      if (window.location.pathname.indexOf('/cliente') !== 0) return;
      if (window.location.pathname.indexOf('/cliente/servicio/') === 0) return;
      var camino = data.camino === 'proyecto' ? 'proyecto' : 'ahora';
      window.location.replace('/cliente/servicio/' + encodeURIComponent(data.id) + '?camino=' + camino);
    } catch (e) { /* ignore */ }
  }

  function renderResults(root, results, mode) {
    var list = root.querySelector('[data-task-search-results]');
    var empty = root.querySelector('[data-task-search-empty]');
    var hint = root.querySelector('[data-task-search-hint]');
    if (!list) return;

    list.innerHTML = '';
    if (!results.length) {
      list.hidden = true;
      if (empty) empty.hidden = false;
      if (hint) hint.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (hint) hint.hidden = true;
    list.hidden = false;

    results.forEach(function (entry) {
      var a = document.createElement('a');
      a.className = 'task-search-result';
      a.href = hrefFor(entry, mode);
      a.setAttribute('data-service-id', entry.id);
      if (mode !== 'client') {
        a.addEventListener('click', function () { setIntent(entry); });
      }
      var match = (entry.sampleTasks && entry.sampleTasks[0])
        ? entry.sampleTasks[0]
        : t('task_search.match_fallback', 'Servicio recomendado');
      a.innerHTML =
        '<span class="task-search-result__main">' +
          '<strong class="task-search-result__name"></strong>' +
          '<span class="task-search-result__match"></span>' +
        '</span>' +
        '<span class="task-search-result__cta" aria-hidden="true">→</span>';
      a.querySelector('.task-search-result__name').textContent = entry.name;
      a.querySelector('.task-search-result__match').textContent = match;
      list.appendChild(a);
    });
  }

  function bindRoot(root) {
    var input = root.querySelector('[data-task-search-input]');
    var mode = root.getAttribute('data-mode') || 'landing';
    var index = [];
    try {
      var blob = root.querySelector('[data-task-search-index]');
      index = JSON.parse((blob && blob.textContent) || '[]');
    } catch (e) {
      index = [];
    }
    if (!input) return;

    var timer = null;
    function run() {
      var q = input.value || '';
      var hint = root.querySelector('[data-task-search-hint]');
      var empty = root.querySelector('[data-task-search-empty]');
      var list = root.querySelector('[data-task-search-results]');
      if (!q.trim()) {
        if (list) { list.innerHTML = ''; list.hidden = true; }
        if (empty) empty.hidden = true;
        if (hint) hint.hidden = false;
        return;
      }
      if (normalize(q).length < 2) {
        if (list) { list.innerHTML = ''; list.hidden = true; }
        if (empty) empty.hidden = true;
        if (hint) hint.hidden = false;
        return;
      }
      renderResults(root, search(q, index, 8), mode);
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var first = root.querySelector('.task-search-result');
      if (first) first.click();
    });
    var go = root.querySelector('[data-task-search-go]');
    if (go) {
      go.addEventListener('click', function () {
        run();
        var first = root.querySelector('.task-search-result');
        if (first) first.click();
        else input.focus();
      });
    }
  }

  function init() {
    consumeIntentIfAny();
    var roots = document.querySelectorAll('[data-task-search]');
    for (var i = 0; i < roots.length; i++) bindRoot(roots[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.FandezTaskSearch = { search: search, normalize: normalize };
})();

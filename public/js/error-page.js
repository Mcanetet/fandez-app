(function () {
  const cfg = window.FandezErrorPage || {};

  function withCacheBust(url) {
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('_retry', String(Date.now()));
      return u.pathname + u.search + u.hash;
    } catch (_) {
      const base = String(url || window.location.pathname || '/');
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + '_retry=' + Date.now();
    }
  }

  function hardNavigate(url) {
    const target = withCacheBust(url);
    try {
      window.location.replace(target);
    } catch (_) {
      window.location.href = target;
    }
  }

  function runAutoRetry() {
    if (!cfg.autoReloadMs || cfg.autoReloadMs <= 0) return;
    const label = document.getElementById('errorAutoRetry');
    if (!label) return;

    const template = label.dataset.template
      || (label.textContent && (label.textContent.includes('{{s}}') || label.textContent.includes('{seconds}'))
        ? label.textContent
        : '')
      || 'Reintentando en {seconds}s…';

    const started = Date.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((cfg.autoReloadMs - (Date.now() - started)) / 1000));
      label.textContent = template
        .replace(/\{\{s\}\}/g, String(left))
        .replace(/\{seconds\}/g, String(left));
      if (left <= 0) hardNavigate(cfg.retryPath || window.location.pathname || '/');
    };
    tick();
    setInterval(tick, 1000);
  }

  document.addEventListener('click', (e) => {
    const retry = e.target.closest('[data-error-retry], #errorRetryBtn');
    if (!retry) return;
    e.preventDefault();
    const href = retry.getAttribute('href') || cfg.retryPath || window.location.pathname || '/';
    hardNavigate(href);
  });

  runAutoRetry();

  const sloganEl = document.getElementById('errorSloganText');
  const tips = document.querySelectorAll('.fandez-error-tip');
  if (!cfg.slogans || !cfg.slogans.length || !sloganEl) return;

  let sloganIdx = 0;
  let tipIdx = 0;

  function cycleSlogan() {
    sloganEl.classList.remove('is-active');
    sloganEl.classList.add('is-exiting');

    setTimeout(() => {
      sloganIdx = (sloganIdx + 1) % cfg.slogans.length;
      sloganEl.textContent = cfg.slogans[sloganIdx];
      sloganEl.classList.remove('is-exiting');
      void sloganEl.offsetWidth;
      sloganEl.classList.add('is-active');
    }, 280);
  }

  function cycleTip() {
    if (!tips.length) return;
    tips[tipIdx].classList.remove('is-active');
    tipIdx = (tipIdx + 1) % tips.length;
    tips[tipIdx].classList.add('is-active');
  }

  setInterval(cycleSlogan, cfg.interval || 2800);
  setInterval(cycleTip, (cfg.interval || 2800) + 400);
})();

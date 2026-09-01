(function () {
  const cfg = window.FandezErrorPage || {};

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
      if (left <= 0) location.reload();
    };
    tick();
    setInterval(tick, 1000);
  }

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

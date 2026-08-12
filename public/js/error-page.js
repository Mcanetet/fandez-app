(function () {
  const cfg = window.FundezErrorPage;
  if (!cfg || !cfg.slogans || !cfg.slogans.length) return;

  const sloganEl = document.getElementById('errorSloganText');
  const tips = document.querySelectorAll('.fundez-error-tip');
  if (!sloganEl) return;

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

  if (cfg.autoReloadMs && cfg.autoReloadMs > 0) {
    const label = document.getElementById('errorAutoRetry');
    const started = Date.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((cfg.autoReloadMs - (Date.now() - started)) / 1000));
      if (label && label.dataset.template) {
        label.textContent = label.dataset.template.replace('{{s}}', String(left));
      }
      if (left <= 0) location.reload();
    };
    if (label) {
      label.dataset.template = label.textContent.includes('{{s}}')
        ? label.textContent
        : (label.textContent || 'Reintentando en {{s}}s…');
      if (!label.dataset.template.includes('{{s}}')) {
        label.dataset.template = 'Reintentando en {{s}}s…';
      }
    }
    tick();
    setInterval(tick, 1000);
  }
})();

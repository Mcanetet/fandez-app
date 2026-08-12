/**
 * Banner “Instalar Fundez” en móvil (PWA).
 * Android/Chrome: beforeinstallprompt. iOS Safari: instrucciones Añadir a inicio.
 */
(function () {
  const DISMISS_KEY = 'fundez_install_dismissed_v5';
  const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

  function t(key, fallback) {
    try {
      if (window.FundezI18n && typeof FundezI18n.t === 'function') {
        const v = FundezI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) { /* ignore */ }
    return fallback;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || document.referrer.includes('android-app://');
  }

  function isDismissed() {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      if (!Number.isFinite(ts)) return false;
      return Date.now() - ts < DISMISS_MS;
    } catch (_) {
      return false;
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    hide();
  }

  function isMobileish() {
    return window.matchMedia('(max-width: 900px)').matches
      || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '')
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  let deferredPrompt = null;
  let bannerEl = null;

  function hide() {
    if (bannerEl) bannerEl.classList.add('hidden');
  }

  function show(mode) {
    if (!bannerEl || isStandalone() || isDismissed()) return;
    bannerEl.dataset.mode = mode;
    const title = bannerEl.querySelector('[data-install-title]');
    const body = bannerEl.querySelector('[data-install-body]');
    const cta = bannerEl.querySelector('[data-install-cta]');
    if (mode === 'ios') {
      if (title) title.textContent = t('pwa.install_title', 'Lleva Fundez en tu celular');
      if (body) body.textContent = t('pwa.install_ios_body', 'En Safari: toca Compartir ⊞ y luego “Añadir a pantalla de inicio”.');
      if (cta) {
        cta.textContent = t('pwa.install_ios_cta', 'Ver cómo');
        cta.classList.remove('hidden');
      }
    } else {
      if (title) title.textContent = t('pwa.install_title', 'Lleva Fundez en tu celular');
      if (body) body.textContent = t('pwa.install_android_body', 'Instálala como app: acceso rápido, sin ocupar la tienda.');
      if (cta) {
        cta.textContent = t('pwa.install_cta', 'Instalar app');
        cta.classList.remove('hidden');
      }
    }
    bannerEl.classList.remove('hidden');
  }

  function ensureBanner() {
    bannerEl = document.getElementById('fundezInstallBanner');
    if (bannerEl) return bannerEl;

    bannerEl = document.createElement('div');
    bannerEl.id = 'fundezInstallBanner';
    bannerEl.className = 'fundez-install-banner hidden';
    bannerEl.setAttribute('role', 'dialog');
    bannerEl.setAttribute('aria-live', 'polite');
    bannerEl.innerHTML = `
      <div class="fundez-install-banner__card">
        <img class="fundez-install-banner__icon" src="/icons/fundez-v5-96.png" width="48" height="48" alt="">
        <div class="fundez-install-banner__text">
          <p class="fundez-install-banner__title" data-install-title></p>
          <p class="fundez-install-banner__body" data-install-body></p>
        </div>
        <button type="button" class="fundez-install-banner__close" data-install-dismiss aria-label="Cerrar">×</button>
      </div>
      <div class="fundez-install-banner__actions">
        <button type="button" class="fundez-install-banner__cta" data-install-cta></button>
        <button type="button" class="fundez-install-banner__later" data-install-dismiss-later></button>
      </div>
      <div class="fundez-install-banner__ios hidden" data-install-ios-steps>
        <ol>
          <li data-ios-step1></li>
          <li data-ios-step2></li>
          <li data-ios-step3></li>
        </ol>
      </div>
    `;
    document.body.appendChild(bannerEl);

    bannerEl.querySelector('[data-install-dismiss]')?.addEventListener('click', dismiss);
    bannerEl.querySelector('[data-install-dismiss-later]')?.addEventListener('click', dismiss);
    const later = bannerEl.querySelector('[data-install-dismiss-later]');
    if (later) later.textContent = t('pwa.install_later', 'Ahora no');

    bannerEl.querySelector('[data-install-cta]')?.addEventListener('click', async () => {
      const mode = bannerEl.dataset.mode;
      if (mode === 'ios') {
        const steps = bannerEl.querySelector('[data-install-ios-steps]');
        if (steps) {
          steps.classList.toggle('hidden');
          const s1 = steps.querySelector('[data-ios-step1]');
          const s2 = steps.querySelector('[data-ios-step2]');
          const s3 = steps.querySelector('[data-ios-step3]');
          if (s1) s1.textContent = t('pwa.ios_step1', 'Toca el botón Compartir en la barra de Safari.');
          if (s2) s2.textContent = t('pwa.ios_step2', 'Desplázate y elige “Añadir a pantalla de inicio”.');
          if (s3) s3.textContent = t('pwa.ios_step3', 'Confirma “Añadir”. Fundez quedará como app.');
        }
        return;
      }
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (_) { /* ignore */ }
      deferredPrompt = null;
      dismiss();
    });

    return bannerEl;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    });
  }

  function init() {
    registerServiceWorker();
    if (isStandalone() || isDismissed() || !isMobileish()) return;

    ensureBanner();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      show('android');
    });

    // iOS / sin evento nativo: mostrar guía tras un breve delay
    if (isIos()) {
      setTimeout(() => show('ios'), 1800);
    } else {
      // Fallback si el navegador no dispara beforeinstallprompt (p. ej. Firefox)
      setTimeout(() => {
        if (!deferredPrompt && !isStandalone() && bannerEl?.classList.contains('hidden')) {
          show('ios');
          const body = bannerEl.querySelector('[data-install-body]');
          if (body) {
            body.textContent = t(
              'pwa.install_manual_body',
              'Abre el menú del navegador y elige “Instalar app” o “Añadir a pantalla de inicio”.'
            );
          }
        }
      }, 4500);
    }

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      dismiss();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

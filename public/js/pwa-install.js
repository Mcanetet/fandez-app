/**
 * Instalar Fandez en el celular (PWA).
 * Android/Chrome: beforeinstallprompt. iOS Safari: Añadir a pantalla de inicio.
 * El botón de la landing siempre puede reabrir la guía, aunque se haya cerrado el aviso.
 */
(function () {
  const DISMISS_KEY = 'fandez_install_dismissed_v6';
  const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;

  function t(key, fallback) {
    try {
      if (window.FandezI18n && typeof FandezI18n.t === 'function') {
        const v = FandezI18n.t(key);
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

  function isMobileish() {
    return window.matchMedia('(max-width: 900px)').matches
      || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '')
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Snapchat|Pinterest|GSA\//i.test(ua);
  }

  function cookieBannerOpen() {
    const el = document.getElementById('cookieBanner');
    return !!(el && !el.classList.contains('hidden'));
  }

  let deferredPrompt = null;
  let bannerEl = null;

  function hide() {
    if (bannerEl) {
      bannerEl.classList.add('hidden');
      bannerEl.classList.remove('fandez-install-banner--forced');
    }
    document.body.classList.remove('fandez-install-visible');
  }

  function setCopy(mode) {
    if (!bannerEl) return;
    bannerEl.dataset.mode = mode;
    const title = bannerEl.querySelector('[data-install-title]');
    const body = bannerEl.querySelector('[data-install-body]');
    const cta = bannerEl.querySelector('[data-install-cta]');
    const later = bannerEl.querySelector('[data-install-dismiss-later]');
    if (later) later.textContent = t('pwa.install_later', 'Ahora no');

    if (mode === 'inapp') {
      if (title) title.textContent = t('pwa.inapp_title', 'Ábrela en Safari o Chrome');
      if (body) body.textContent = t('pwa.inapp_body', 'Desde WhatsApp u otras apps no se puede instalar. Toca ⋯ y elige “Abrir en el navegador”.');
      if (cta) {
        cta.textContent = t('pwa.inapp_cta', 'Ver cómo');
        cta.classList.remove('hidden');
      }
      return;
    }
    if (mode === 'ios') {
      if (title) title.textContent = t('pwa.install_title', 'Instala Fandez en tu celular');
      if (body) body.textContent = t('pwa.install_ios_body', 'En Safari: toca Compartir y luego “Añadir a pantalla de inicio”.');
      if (cta) {
        cta.textContent = t('pwa.install_ios_cta', 'Ver cómo');
        cta.classList.remove('hidden');
      }
      return;
    }
    if (title) title.textContent = t('pwa.install_title', 'Instala Fandez en tu celular');
    if (body) {
      body.textContent = deferredPrompt
        ? t('pwa.install_android_body', 'Instálala como app: acceso rápido, sin ocupar la tienda.')
        : t('pwa.install_manual_body', 'Abre el menú del navegador y elige “Instalar app” o “Añadir a pantalla de inicio”.');
    }
    if (cta) {
      cta.textContent = t('pwa.install_cta', 'Instalar app');
      cta.classList.remove('hidden');
    }
  }

  function showSteps(open) {
    const steps = bannerEl?.querySelector('[data-install-ios-steps]');
    if (!steps) return;
    steps.classList.toggle('hidden', open === false);
    if (steps.classList.contains('hidden')) return;
    const s1 = steps.querySelector('[data-ios-step1]');
    const s2 = steps.querySelector('[data-ios-step2]');
    const s3 = steps.querySelector('[data-ios-step3]');
    const mode = bannerEl.dataset.mode;
    if (mode === 'inapp') {
      if (s1) s1.textContent = t('pwa.inapp_step1', 'Toca los tres puntos ⋯ o Compartir arriba a la derecha.');
      if (s2) s2.textContent = t('pwa.inapp_step2', 'Elige “Abrir en Safari” (iPhone) o “Abrir en Chrome” (Android).');
      if (s3) s3.textContent = t('pwa.inapp_step3', 'Ahí verás el botón para instalar Fandez en tu pantalla de inicio.');
      return;
    }
    if (s1) s1.textContent = t('pwa.ios_step1', 'Toca el botón Compartir en la barra de Safari.');
    if (s2) s2.textContent = t('pwa.ios_step2', 'Desplázate y elige “Añadir a pantalla de inicio”.');
    if (s3) s3.textContent = t('pwa.ios_step3', 'Confirma “Añadir”. Fandez quedará como app.');
  }

  function show(options) {
    const force = !!(options && options.force);
    if (isStandalone()) return;
    if (!force && isDismissed()) return;
    ensureBanner();
    if (!bannerEl) return;

    let mode = 'android';
    if (isInAppBrowser()) mode = 'inapp';
    else if (isIos()) mode = 'ios';
    else if (!deferredPrompt) mode = 'android';

    setCopy(mode);
    bannerEl.classList.remove('hidden');
    bannerEl.classList.toggle('fandez-install-banner--forced', force);
    document.body.classList.add('fandez-install-visible');
    if (force && (mode === 'ios' || mode === 'inapp')) showSteps(true);
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    hide();
    showSteps(false);
  }

  function promptNativeOrGuide() {
    const mode = bannerEl?.dataset.mode;
    if (mode === 'ios' || mode === 'inapp') {
      showSteps();
      return;
    }
    if (!deferredPrompt) {
      showSteps(true);
      const s1 = bannerEl.querySelector('[data-ios-step1]');
      const s2 = bannerEl.querySelector('[data-ios-step2]');
      const s3 = bannerEl.querySelector('[data-ios-step3]');
      if (s1) s1.textContent = t('pwa.android_step1', 'Toca el menú ⋮ arriba a la derecha en Chrome.');
      if (s2) s2.textContent = t('pwa.android_step2', 'Elige “Instalar app” o “Añadir a la pantalla de inicio”.');
      if (s3) s3.textContent = t('pwa.android_step3', 'Confirma. Fandez quedará como las demás apps.');
      return;
    }
    deferredPrompt.prompt();
    Promise.resolve(deferredPrompt.userChoice).catch(() => {}).finally(() => {
      deferredPrompt = null;
      dismiss();
    });
  }

  function ensureBanner() {
    bannerEl = document.getElementById('fandezInstallBanner');
    if (bannerEl) return bannerEl;

    bannerEl = document.createElement('div');
    bannerEl.id = 'fandezInstallBanner';
    bannerEl.className = 'fandez-install-banner hidden';
    bannerEl.setAttribute('role', 'dialog');
    bannerEl.setAttribute('aria-live', 'polite');
    bannerEl.innerHTML = `
      <div class="fandez-install-banner__card">
        <img class="fandez-install-banner__icon" src="/icons/fandez-v6-96.png" width="48" height="48" alt="">
        <div class="fandez-install-banner__text">
          <p class="fandez-install-banner__title" data-install-title></p>
          <p class="fandez-install-banner__body" data-install-body></p>
        </div>
        <button type="button" class="fandez-install-banner__close" data-install-dismiss aria-label="Cerrar">×</button>
      </div>
      <div class="fandez-install-banner__actions">
        <button type="button" class="fandez-install-banner__cta" data-install-cta></button>
        <button type="button" class="fandez-install-banner__later" data-install-dismiss-later></button>
      </div>
      <div class="fandez-install-banner__ios hidden" data-install-ios-steps>
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
    bannerEl.querySelector('[data-install-cta]')?.addEventListener('click', promptNativeOrGuide);
    return bannerEl;
  }

  function bindPageButtons() {
    document.querySelectorAll('[data-install-app]').forEach((btn) => {
      if (isStandalone()) {
        btn.classList.add('hidden');
        return;
      }
      btn.classList.remove('hidden');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        show({ force: true });
        promptNativeOrGuide();
      });
    });
  }

  function whenCookiesClear(cb) {
    if (!cookieBannerOpen()) {
      cb();
      return;
    }
    const el = document.getElementById('cookieBanner');
    const obs = new MutationObserver(() => {
      if (!cookieBannerOpen()) {
        obs.disconnect();
        cb();
      }
    });
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => {
      obs.disconnect();
      cb();
    }, 25000);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }

  function init() {
    registerServiceWorker();
    bindPageButtons();
    if (isStandalone()) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (bannerEl && !bannerEl.classList.contains('hidden')) setCopy('android');
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      dismiss();
    });

    if (!isMobileish()) return;
    ensureBanner();
    whenCookiesClear(() => {
      setTimeout(() => show({ force: false }), 400);
    });
  }

  window.FandezPwa = {
    show: function () { show({ force: true }); },
    prompt: function () {
      show({ force: true });
      promptNativeOrGuide();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

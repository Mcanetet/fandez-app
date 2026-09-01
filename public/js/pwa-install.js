/**
 * Instalar Fandez en el celular (PWA).
 * Android/Chrome: beforeinstallprompt.
 * iOS Safari: guía “Añadir a pantalla de inicio” (Apple no permite instalar con un botón).
 */
(function () {
  const DISMISS_KEY = 'fandez_install_dismissed_v7';
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

  function isSafari() {
    const ua = navigator.userAgent || '';
    return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);
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
      bannerEl.classList.remove('fandez-install-banner--ios-guide');
    }
    document.body.classList.remove('fandez-install-visible');
  }

  function fillSteps(mode) {
    if (!bannerEl) return;
    const s1 = bannerEl.querySelector('[data-ios-step1]');
    const s2 = bannerEl.querySelector('[data-ios-step2]');
    const s3 = bannerEl.querySelector('[data-ios-step3]');
    if (mode === 'inapp') {
      if (s1) s1.innerHTML = t('pwa.inapp_step1_html', 'Toca <strong>⋯</strong> o el ícono de compartir arriba a la derecha.');
      if (s2) s2.innerHTML = t('pwa.inapp_step2_html', 'Elige <strong>Abrir en Safari</strong> (iPhone) o <strong>Abrir en Chrome</strong> (Android).');
      if (s3) s3.innerHTML = t('pwa.inapp_step3_html', 'En el navegador vuelve a tocar <strong>Instalar app en el celular</strong>.');
      return;
    }
    if (mode === 'ios') {
      if (s1) s1.innerHTML = t('pwa.ios_step1_html', 'Abajo en Safari, toca el ícono <span class="fandez-share-glyph" aria-hidden="true"></span> <strong>Compartir</strong>.');
      if (s2) s2.innerHTML = t('pwa.ios_step2_html', 'Desplázate y elige <strong>Añadir a pantalla de inicio</strong>.');
      if (s3) s3.innerHTML = t('pwa.ios_step3_html', 'Confirma <strong>Añadir</strong>. Fandez quedará como una app.');
      return;
    }
    if (s1) s1.innerHTML = t('pwa.android_step1_html', 'Toca el menú <strong>⋮</strong> arriba a la derecha en Chrome.');
    if (s2) s2.innerHTML = t('pwa.android_step2_html', 'Elige <strong>Instalar app</strong> o <strong>Añadir a la pantalla de inicio</strong>.');
    if (s3) s3.innerHTML = t('pwa.android_step3_html', 'Confirma. Fandez quedará junto a tus otras apps.');
  }

  function setCopy(mode) {
    if (!bannerEl) return;
    bannerEl.dataset.mode = mode;
    const title = bannerEl.querySelector('[data-install-title]');
    const body = bannerEl.querySelector('[data-install-body]');
    const cta = bannerEl.querySelector('[data-install-cta]');
    const later = bannerEl.querySelector('[data-install-dismiss-later]');
    const hint = bannerEl.querySelector('[data-install-safari-hint]');
    const steps = bannerEl.querySelector('[data-install-ios-steps]');
    if (later) later.textContent = t('pwa.install_later', 'Ahora no');

    bannerEl.classList.toggle('fandez-install-banner--ios-guide', mode === 'ios' || mode === 'inapp');

    if (mode === 'inapp') {
      if (title) title.textContent = t('pwa.inapp_title', 'Ábrela primero en Safari');
      if (body) body.textContent = t('pwa.inapp_body', 'Desde WhatsApp u otras apps no se puede instalar. Ábrela en Safari y luego añádela a tu pantalla de inicio.');
      if (cta) {
        cta.textContent = t('pwa.install_got_it', 'Entendido');
        cta.classList.remove('hidden');
      }
      if (hint) hint.classList.add('hidden');
      if (steps) steps.classList.remove('hidden');
      fillSteps('inapp');
      return;
    }

    if (mode === 'ios') {
      if (title) title.textContent = t('pwa.install_ios_title', 'Añade Fandez a tu pantalla de inicio');
      if (body) body.textContent = t('pwa.install_ios_body', 'En iPhone no se descarga desde una tienda. Se agrega desde Safari en 3 pasos:');
      if (cta) {
        cta.textContent = t('pwa.install_got_it', 'Entendido');
        cta.classList.remove('hidden');
      }
      if (hint) {
        hint.textContent = t('pwa.ios_toolbar_hint', 'El botón Compartir está en la barra de Safari, abajo al centro.');
        hint.classList.remove('hidden');
      }
      if (steps) steps.classList.remove('hidden');
      fillSteps('ios');
      return;
    }

    if (title) title.textContent = t('pwa.install_title', 'Instala Fandez en tu celular');
    if (body) {
      body.textContent = deferredPrompt
        ? t('pwa.install_android_body', 'Instálala como app: acceso rápido, sin tienda.')
        : t('pwa.install_manual_body', 'Ábrela desde el menú del navegador y elige Instalar app.');
    }
    if (cta) {
      cta.textContent = deferredPrompt
        ? t('pwa.install_cta', 'Instalar app')
        : t('pwa.install_ios_cta', 'Ver cómo');
      cta.classList.remove('hidden');
    }
    if (hint) hint.classList.add('hidden');
    if (steps) steps.classList.toggle('hidden', !!deferredPrompt);
    if (!deferredPrompt) fillSteps('android');
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

    setCopy(mode);
    bannerEl.classList.remove('hidden');
    bannerEl.classList.toggle('fandez-install-banner--forced', force);
    document.body.classList.add('fandez-install-visible');
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* ignore */ }
    hide();
  }

  function promptNativeOrGuide() {
    const mode = bannerEl?.dataset.mode;
    if (mode === 'ios' || mode === 'inapp') {
      // En iOS solo hay guía; el CTA cierra para que el usuario siga los pasos.
      dismiss();
      return;
    }
    if (!deferredPrompt) {
      const steps = bannerEl?.querySelector('[data-install-ios-steps]');
      if (steps) steps.classList.remove('hidden');
      fillSteps('android');
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
    bannerEl.setAttribute('aria-modal', 'true');
    bannerEl.setAttribute('aria-live', 'polite');
    bannerEl.innerHTML = `
      <div class="fandez-install-banner__sheet">
        <div class="fandez-install-banner__card">
          <img class="fandez-install-banner__icon" src="/icons/fandez-v6-96.png" width="48" height="48" alt="">
          <div class="fandez-install-banner__text">
            <p class="fandez-install-banner__title" data-install-title></p>
            <p class="fandez-install-banner__body" data-install-body></p>
          </div>
          <button type="button" class="fandez-install-banner__close" data-install-dismiss aria-label="Cerrar">×</button>
        </div>
        <div class="fandez-install-banner__ios hidden" data-install-ios-steps>
          <ol>
            <li data-ios-step1></li>
            <li data-ios-step2></li>
            <li data-ios-step3></li>
          </ol>
          <p class="fandez-install-banner__hint hidden" data-install-safari-hint></p>
        </div>
        <div class="fandez-install-banner__actions">
          <button type="button" class="fandez-install-banner__cta" data-install-cta></button>
          <button type="button" class="fandez-install-banner__later" data-install-dismiss-later></button>
        </div>
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
    // En iOS Safari no auto-empujar el modal: solo al tocar “Instalar app”.
    // En Android sí se puede mostrar aviso suave.
    whenCookiesClear(() => {
      if (isIos() || isInAppBrowser()) return;
      setTimeout(() => show({ force: false }), 800);
    });
  }

  window.FandezPwa = {
    show: function () { show({ force: true }); },
    prompt: function () { show({ force: true }); },
    isIos: isIos,
    isSafari: isSafari
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

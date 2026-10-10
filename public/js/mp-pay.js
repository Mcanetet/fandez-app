/**
 * Helpers compartidos: config Brick, montaje y cobro Checkout API.
 */
(function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const isSdk = src.includes('sdk.mercadopago.com');
      const isBrick = src.includes('checkout-mp-brick');
      if (isSdk && window.MercadoPago) return resolve();
      if (isBrick && window.FandezMpBrick) return resolve();

      const existing = isBrick
        ? document.querySelector('script[src*="checkout-mp-brick"]')
        : document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if ((isSdk && window.MercadoPago) || (isBrick && window.FandezMpBrick) || existing.dataset.loaded === '1') {
          return resolve();
        }
        existing.addEventListener('load', () => { existing.dataset.loaded = '1'; resolve(); }, { once: true });
        existing.addEventListener('error', () => reject(new Error('script')), { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('script'));
      document.head.appendChild(s);
    });
  }

  async function ensureScripts() {
    if (!window.MercadoPago) await loadScript('https://sdk.mercadopago.com/js/v2');
    if (!window.FandezMpBrick) await loadScript('/js/checkout-mp-brick.js?v=20261010-card1');
  }

  async function fetchConfig() {
    const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (data?.success && typeof window.FandezRenderMpCardBrands === 'function') {
      window.FandezRenderMpCardBrands(data);
    }
    return data;
  }

  function postTarjeta(body) {
    return fetch('/pagos/mp/tarjeta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (window.FandezNotify?.showPaymentError) FandezNotify.showPaymentError(data);
        else if (window.FandezNotify) FandezNotify.show(data.error || 'No se pudo procesar el pago.', 'error');
        throw new Error(data.error || 'pago');
      }
      if (data.redirect) window.location.href = data.redirect;
      return data;
    });
  }

  function openCheckoutPro(body) {
    return fetch('/pagos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, forceRedirect: true, paymentMethod: 'card', cardGateway: 'mercadopago' })
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return data;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return data;
      }
      throw new Error(data.error || 'No se pudo abrir Mercado Pago');
    });
  }

  /**
   * Monta Payment Brick y cablea submit → /pagos/mp/tarjeta.
   * @returns {{ active: boolean, publicKey?: string, amount?: number }}
   */
  async function mountBrick(opts) {
    const {
      publicKey: initialPk,
      amount,
      containerId,
      sectionId,
      payerEmail,
      billing,
      requestId,
      useCredits,
      usePoints,
      promoCode,
      onReady,
      onBeforeSubmit
    } = opts;

    await ensureScripts();
    const cfg = await fetchConfig().catch(() => ({}));
    const publicKey = (cfg && cfg.publicKey) || initialPk || '';
    const embed = cfg.success ? Boolean(cfg.embed) : true;

    if (!embed || !publicKey || !window.FandezMpBrick) {
      return { active: false, publicKey, amount };
    }

    const rounded = Math.round(Number(amount) || 0);
    if (rounded > 0 && rounded < 50) {
      console.warn('[mp-pay] monto demasiado bajo para tarjeta', rounded);
      return { active: false, publicKey, amount: rounded, reason: 'amount_too_low' };
    }

    const result = await window.FandezMpBrick.sync({
      embed: true,
      publicKey,
      amount: rounded,
      paymentMethod: 'card',
      cardGateway: 'mercadopago',
      containerId,
      sectionId,
      payerEmail,
      onReady,
      onBeforeSubmit,
      submitPayment: (formData) => postTarjeta({
        requestId,
        formData,
        paymentMethod: 'card',
        cardGateway: 'mercadopago',
        billing: typeof billing === 'function' ? billing() : billing,
        useCredits,
        usePoints,
        promoCode
      })
    });

    return {
      active: Boolean(result?.active),
      publicKey,
      amount: rounded,
      reason: result?.reason || null,
      mode: result?.mode || null
    };
  }

  window.FandezMpPay = {
    ensureScripts,
    fetchConfig,
    postTarjeta,
    openCheckoutPro,
    mountBrick
  };
})();

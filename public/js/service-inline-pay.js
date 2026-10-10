/**
 * Pago embebido: Payment Brick + Checkout API (/pagos/mp/tarjeta).
 */
(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

  const params = new URLSearchParams(window.location.search);
  const payFlow = params.get('pay') === '1' || page.dataset.payFlow === '1';
  if (page.dataset.tracking && !payFlow) return;

  const orderSections = document.getElementById('serviceOrderSections');
  const inlineRoot = document.getElementById('inlineCheckout');
  if (!inlineRoot) return;

  let requestId = null;
  let mpConfigFetched = false;
  let mpEmbed = page.dataset.mpEmbed === '1';
  let mpPublicKey = page.dataset.mpPublicKey || '';
  let mpActive = false;
  let scriptsPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const isMpSdk = src.includes('sdk.mercadopago.com');
      const isHelper = src.includes('checkout-mp-brick');
      if (isMpSdk && window.MercadoPago) return resolve();
      if (isHelper && window.FandezMpBrick) return resolve();
      const existing = isHelper
        ? document.querySelector('script[src*="checkout-mp-brick"]')
        : document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if ((isMpSdk && window.MercadoPago) || (isHelper && window.FandezMpBrick) || existing.dataset.loaded === '1') {
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

  function ensureMpScripts() {
    if (window.MercadoPago && window.FandezMpBrick) return Promise.resolve();
    if (scriptsPromise) return scriptsPromise;
    scriptsPromise = (async () => {
      if (!window.MercadoPago) await loadScript('https://sdk.mercadopago.com/js/v2');
      if (!window.FandezMpBrick) await loadScript('/js/checkout-mp-brick.js?v=20261009-pay2');
    })().catch((err) => { scriptsPromise = null; throw err; });
    return scriptsPromise;
  }

  if (payFlow || (mpEmbed && mpPublicKey)) {
    ensureMpScripts().catch(() => {});
  }

  function setLoading(on) {
    const el = document.getElementById('inlineMpBrickLoading');
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function setError(message) {
    const el = document.getElementById('inlineMpBrickError');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
  }

  function showFallback(on) {
    document.getElementById('inlineCheckoutFallbackWrap')?.classList.toggle('hidden', !on);
  }

  async function refreshMpEmbedConfig(force) {
    if (mpConfigFetched && !force) return;
    try {
      const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      mpConfigFetched = true;
      if (!data.success) return;
      if (typeof data.embed === 'boolean') mpEmbed = data.embed;
      if (data.publicKey) mpPublicKey = data.publicKey;
      if (typeof window.FandezRenderMpCardBrands === 'function') {
        window.FandezRenderMpCardBrands(data);
      }
    } catch (_) { /* noop */ }
  }

  function getBillingPayload() {
    const type = document.querySelector('#inlineCheckout input[name="billingType"]:checked')?.value || 'natural';
    return {
      type,
      rut: document.getElementById('inlineBillRut')?.value?.trim() || '',
      legalName: document.getElementById('inlineBillLegalName')?.value?.trim() || '',
      giro: document.getElementById('inlineBillGiro')?.value?.trim() || '',
      fiscalAddress: document.getElementById('inlineBillFiscalAddress')?.value?.trim() || '',
      invoiceEmail: document.getElementById('inlineBillInvoiceEmail')?.value?.trim() || ''
    };
  }

  function billingReady() {
    const b = getBillingPayload();
    if (!b.rut || !b.legalName || !b.fiscalAddress || !b.invoiceEmail) return false;
    if (b.type === 'empresa' && !b.giro) return false;
    return true;
  }

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  function goMpCheckout() {
    if (!requestId) return;
    setLoading(true);
    fetch('/pagos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        requestId,
        paymentMethod: 'card',
        cardGateway: 'mercadopago',
        billing: getBillingPayload(),
        forceRedirect: true
      })
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else if (data.redirect) window.location.href = data.redirect;
      else throw new Error(data.error || 'No se pudo abrir Mercado Pago');
    }).catch((err) => {
      setError(err.message || 'No se pudo abrir Mercado Pago');
      setLoading(false);
    });
  }

  function revealPayUi() {
    page.classList.add('service-pay-flow');
    page.dataset.payFlow = '1';
    orderSections?.classList.add('hidden');
    document.getElementById('requestForm')?.classList.add('hidden');
    document.getElementById('resumeDraftBanner')?.classList.add('hidden');
    document.querySelectorAll('#urgencyOptions, #alandChatSection').forEach((el) => el?.classList.add('hidden'));
    const sticky = document.getElementById('stickyOrderBar');
    sticky?.classList.remove('is-visible');
    sticky?.classList.add('service-pay-flow-hide');
    sticky?.setAttribute('aria-hidden', 'true');
    inlineRoot.classList.remove('hidden');
    setLoading(true);
    setProgressStep(2);
  }

  async function recalcAndMount() {
    if (!requestId) return;
    setError('');
    showFallback(false);
    setLoading(true);

    await Promise.all([
      refreshMpEmbedConfig(false),
      ensureMpScripts().catch(() => null)
    ]);

    const calcRes = await fetch('/pagos/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requestId, paymentMethod: 'card', cardGateway: 'mercadopago' })
    });
    const calcData = await calcRes.json().catch(() => ({}));
    if (!calcData.success || !calcData.summary) {
      setLoading(false);
      FandezNotify?.show(calcData.error || 'No se pudo calcular el total', 'error');
      return;
    }

    const amount = Math.round(Number(calcData.summary.amountDue) || 0);
    const totalEl = document.getElementById('inlinePayTotal');
    if (totalEl) totalEl.textContent = fmt(amount);
    if (amount <= 0) {
      window.location.href = `/pagos/exito?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    if (!mpEmbed || !mpPublicKey || page.dataset.mpTokenConfigured !== '1' || !window.FandezMpBrick) {
      setLoading(false);
      showFallback(true);
      setError('Abrí el checkout de Mercado Pago para pagar con Visa, Mastercard o Amex.');
      return;
    }

    const billing = getBillingPayload();
    try {
      const result = await window.FandezMpBrick.sync({
        embed: true,
        publicKey: mpPublicKey,
        amount,
        paymentMethod: 'card',
        cardGateway: 'mercadopago',
        containerId: 'inlineMpCardPaymentBrick',
        sectionId: 'inlineMpEmbedSection',
        payerEmail: billing.invoiceEmail,
        onReady: () => {
          setLoading(false);
          setError('');
          showFallback(false);
        },
        onBeforeSubmit: () => {
          if (!billingReady()) {
            inlineRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return 'Completa RUT y datos de facturación para pagar.';
          }
          return null;
        },
        submitPayment: (formData) => fetch('/pagos/mp/tarjeta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            requestId,
            formData,
            paymentMethod: 'card',
            cardGateway: 'mercadopago',
            billing: getBillingPayload()
          })
        }).then(async (r) => {
          const payload = await r.json().catch(() => ({}));
          if (!r.ok || !payload.success) {
            const msg = payload.error || 'No se pudo procesar el pago.';
            if (window.FandezNotify?.showPaymentError) FandezNotify.showPaymentError(payload);
            else FandezNotify?.show(msg, 'error');
            throw new Error(msg);
          }
          if (payload.redirect) window.location.href = payload.redirect;
          return payload;
        })
      });
      mpActive = Boolean(result?.active);
      if (!mpActive) {
        setError('No pudimos cargar el formulario embebido.');
        showFallback(true);
      }
    } catch (err) {
      console.error('[inline-pay]', err);
      setError('Error al cargar el pago.');
      showFallback(true);
    } finally {
      setLoading(false);
    }
  }

  function setProgressStep(n) {
    document.querySelectorAll('.checkout-progress-step').forEach((el, i) => {
      el.classList.toggle('is-active', i + 1 === n);
      el.classList.toggle('is-done', i + 1 < n);
    });
    document.querySelectorAll('.checkout-progress-line').forEach((line, i) => {
      line.classList.toggle('is-done', i + 1 < n);
    });
  }

  async function openInlineCheckout(id) {
    requestId = id;
    revealPayUi();
    inlineRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await recalcAndMount();
  }

  window.FandezServiceInlinePay = { open: openInlineCheckout, remount: recalcAndMount };

  document.querySelectorAll('#inlineCheckout input[name="billingType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isEmpresa = radio.value === 'empresa' && radio.checked;
      document.getElementById('inlineBillGiro')?.classList.toggle('hidden', !isEmpresa);
    });
  });

  document.getElementById('inlineCheckoutFallback')?.addEventListener('click', (e) => {
    e.preventDefault();
    goMpCheckout();
  });

  document.getElementById('btnResumePay')?.addEventListener('click', () => {
    const id = document.getElementById('btnResumePay')?.dataset?.requestId;
    if (id) openInlineCheckout(id);
  });

  if (payFlow) {
    const rid = params.get('resume') || page.dataset.resumeId;
    if (rid) {
      requestId = rid;
      revealPayUi();
      recalcAndMount();
    }
  }
})();

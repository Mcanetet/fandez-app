/**
 * Pago embebido en la misma página del servicio (sin ir a /pagos/checkout).
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
  let mpBrickActive = false;
  let scriptsPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const isMpSdk = src.includes('sdk.mercadopago.com');
      const isBrickHelper = src.includes('checkout-mp-brick');
      if (isMpSdk && window.MercadoPago) return resolve();
      if (isBrickHelper && window.FandezMpBrick) return resolve();

      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        const done = () => {
          if (isMpSdk && !window.MercadoPago) {
            reject(new Error('SDK Mercado Pago no disponible'));
            return;
          }
          resolve();
        };
        // Script ya en DOM: si el global ya existe, listo; si no, esperar load o un poll corto.
        if ((isMpSdk && window.MercadoPago) || (isBrickHelper && window.FandezMpBrick) || existing.dataset.loaded === '1') {
          return done();
        }
        existing.addEventListener('load', () => {
          existing.dataset.loaded = '1';
          done();
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar ' + src)), { once: true });
        let tries = 0;
        const poll = setInterval(() => {
          tries += 1;
          if ((isMpSdk && window.MercadoPago) || (isBrickHelper && window.FandezMpBrick) || tries > 40) {
            clearInterval(poll);
            done();
          }
        }, 50);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  function ensureMpScripts() {
    if (window.MercadoPago && window.FandezMpBrick) {
      return Promise.resolve();
    }
    if (scriptsPromise) return scriptsPromise;
    scriptsPromise = (async () => {
      if (!window.MercadoPago) {
        await loadScript('https://sdk.mercadopago.com/js/v2');
      }
      if (!window.FandezMpBrick) {
        await loadScript('/js/checkout-mp-brick.js?v=20261009-visa8');
      }
    })().catch((err) => {
      scriptsPromise = null;
      throw err;
    });
    return scriptsPromise;
  }

  // Precarga en cuanto hay flujo de pago o embed disponible (no espera al click).
  if (payFlow || (mpEmbed && mpPublicKey)) {
    ensureMpScripts().catch(() => { /* se reintenta al montar */ });
  }

  function setInlineBrickLoading(on) {
    const el = document.getElementById('inlineMpBrickLoading');
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function setInlineBrickError(message) {
    const el = document.getElementById('inlineMpBrickError');
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  async function refreshMpEmbedConfig(force) {
    if (mpConfigFetched && !force) return;
    if (mpEmbed && mpPublicKey && !force) {
      mpConfigFetched = true;
      await ensureMpScripts();
      return;
    }
    try {
      const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      mpConfigFetched = true;
      if (!data.success) return;
      if (typeof data.embed === 'boolean') mpEmbed = data.embed;
      if (data.publicKey) mpPublicKey = data.publicKey;
      window.__fandezMpCardBrands = data.cardBrands || null;
      window.__fandezMpCardMethodIds = Array.isArray(data.cardMethodIds) ? data.cardMethodIds : null;
      if (typeof window.FandezRenderMpCardBrands === 'function') {
        window.FandezRenderMpCardBrands(data);
      }
      if (data.visaDiagnosis && !data.visaDiagnosis.active) {
        console.warn('[inline-pay]', data.visaDiagnosis.diagnosis, data.cardMethodIds || []);
        setInlineBrickError(data.visaDiagnosis.diagnosis || 'Visa no está activa en esta cuenta Mercado Pago.');
      }
      if (mpEmbed && mpPublicKey) await ensureMpScripts();
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

  function goFullCheckout() {
    if (requestId) {
      window.location.href = `/pagos/checkout?ref=${encodeURIComponent(requestId)}`;
    }
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
    setInlineBrickLoading(true);
    setProgressStep(2);
  }

  async function startCheckoutProPay() {
    if (!requestId) return;
    if (!billingReady()) {
      setInlineBrickError('Completa RUT y datos de facturación para pagar.');
      inlineRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setInlineBrickError('');
    setInlineBrickLoading(true);
    const btn = document.getElementById('inlinePayCardBtn');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch('/pagos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          requestId,
          paymentMethod: 'card',
          cardGateway: 'mercadopago',
          billing: getBillingPayload(),
          forceRedirect: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo abrir el pago.');
      }
      if (data.free || data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      goFullCheckout();
    } catch (err) {
      console.error('[inline-pay]', err);
      setInlineBrickError(err.message || 'No se pudo abrir Mercado Pago.');
      FandezNotify?.show(err.message || 'No se pudo abrir el pago', 'error');
    } finally {
      setInlineBrickLoading(false);
      if (btn) btn.disabled = false;
    }
  }

  async function recalcAndMount() {
    if (!requestId) return;
    setInlineBrickError('');
    setInlineBrickLoading(true);

    await refreshMpEmbedConfig(false);

    const calcRes = await fetch('/pagos/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requestId, paymentMethod: 'card', cardGateway: 'mercadopago' })
    });
    const calcData = await calcRes.json().catch(() => ({}));

    if (!calcData.success || !calcData.summary) {
      setInlineBrickLoading(false);
      FandezNotify?.show(calcData.error || 'No se pudo calcular el total', 'error');
      return;
    }

    const amount = calcData.summary.amountDue || 0;
    const totalEl = document.getElementById('inlinePayTotal');
    if (totalEl) totalEl.textContent = fmt(amount);

    if (amount <= 0) {
      window.location.href = `/pagos/exito?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    // Checkout Pro: Visa funciona; el Brick embebido en Chile a menudo no lista Visa.
    mpBrickActive = false;
    setInlineBrickLoading(false);
    document.getElementById('inlineCheckoutFallback')?.classList.add('hidden');
    document.getElementById('inlinePayCardBtn')?.classList.remove('hidden');
  }

  function setProgressStep(n) {
    document.querySelectorAll('.checkout-progress-step').forEach((el, i) => {
      const stepNum = i + 1;
      el.classList.toggle('is-active', stepNum === n);
      el.classList.toggle('is-done', stepNum < n);
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
    goFullCheckout();
  });

  document.getElementById('inlineOpenFullCheckout')?.addEventListener('click', () => goFullCheckout());
  document.getElementById('inlinePayCardBtn')?.addEventListener('click', () => startCheckoutProPay());

  document.getElementById('btnResumePay')?.addEventListener('click', () => {
    const id = document.getElementById('btnResumePay')?.dataset?.requestId;
    if (id) openInlineCheckout(id);
  });

  if (payFlow) {
    const rid = params.get('resume') || page.dataset.resumeId;
    if (rid) {
      // Primera pintura ya es checkout: montar brick sin esperar interacción.
      requestId = rid;
      revealPayUi();
      recalcAndMount();
    }
  }
})();

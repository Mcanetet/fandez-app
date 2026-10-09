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
        await loadScript('/js/checkout-mp-brick.js?v=20261009-visa3');
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
      if (data.cardBrands && data.cardBrands.visa === false) {
        console.warn('[inline-pay] Visa no activa en cuenta MP', data.cardMethodIds || []);
        setInlineBrickError('Visa no está activa en Mercado Pago de esta cuenta. Actívala en MP → Medios de pago, o prueba otra tarjeta.');
      }
      if (mpEmbed && mpPublicKey) await ensureMpScripts();
    } catch (_) { /* noop */ }
  }

  function chileCardIdsFromConfig() {
    // Siempre pedir Visa (crédito/débito/prepago). No filtrar por API:
    // si la cuenta no la tiene, el Brick falla y el aviso de brick-config lo explica.
    return {
      creditCardIds: ['visa', 'master', 'amex'],
      debitCardIds: ['debvisa', 'debmaster'],
      prepaidCardIds: ['visa', 'master']
    };
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

  async function recalcAndMount() {
    if (!requestId) return;
    setInlineBrickError('');
    setInlineBrickLoading(true);

    const billing = getBillingPayload();
    const scriptsReady = ensureMpScripts().catch(() => null);

    const calcPromise = fetch('/pagos/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requestId, paymentMethod: 'card', cardGateway: 'mercadopago' })
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      return { res, data };
    });

    const initPromise = fetch('/pagos/mp/brick-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        requestId,
        paymentMethod: 'card',
        billing
      })
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }).catch(() => ({ res: null, data: {} }));

    const configPromise = refreshMpEmbedConfig(false);

    const [{ res: calcRes, data: calcData }, initResult] = await Promise.all([
      calcPromise,
      initPromise,
      configPromise,
      scriptsReady
    ]);

    if (!calcData.success || !calcData.summary) {
      setInlineBrickLoading(false);
      FandezNotify?.show(calcData.error || 'No se pudo calcular el total', 'error');
      return;
    }

    let amount = calcData.summary.amountDue || 0;
    const totalEl = document.getElementById('inlinePayTotal');
    if (totalEl) totalEl.textContent = fmt(amount);

    if (amount <= 0) {
      window.location.href = `/pagos/exito?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    const initData = initResult?.data || {};
    if (initResult?.res?.ok && initData.success) {
      if (initData.publicKey) mpPublicKey = initData.publicKey;
      amount = Math.round(Number(initData.amount) || amount);
      if (totalEl) totalEl.textContent = fmt(amount);
    }

    if (!mpEmbed || !mpPublicKey || page.dataset.mpTokenConfigured !== '1') {
      goFullCheckout();
      return;
    }

    await ensureMpScripts().catch(() => null);
    if (!window.FandezMpBrick) {
      goFullCheckout();
      return;
    }

    try {
      const chileIds = chileCardIdsFromConfig();
      const brickCtx = {
        embed: true,
        publicKey: mpPublicKey,
        amount: Math.round(Number(amount) || 0),
        // Card Payment Brick + /v1/payments: no atar a preferenceId (puede filtrar medios).
        preferenceId: '',
        maxInstallments: parseInt(page.dataset.maxInstallments, 10) || 3,
        paymentMethod: 'card',
        cardGateway: 'mercadopago',
        ...chileIds,
        containerId: 'inlineMpCardPaymentBrick',
        sectionId: 'inlineMpEmbedSection',
        payerEmail: billing.invoiceEmail,
        onReady: () => setInlineBrickLoading(false),
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
            if (window.FandezNotify?.showPaymentError) {
              FandezNotify.showPaymentError(payload);
            } else {
              FandezNotify?.show(msg, 'error');
            }
            throw new Error(msg);
          }
          if (payload.redirect) window.location.href = payload.redirect;
          return payload;
        })
      };
      const result = await window.FandezMpBrick.sync(brickCtx);
      mpBrickActive = Boolean(result?.active);
      const openFullBtn = document.getElementById('inlineOpenFullCheckout');
      if (!mpBrickActive) {
        setInlineBrickError('No pudimos cargar el formulario aquí. Redirigiendo al checkout…');
        openFullBtn?.classList.remove('hidden');
        setTimeout(() => goFullCheckout(), 800);
      } else {
        openFullBtn?.classList.add('hidden');
      }
    } catch (err) {
      console.error('[inline-pay]', err);
      setInlineBrickError('Error al cargar el pago. Toca el enlace de checkout completo.');
    } finally {
      setInlineBrickLoading(false);
    }
    document.getElementById('inlineCheckoutFallback')?.classList.toggle('hidden', mpBrickActive);
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

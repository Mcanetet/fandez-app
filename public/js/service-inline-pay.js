/**
 * Pago embebido en la misma página del servicio (sin ir a /pagos/checkout).
 */
(function () {
  const page = document.getElementById('servicePage');
  if (!page) return;

  const params = new URLSearchParams(window.location.search);
  const payFlow = params.get('pay') === '1';
  if (page.dataset.tracking && !payFlow) return;

  const orderSections = document.getElementById('serviceOrderSections');
  const inlineRoot = document.getElementById('inlineCheckout');
  if (!inlineRoot) return;

  let requestId = null;
  let mpConfigFetched = false;
  let mpEmbed = page.dataset.mpEmbed === '1';
  let mpPublicKey = page.dataset.mpPublicKey || '';
  let mpBrickActive = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.body.appendChild(s);
    });
  }

  function setInlineBrickLoading(on) {
    document.getElementById('inlineMpBrickLoading')?.classList.toggle('hidden', !on);
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
    try {
      const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      mpConfigFetched = true;
      if (!data.success) return;
      if (typeof data.embed === 'boolean') mpEmbed = data.embed;
      if (data.publicKey) mpPublicKey = data.publicKey;
      if (mpEmbed && mpPublicKey) {
        if (!window.MercadoPago) await loadScript('https://sdk.mercadopago.com/js/v2');
        if (!window.FandezMpBrick) await loadScript('/js/checkout-mp-brick.js');
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

  function goFullCheckout() {
    if (requestId) {
      window.location.href = `/pagos/checkout?ref=${encodeURIComponent(requestId)}`;
    }
  }

  async function recalcAndMount() {
    if (!requestId) return;
    setInlineBrickError('');
    const res = await fetch('/pagos/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requestId, paymentMethod: 'card', cardGateway: 'mercadopago' })
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.summary) {
      FandezNotify?.show(data.error || 'No se pudo calcular el total', 'error');
      return;
    }
    const amount = data.summary.amountDue || 0;
    const totalEl = document.getElementById('inlinePayTotal');
    if (totalEl) totalEl.textContent = fmt(amount);

    if (amount <= 0) {
      window.location.href = `/pagos/exito?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    await refreshMpEmbedConfig(true);

    if (!mpEmbed || !mpPublicKey || page.dataset.mpTokenConfigured !== '1') {
      goFullCheckout();
      return;
    }

    if (!window.FandezMpBrick) {
      goFullCheckout();
      return;
    }

    setInlineBrickLoading(true);
    try {
      let preferenceId = '';
      let brickAmount = Math.round(Number(amount) || 0);
      try {
        const initRes = await fetch('/pagos/mp/brick-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            requestId,
            paymentMethod: 'card',
            billing: getBillingPayload()
          })
        });
        const initData = await initRes.json().catch(() => ({}));
        if (initRes.ok && initData.success) {
          if (initData.publicKey) mpPublicKey = initData.publicKey;
          preferenceId = initData.preferenceId || '';
          brickAmount = Math.round(Number(initData.amount) || brickAmount);
        }
      } catch (_) { /* noop */ }

      const brickCtx = {
        embed: true,
        publicKey: mpPublicKey,
        amount: brickAmount,
        preferenceId,
        maxInstallments: parseInt(page.dataset.maxInstallments, 10) || 3,
        paymentMethod: 'card',
        cardGateway: 'mercadopago',
        containerId: 'inlineMpCardPaymentBrick',
        sectionId: 'inlineMpEmbedSection',
        payerEmail: getBillingPayload().invoiceEmail,
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
    orderSections?.classList.add('hidden');
    document.getElementById('requestForm')?.classList.add('hidden');
    document.getElementById('resumeDraftBanner')?.classList.add('hidden');
    document.querySelectorAll('#urgencyOptions, #alandChatSection').forEach((el) => el?.classList.add('hidden'));
    const sticky = document.getElementById('stickyOrderBar');
    sticky?.classList.remove('is-visible');
    sticky?.setAttribute('aria-hidden', 'true');
    inlineRoot.classList.remove('hidden');
    setProgressStep(2);
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
      openInlineCheckout(rid);
    }
  }
})();

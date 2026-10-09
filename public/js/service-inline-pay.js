/**
 * Pago embebido en la misma página del servicio (sin ir a /pagos/checkout).
 */
(function () {
  const page = document.getElementById('servicePage');
  if (!page || page.dataset.tracking) return;

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

  async function refreshMpEmbedConfig() {
    if (mpConfigFetched) return;
    try {
      const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      mpConfigFetched = true;
      if (data.success && data.embed && data.publicKey) {
        mpEmbed = true;
        mpPublicKey = data.publicKey;
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

  async function recalcAndMount() {
    if (!requestId) return;
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

    if (!mpEmbed || page.dataset.mpTokenConfigured !== '1') {
      window.location.href = `/pagos/checkout?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    await refreshMpEmbedConfig();
    if (!window.FandezMpBrick) {
      window.location.href = `/pagos/checkout?ref=${encodeURIComponent(requestId)}`;
      return;
    }

    const result = await window.FandezMpBrick.sync({
      embed: mpEmbed,
      publicKey: mpPublicKey,
      amount,
      maxInstallments: parseInt(page.dataset.maxInstallments, 10) || 3,
      paymentMethod: 'card',
      cardGateway: 'mercadopago',
      payerEmail: getBillingPayload().invoiceEmail,
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
    });
    mpBrickActive = Boolean(result.active);
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
    document.getElementById('stickyOrderBar')?.classList.remove('is-visible');
    inlineRoot.classList.remove('hidden');
    setProgressStep(2);
    inlineRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await recalcAndMount();
  }

  window.FandezServiceInlinePay = { open: openInlineCheckout };

  document.querySelectorAll('#inlineCheckout input[name="billingType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isEmpresa = radio.value === 'empresa' && radio.checked;
      document.getElementById('inlineBillGiro')?.classList.toggle('hidden', !isEmpresa);
    });
  });

  document.getElementById('inlineCheckoutFallback')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (requestId) window.location.href = `/pagos/checkout?ref=${encodeURIComponent(requestId)}`;
  });

  document.getElementById('btnResumePay')?.addEventListener('click', () => {
    const id = document.getElementById('btnResumePay')?.dataset?.requestId;
    if (id) openInlineCheckout(id);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('pay') === '1') {
    const rid = params.get('resume') || page.dataset.resumeId;
    if (rid) {
      openInlineCheckout(rid);
    }
  }
})();

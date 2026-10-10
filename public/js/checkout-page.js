/**
 * Checkout /pagos/checkout — Payment Brick + fallback Checkout Pro.
 */
(function () {
  const page = document.getElementById('checkoutPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  let mpEmbed = page.dataset.mpEmbed === '1';
  let mpPublicKey = page.dataset.mpPublicKey || '';
  const mpGwOnlyActive = page.dataset.mpGwOnly === '1';
  const defaultCardGateway = page.dataset.defaultCardGateway || 'mercadopago';
  let lastAmountDue = parseFloat(page.dataset.initialAmount) || 0;
  let mpBrickActive = false;
  let payerEmailFallback = '';

  const useCredits = document.getElementById('useCredits');
  const usePoints = document.getElementById('usePoints');
  const promoCode = document.getElementById('promoCode');
  const btnPay = document.getElementById('btnPay');
  const billGiro = document.getElementById('billGiro');
  const billingFields = document.getElementById('billingFields');
  const btnEditBilling = document.getElementById('btnEditBilling');
  const billingUseProfileHint = document.getElementById('billingUseProfileHint');

  const fmt = (n) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0
  }).format(n);

  function toast(messageOrOpts, type) {
    if (window.FandezNotify) {
      if (typeof messageOrOpts === 'object') FandezNotify.show(messageOrOpts);
      else FandezNotify.show(messageOrOpts, type || 'info');
      return;
    }
    const text = typeof messageOrOpts === 'object'
      ? (messageOrOpts.title || messageOrOpts.body || 'Aviso')
      : String(messageOrOpts || '');
    if (text) window.alert(text);
  }

  function selectedPaymentMethod() {
    return document.querySelector('input[name="paymentMethod"]:checked')?.value
      || document.getElementById('hiddenPaymentMethodCard')?.value
      || 'card';
  }

  function selectedCardGateway() {
    return document.querySelector('input[name="cardGateway"]:checked')?.value
      || document.getElementById('defaultCardGatewayInput')?.value
      || defaultCardGateway
      || 'mercadopago';
  }

  function isMercadoPagoGateway() {
    const gw = selectedCardGateway();
    return gw === 'mercadopago' || mpGwOnlyActive || defaultCardGateway === 'mercadopago';
  }

  function isCardMercadoPagoEmbedFlow() {
    return selectedPaymentMethod() === 'card' && mpEmbed && isMercadoPagoGateway();
  }

  function getBillingPayload() {
    const type = document.querySelector('input[name="billingType"]:checked')?.value || 'natural';
    return {
      type,
      rut: document.getElementById('billRut')?.value?.trim() || '',
      legalName: document.getElementById('billLegalName')?.value?.trim() || '',
      giro: document.getElementById('billGiro')?.value?.trim() || '',
      fiscalAddress: document.getElementById('billFiscalAddress')?.value?.trim() || '',
      invoiceEmail: document.getElementById('billInvoiceEmail')?.value?.trim() || ''
    };
  }

  function billingReady() {
    const b = getBillingPayload();
    if (!b.rut || !b.legalName || !b.fiscalAddress || !b.invoiceEmail) return false;
    if (b.type === 'empresa' && !b.giro) return false;
    return true;
  }

  function setMpBrickLoading(on) {
    document.getElementById('mpBrickLoading')?.classList.toggle('hidden', !on);
  }

  function revealMpEmbedSection() {
    document.getElementById('mpEmbedSection')?.classList.remove('hidden');
  }

  function setClassicPayVisible(visible) {
    btnPay?.classList.toggle('hidden', !visible);
    const stickyBtn = document.getElementById('btnPaySticky');
    const stickyBar = document.getElementById('stickyCheckoutBar');
    stickyBtn?.classList.toggle('hidden', !visible);
    if (stickyBar) {
      if (mpBrickActive) stickyBar.classList.remove('is-visible');
      else stickyBar.classList.toggle('is-visible', visible);
    }
  }

  function updatePayLabel(total) {
    const label = document.getElementById('btnPayLabel');
    if (!label) return;
    const method = selectedPaymentMethod();
    const amount = total ?? 0;
    if (amount === 0) label.textContent = 'Confirmar servicio gratis';
    else if (method === 'transfer') label.textContent = `Ver datos transferencia · ${fmt(amount)}`;
    else if (mpEmbed) label.textContent = `Ver formulario de tarjeta · ${fmt(amount)}`;
    else label.textContent = `Pagar con tarjeta · ${fmt(amount)}`;
  }

  async function ensureMpPay() {
    if (window.FandezMpPay) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="mp-pay.js"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        if (window.FandezMpPay) resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = '/js/mp-pay.js?v=20261010-mp1';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function syncMpBrick(amountDue, { reveal = false } = {}) {
    if (!isCardMercadoPagoEmbedFlow()) {
      mpBrickActive = false;
      setMpBrickLoading(false);
      return;
    }

    try {
      await ensureMpPay();
    } catch (err) {
      console.error('[checkout] mp-pay', err);
      mpBrickActive = false;
      setMpBrickLoading(false);
      setClassicPayVisible(true);
      return;
    }

    const amount = Math.round(Number(amountDue) || 0);
    lastAmountDue = amount;
    if (reveal) revealMpEmbedSection();
    setMpBrickLoading(true);

    // Prepara billing/descuentos en servidor (sin Preference — el Brick no la usa).
    try {
      await fetch('/pagos/mp/brick-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          requestId,
          useCredits: useCredits?.checked,
          usePoints: usePoints?.checked,
          promoCode: promoCode?.value.trim() || '',
          paymentMethod: 'card',
          billing: getBillingPayload()
        })
      });
    } catch (_) { /* noop */ }

    const payerEmail = document.getElementById('billInvoiceEmail')?.value?.trim()
      || payerEmailFallback
      || '';

    const result = await window.FandezMpPay.mountBrick({
      publicKey: mpPublicKey,
      amount,
      containerId: 'mpCardPaymentBrick',
      sectionId: 'mpEmbedSection',
      payerEmail,
      billing: getBillingPayload,
      requestId,
      useCredits: useCredits?.checked,
      usePoints: usePoints?.checked,
      promoCode: promoCode?.value.trim() || '',
      onReady: () => setMpBrickLoading(false),
      onBeforeSubmit: () => {
        if (!billingReady()) {
          document.getElementById('billingSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          billingFields?.classList.remove('hidden');
          return 'Completa los datos de facturación antes de pagar.';
        }
        return null;
      }
    });

    if (result.publicKey) mpPublicKey = result.publicKey;
    mpBrickActive = Boolean(result.active);
    setMpBrickLoading(false);

    if (mpBrickActive) {
      revealMpEmbedSection();
      setClassicPayVisible(false);
      document.getElementById('stickyCheckoutBar')?.classList.remove('is-visible');
    } else {
      setClassicPayVisible(true);
    }
  }

  async function startCardCheckout() {
    if (!isCardMercadoPagoEmbedFlow()) return false;
    revealMpEmbedSection();
    if (mpBrickActive) {
      document.getElementById('mpEmbedSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    setMpBrickLoading(true);
    try {
      await syncMpBrick(lastAmountDue, { reveal: true });
      if (mpBrickActive) {
        document.getElementById('mpEmbedSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      if (!mpPublicKey) {
        toast({
          type: 'warning',
          title: 'Falta la Public Key de prueba',
          body: 'Define MP_TEST_PUBLIC_KEY en Hostinger y reinicia.',
          kicker: 'Pago'
        });
        return false;
      }
      toast({ type: 'info', title: 'Abriendo Mercado Pago…', kicker: 'Pago' });
      await ensureMpPay();
      await window.FandezMpPay.openCheckoutPro({
        requestId,
        useCredits: useCredits?.checked,
        usePoints: usePoints?.checked,
        promoCode: promoCode?.value.trim() || '',
        billing: getBillingPayload()
      });
      return true;
    } finally {
      setMpBrickLoading(false);
    }
  }

  async function recalc() {
    const code = promoCode?.value.trim() || '';
    let res;
    try {
      res = await fetch('/pagos/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          useCredits: useCredits?.checked,
          usePoints: usePoints?.checked,
          promoCode: code,
          paymentMethod: selectedPaymentMethod(),
          cardGateway: selectedCardGateway()
        })
      });
    } catch (_) {
      toast('No se pudo calcular el total. Reintenta.', 'warning');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      toast(data.error || 'Error al calcular', 'warning');
      return;
    }
    const s = data.summary;
    lastAmountDue = Number(s.amountDue) || lastAmountDue;
    document.getElementById('lineTotal') && (document.getElementById('lineTotal').textContent = fmt(s.amountDue));
    document.getElementById('lineTotalHero') && (document.getElementById('lineTotalHero').textContent = fmt(s.amountDue));
    document.getElementById('stickyCheckoutTotal') && (document.getElementById('stickyCheckoutTotal').textContent = fmt(s.amountDue));
    updatePayLabel(s.amountDue);
    if (mpEmbed) await syncMpBrick(s.amountDue);
  }

  async function onPayClick() {
    if (isCardMercadoPagoEmbedFlow()) {
      btnPay?.classList.add('is-busy');
      if (btnPay) btnPay.disabled = true;
      try {
        await startCardCheckout();
      } finally {
        btnPay?.classList.remove('is-busy');
        if (btnPay) btnPay.disabled = false;
      }
      return;
    }

    if (selectedPaymentMethod() === 'card' && !billingReady()) {
      document.getElementById('billingSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      billingFields?.classList.remove('hidden');
      toast('Completa los datos de facturación antes de pagar.', 'warning');
      return;
    }

    btnPay?.classList.add('is-busy');
    if (btnPay) btnPay.disabled = true;
    document.getElementById('btnPaySticky')?.setAttribute('disabled', 'disabled');
    try {
      const res = await fetch('/pagos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          requestId,
          useCredits: useCredits?.checked,
          usePoints: usePoints?.checked,
          promoCode: promoCode?.value.trim() || '',
          paymentMethod: selectedPaymentMethod(),
          cardGateway: selectedCardGateway(),
          billing: getBillingPayload()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (data.embedded) await startCardCheckout();
        else toast(data.error || 'No se pudo crear el pago.', 'error');
        return;
      }
      if (data.free || data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (err) {
      toast(err.message || 'Error de red', 'error');
    } finally {
      btnPay?.classList.remove('is-busy');
      if (btnPay) btnPay.disabled = false;
      document.getElementById('btnPaySticky')?.removeAttribute('disabled');
    }
  }

  btnEditBilling?.addEventListener('click', () => {
    billingFields?.classList.remove('hidden');
    billingUseProfileHint?.classList.add('hidden');
    btnEditBilling.classList.add('hidden');
    document.getElementById('billRut')?.focus();
  });

  document.querySelectorAll('input[name="billingType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isEmpresa = radio.value === 'empresa' && radio.checked;
      document.querySelectorAll('.billing-type-option').forEach((el) => {
        const active = el.querySelector('input').value === (isEmpresa ? 'empresa' : 'natural');
        el.classList.toggle('border-zilo-accent', active);
        el.classList.toggle('bg-zilo-accent/5', active);
        el.classList.toggle('border-zilo-border', !active);
      });
      billGiro?.classList.toggle('hidden', !isEmpresa);
    });
  });

  document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.payment-option').forEach((el) => {
        const active = el.dataset.method === selectedPaymentMethod();
        el.classList.toggle('border-zilo-accent', active);
        el.classList.toggle('bg-zilo-accent/5', active);
        el.classList.toggle('border-zilo-border', !active);
      });
      document.getElementById('cardGatewayPicker')?.classList.toggle('hidden', selectedPaymentMethod() !== 'card');
      recalc();
      updatePayLabel();
    });
  });

  document.querySelectorAll('input[name="cardGateway"]').forEach((radio) => {
    radio.addEventListener('change', () => recalc());
  });

  btnPay?.addEventListener('click', onPayClick);
  document.getElementById('btnPaySticky')?.addEventListener('click', onPayClick);
  [useCredits, usePoints].forEach((el) => el?.addEventListener('change', recalc));
  document.getElementById('btnApplyPromo')?.addEventListener('click', recalc);

  (async function initCheckout() {
    try {
      if (mpEmbed) {
        revealMpEmbedSection();
        await ensureMpPay();
        const cfg = await window.FandezMpPay.fetchConfig().catch(() => ({}));
        if (cfg?.publicKey) mpPublicKey = cfg.publicKey;
        if (typeof cfg?.embed === 'boolean') mpEmbed = cfg.embed;
        if (cfg?.payerEmailFallback) payerEmailFallback = cfg.payerEmailFallback;
      }
      await recalc();
      if (mpEmbed && billingReady() && !mpBrickActive && lastAmountDue > 0) {
        await syncMpBrick(lastAmountDue, { reveal: true });
      }
    } catch (err) {
      console.error('[checkout init]', err);
    }
  })();

  if (window.FandezMobile?.isInAppBrowser?.()) {
    document.getElementById('checkoutInAppWarn')?.classList.remove('hidden');
  }
})();

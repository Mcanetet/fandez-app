/**
 * Checkout cliente — carga después de notify.js (footer).
 */
(function () {
  const page = document.getElementById('checkoutPage');
  if (!page) return;

  const requestId = page.dataset.requestId;
  let mpEmbed = page.dataset.mpEmbed === '1';
  let mpPublicKey = page.dataset.mpPublicKey || '';
  const mpTokenConfigured = page.dataset.mpTokenConfigured === '1';
  const mpGwOnlyActive = page.dataset.mpGwOnly === '1';
  const mpCanShowBrick = page.dataset.mpCanBrick === '1' || Boolean(mpPublicKey);
  const defaultCardGateway = page.dataset.defaultCardGateway || 'mercadopago';
  const maxInstallments = parseInt(page.dataset.maxInstallments, 10) || 3;
  let lastAmountDue = parseFloat(page.dataset.initialAmount) || 0;
  let mpBrickActive = false;
  let mpConfigFetched = false;

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

  function revealMpEmbedSection() {
    document.getElementById('mpEmbedSection')?.classList.remove('hidden');
  }

  function setMpBrickLoading(on) {
    document.getElementById('mpBrickLoading')?.classList.toggle('hidden', !on);
  }

  async function refreshMpEmbedConfig(force) {
    if (mpConfigFetched && !force) return;
    try {
      const res = await fetch('/pagos/mp/brick-config', { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      mpConfigFetched = true;
      if (data.success) {
        if (data.publicKey) mpPublicKey = data.publicKey;
        if (typeof data.embed === 'boolean') mpEmbed = data.embed;
        if (mpEmbed) {
          if (!window.MercadoPago) await loadScript('https://sdk.mercadopago.com/js/v2');
          if (!window.FandezMpBrick) await loadScript('/js/checkout-mp-brick.js');
          document.getElementById('mpEmbedSetupWarn')?.classList.add('hidden');
        }
      }
    } catch (_) { /* noop */ }
  }

  const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const useCredits = document.getElementById('useCredits');
  const usePoints = document.getElementById('usePoints');
  const promoCode = document.getElementById('promoCode');
  const promoFeedback = document.getElementById('promoFeedback');
  const btnPay = document.getElementById('btnPay');
  const billGiro = document.getElementById('billGiro');
  const billingFields = document.getElementById('billingFields');
  const btnEditBilling = document.getElementById('btnEditBilling');
  const billingUseProfileHint = document.getElementById('billingUseProfileHint');

  btnEditBilling?.addEventListener('click', () => {
    billingFields?.classList.remove('hidden');
    billingUseProfileHint?.classList.add('hidden');
    btnEditBilling.classList.add('hidden');
    document.getElementById('billRut')?.focus();
  });

  function selectedPaymentMethod() {
    return document.querySelector('input[name="paymentMethod"]:checked')?.value
      || document.getElementById('hiddenPaymentMethodCard')?.value
      || 'card';
  }

  function selectedCardGateway() {
    const picked = document.querySelector('input[name="cardGateway"]:checked')?.value
      || document.getElementById('defaultCardGatewayInput')?.value;
    return picked || defaultCardGateway || 'mercadopago';
  }

  function isMercadoPagoGateway() {
    const gw = selectedCardGateway();
    return gw === 'mercadopago' || mpGwOnlyActive || defaultCardGateway === 'mercadopago';
  }

  function isCardMercadoPagoEmbedFlow() {
    if (selectedPaymentMethod() !== 'card') return false;
    if (!mpEmbed) return false;
    return isMercadoPagoGateway();
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

  function billingReady() {
    const b = getBillingPayload();
    if (!b.rut || !b.legalName || !b.fiscalAddress || !b.invoiceEmail) return false;
    if (b.type === 'empresa' && !b.giro) return false;
    return true;
  }

  async function syncMpBrick(amountDue, { reveal = false } = {}) {
    if (!isCardMercadoPagoEmbedFlow()) {
      mpBrickActive = false;
      setMpBrickLoading(false);
      return;
    }
    await refreshMpEmbedConfig(reveal);
    if (!mpPublicKey) mpPublicKey = page.dataset.mpPublicKey || '';
    if (!mpEmbed && mpPublicKey) mpEmbed = true;
    if (!mpEmbed || !window.FandezMpBrick || !mpPublicKey) {
      mpBrickActive = false;
      setMpBrickLoading(false);
      setClassicPayVisible(true);
      return;
    }
    if (reveal) revealMpEmbedSection();
    setMpBrickLoading(true);
    lastAmountDue = amountDue;
    const result = await window.FandezMpBrick.sync({
      embed: true,
      publicKey: mpPublicKey,
      amount: amountDue,
      maxInstallments,
      paymentMethod: 'card',
      cardGateway: 'mercadopago',
      payerEmail: document.getElementById('billInvoiceEmail')?.value?.trim() || '',
      onBeforeSubmit: () => {
        if (!billingReady()) {
          document.getElementById('billingSection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          billingFields?.classList.remove('hidden');
          return 'Completa los datos de facturación antes de pagar.';
        }
        return null;
      },
      submitPayment: (formData) => {
        const code = promoCode?.value.trim() || '';
        return fetch('/pagos/mp/tarjeta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            requestId,
            formData,
            useCredits: useCredits?.checked,
            usePoints: usePoints?.checked,
            promoCode: code,
            paymentMethod: 'card',
            cardGateway: 'mercadopago',
            billing: getBillingPayload()
          })
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            if (window.FandezNotify?.showPaymentError) FandezNotify.showPaymentError(data);
            else toast(data.error || 'No se pudo procesar el pago.', 'error');
            throw new Error(data.error || 'pago');
          }
          if (data.redirect) window.location.href = data.redirect;
          return data;
        });
      }
    });
    mpBrickActive = Boolean(result?.active);
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
      toast({
        type: 'warning',
        title: 'No pudimos abrir el formulario de tarjeta.',
        body: 'Verifica MP_TEST_PUBLIC_KEY y MP_TEST_ACCESS_TOKEN en Hostinger, reinicia la app y recarga.',
        kicker: 'Pago'
      });
      document.getElementById('mpEmbedSetupWarn')?.classList.remove('hidden');
      return true;
    } finally {
      setMpBrickLoading(false);
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
    else label.textContent = `Pagar con Mercado Pago · ${fmt(amount)}`;
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
      btnPay && (btnPay.disabled = true);
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

  btnPay?.addEventListener('click', onPayClick);
  document.getElementById('btnPaySticky')?.addEventListener('click', onPayClick);

  [useCredits, usePoints].forEach((el) => el?.addEventListener('change', recalc));
  document.getElementById('btnApplyPromo')?.addEventListener('click', recalc);

  (async function initCheckout() {
    try {
      if (mpEmbed) {
        revealMpEmbedSection();
        await refreshMpEmbedConfig(false);
      }
      await recalc();
      if (mpEmbed && !mpBrickActive && lastAmountDue > 0) {
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

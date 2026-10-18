/**
 * Pago inline en ficha de servicio — Payment Brick + Checkout API / Checkout Pro.
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
  let mpEmbed = page.dataset.mpEmbed === '1';
  let mpPublicKey = page.dataset.mpPublicKey || '';

  const fmt = (n) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0
  }).format(n);

  function setLoading(on) {
    const el = document.getElementById('inlineMpBrickLoading');
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function setError(msg) {
    const el = document.getElementById('inlineMpBrickError');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function showFallback(on) {
    document.getElementById('inlineCheckoutFallbackWrap')?.classList.toggle('hidden', !on);
  }

  function getBilling() {
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
    const b = getBilling();
    if (!b.rut || !b.legalName || !b.fiscalAddress || !b.invoiceEmail) return false;
    if (b.type === 'empresa' && !b.giro) return false;
    return true;
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

  async function ensureMpPay() {
    if (window.FandezMpPay) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/js/mp-pay.js?v=20261018-mp2';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function explainConfig(cfg) {
    if (!cfg || !cfg.success) return 'No se pudo leer la config de Mercado Pago.';
    if (cfg.redirectOnly) return 'El servidor está en modo redirección (MP_CHECKOUT_REDIRECT). Usa el botón de abajo.';
    if (cfg.credentialMismatch) {
      return 'Public Key y Access Token no son del mismo tipo (prueba vs producción). Revisa Hostinger.';
    }
    if (!cfg.publicKey && cfg.accessTokenConfigured) {
      return 'Falta MP_PUBLIC_KEY de producción en Hostinger. Sin ella no se muestra el formulario embebido.';
    }
    if (!cfg.publicKey && !cfg.accessTokenConfigured) {
      return 'Faltan MP_PUBLIC_KEY y MP_ACCESS_TOKEN en el servidor. Revisa Seguridad en Admin.';
    }
    if (!cfg.embed) {
      return 'Checkout embebido no disponible. Puedes pagar con el botón de Mercado Pago.';
    }
    return 'No pudimos cargar el formulario. Usa el botón de abajo.';
  }

  async function recalcAndMount() {
    if (!requestId) return;
    setError('');
    showFallback(false);
    setLoading(true);

    try {
      await ensureMpPay();
      if (window.FandezMpPay) await window.FandezMpPay.ensureScripts().catch(() => null);

      const calcRes = await fetch('/pagos/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ requestId, paymentMethod: 'card', cardGateway: 'mercadopago' })
      });
      const calcData = await calcRes.json().catch(() => ({}));
      if (!calcData.success || !calcData.summary) {
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

      // Siempre consultar config fresca (no confiar solo en data-* del HTML).
      const cfg = await window.FandezMpPay.fetchConfig().catch(() => ({}));
      if (cfg?.publicKey) {
        mpPublicKey = cfg.publicKey;
        page.dataset.mpPublicKey = cfg.publicKey;
      }
      if (typeof cfg?.embed === 'boolean') {
        mpEmbed = cfg.embed;
        page.dataset.mpEmbed = cfg.embed ? '1' : '0';
      }
      if (cfg?.accessTokenConfigured) {
        page.dataset.mpTokenConfigured = '1';
      }

      const canTryBrick = Boolean(cfg?.embed && (cfg.publicKey || mpPublicKey));
      if (canTryBrick) {
        const result = await window.FandezMpPay.mountBrick({
          publicKey: mpPublicKey || cfg.publicKey,
          amount,
          containerId: 'inlineMpCardPaymentBrick',
          sectionId: 'inlineMpEmbedSection',
          payerEmail: getBilling().invoiceEmail,
          billing: getBilling,
          requestId,
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
          }
        });

        if (result.publicKey) mpPublicKey = result.publicKey;
        if (result.active) return;

        if (result.reason === 'amount_too_low') {
          setError('El monto es demasiado bajo para tarjeta. Revisa el total del servicio.');
          showFallback(false);
          return;
        }
      }

      // Brick no disponible → Checkout Pro (redirect a Mercado Pago).
      setError(explainConfig(cfg));
      showFallback(true);

      // Si hay token pero no Brick, abrir Checkout Pro automáticamente una vez.
      if (cfg?.accessTokenConfigured && !cfg?.embed) {
        const autoKey = `mp-auto-pro-${requestId}`;
        if (!sessionStorage.getItem(autoKey)) {
          sessionStorage.setItem(autoKey, '1');
          await window.FandezMpPay.openCheckoutPro({ requestId, billing: getBilling() });
          return;
        }
      }
    } catch (err) {
      console.error('[inline-pay]', err);
      setError(err.message || 'Error al cargar el pago.');
      showFallback(true);
    } finally {
      setLoading(false);
    }
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

  document.getElementById('inlineCheckoutFallback')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!requestId) return;
    setLoading(true);
    try {
      await ensureMpPay();
      await window.FandezMpPay.openCheckoutPro({ requestId, billing: getBilling() });
    } catch (err) {
      setError(err.message || 'No se pudo abrir Mercado Pago');
      setLoading(false);
    }
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
  } else if (mpEmbed && mpPublicKey) {
    ensureMpPay().then(() => window.FandezMpPay?.ensureScripts()).catch(() => {});
  }
})();

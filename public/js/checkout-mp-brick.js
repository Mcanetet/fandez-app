/**
 * Payment Brick (Mercado Pago) — única UI embebida Fandez.
 * Métodos: crédito + débito + prepago (Visa Chile). 1 cuota.
 * Sin preferenceId (evita filtrar marcas). Cobro vía POST /pagos/mp/tarjeta.
 */
(function () {
  const slots = {};
  const mounting = {};

  const VISUAL = {
    theme: 'default',
    customVariables: {
      baseColor: '#C45C14',
      baseColorFirstVariant: '#A84E10',
      baseColorSecondVariant: '#D97318',
      buttonTextColor: '#FFFFFF',
      outlinePrimaryColor: 'rgba(196, 92, 20, 0.4)',
      outlineSecondaryColor: 'rgba(196, 92, 20, 0.12)',
      textPrimaryColor: '#1A1814',
      textSecondaryColor: '#6B7280',
      inputBackgroundColor: '#FFFFFF',
      formBackgroundColor: 'transparent',
      errorColor: '#B83A2E',
      successColor: '#2F6B4F',
      borderRadiusSmall: '10px',
      borderRadiusMedium: '14px',
      borderRadiusLarge: '16px',
      inputFocusedBoxShadow: '0 0 0 3px rgba(196, 92, 20, 0.16)',
      fontWeightSemiBold: '600'
    }
  };

  function ids(ctx) {
    return {
      containerId: ctx.containerId || 'mpCardPaymentBrick',
      sectionId: ctx.sectionId || 'mpEmbedSection'
    };
  }

  function canUse(ctx) {
    if (!ctx.embed || !ctx.publicKey) return false;
    if (ctx.paymentMethod !== 'card') return false;
    if (String(ctx.cardGateway || '').toLowerCase() !== 'mercadopago') return false;
    return Math.round(Number(ctx.amount) || 0) >= 1;
  }

  function visible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  async function waitVisible(el, frames = 40) {
    for (let i = 0; i < frames; i += 1) {
      if (visible(el)) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return visible(el);
  }

  async function unmountSlot(containerId) {
    const slot = slots[containerId];
    if (slot?.controller?.unmount) {
      try { await slot.controller.unmount(); } catch (_) { /* noop */ }
    }
    delete slots[containerId];
    mounting[containerId] = null;
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
  }

  function mountedOk(containerId, amount) {
    const slot = slots[containerId];
    const el = document.getElementById(containerId);
    return Boolean(slot?.controller && el?.children?.length && slot.amount === amount);
  }

  function unwrap(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (payload.formData && typeof payload.formData === 'object') {
      return {
        ...payload.formData,
        selectedPaymentMethod: payload.selectedPaymentMethod,
        paymentType: payload.selectedPaymentMethod || payload.formData.paymentType,
        payment_type_id: payload.selectedPaymentMethod || payload.formData.payment_type_id
      };
    }
    return payload;
  }

  async function mount(ctx) {
    if (!window.MercadoPago) return false;
    const { containerId, sectionId } = ids(ctx);
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    if (!container) return false;

    const amount = Math.round(Number(ctx.amount) || 0);
    if (mountedOk(containerId, amount)) return true;

    if (section) section.classList.remove('hidden');
    await waitVisible(section || container);

    if (mounting[containerId]) {
      try {
        await mounting[containerId];
        return mountedOk(containerId, amount);
      } catch (_) {
        return false;
      }
    }

    await unmountSlot(containerId);
    container.innerHTML = '';
    container.classList.remove('hidden');

    const email = String(ctx.payerEmail || ctx.payerEmailFallback || '').trim();
    const mp = new MercadoPago(ctx.publicKey, { locale: 'es-CL' });

    mounting[containerId] = mp.bricks()
      .create('payment', containerId, {
        initialization: {
          amount,
          payer: email ? { email } : undefined
        },
        customization: {
          visual: {
            style: VISUAL,
            hideRedirectionPanel: true,
            texts: { formTitle: ' ' }
          },
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            prepaidCard: 'all',
            maxInstallments: 1,
            minInstallments: 1
          }
        },
        callbacks: {
          onReady: () => {
            if (typeof ctx.onReady === 'function') ctx.onReady();
          },
          onSubmit: (payload) => {
            if (typeof ctx.onBeforeSubmit === 'function') {
              const block = ctx.onBeforeSubmit();
              if (block) {
                if (window.FandezNotify) {
                  FandezNotify.show({ type: 'warning', title: block, kicker: 'Antes de pagar' });
                }
                return Promise.reject(new Error(block));
              }
            }
            return ctx.submitPayment(unwrap(payload));
          },
          onError: (error) => {
            console.error('[mp-brick]', containerId, error);
          }
        }
      })
      .then((ctrl) => {
        slots[containerId] = { controller: ctrl, amount };
        mounting[containerId] = null;
        return ctrl;
      })
      .catch((err) => {
        mounting[containerId] = null;
        console.error('[mp-brick] mount', containerId, err);
        throw err;
      });

    await mounting[containerId];
    return mountedOk(containerId, amount);
  }

  window.FandezMpBrick = {
    async sync(ctx) {
      const { containerId, sectionId } = ids(ctx);
      const section = document.getElementById(sectionId);
      if (!canUse(ctx)) {
        if (section) section.classList.add('hidden');
        await unmountSlot(containerId);
        return { active: false, reason: 'invalid_context' };
      }
      if (section) section.classList.remove('hidden');
      try {
        const ok = await mount(ctx);
        return { active: ok, mode: 'payment_brick' };
      } catch (err) {
        return { active: false, reason: err?.message || 'mount_failed' };
      }
    },
    unmount: async () => {
      await Promise.all(Object.keys(slots).map((id) => unmountSlot(id)));
    },
    unmountSlot
  };
})();

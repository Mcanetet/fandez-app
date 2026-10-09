/**
 * Mercado Pago Card Payment Brick — checkout embebido en Fandez (sin redirect a MP).
 */
(function () {
  /** @type {Record<string, { controller: object, amount: number }>} */
  const slots = {};
  /** @type {Record<string, Promise<unknown>|null>} */
  const mountingById = {};

  function isMercadoPagoGateway(id) {
    return String(id || '').toLowerCase() === 'mercadopago';
  }

  const FANDEZ_MP_VISUAL = {
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

  function resolveIds(ctx) {
    const containerId = ctx.containerId || 'mpCardPaymentBrick';
    const sectionId = ctx.sectionId || 'mpEmbedSection';
    return { containerId, sectionId };
  }

  function shouldUseBrick(ctx) {
    if (!ctx.embed || !ctx.publicKey) return false;
    if (ctx.paymentMethod !== 'card') return false;
    if (!isMercadoPagoGateway(ctx.cardGateway)) return false;
    const amount = Math.round(Number(ctx.amount) || 0);
    if (amount < 1) return false;
    return true;
  }

  async function unmountSlot(containerId) {
    const slot = slots[containerId];
    if (slot?.controller && typeof slot.controller.unmount === 'function') {
      try {
        await slot.controller.unmount();
      } catch (_) { /* noop */ }
    }
    delete slots[containerId];
    mountingById[containerId] = null;
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
  }

  async function unmountAll() {
    await Promise.all(Object.keys(slots).map((id) => unmountSlot(id)));
  }

  async function mount(ctx) {
    if (!window.MercadoPago) return false;
    const { containerId } = resolveIds(ctx);
    const container = document.getElementById(containerId);
    if (!container) return false;

    const amount = Math.round(Number(ctx.amount) || 0);
    const slot = slots[containerId];
    if (slot?.controller && slot.amount === amount) return true;

    if (mountingById[containerId]) {
      try {
        await mountingById[containerId];
        return Boolean(slots[containerId]?.controller);
      } catch (_) {
        return false;
      }
    }

    await unmountSlot(containerId);
    container.innerHTML = '';

    const mp = new MercadoPago(ctx.publicKey, { locale: 'es-CL' });
    const bricksBuilder = mp.bricks();

    mountingById[containerId] = bricksBuilder
      .create('cardPayment', containerId, {
        initialization: {
          amount,
          payer: ctx.payerEmail ? { email: ctx.payerEmail } : undefined
        },
        customization: {
          visual: {
            style: FANDEZ_MP_VISUAL,
            texts: {
              formTitle: 'Tarjeta crédito, débito o prepago'
            }
          },
          paymentMethods: {
            maxInstallments: ctx.maxInstallments || 3
          }
        },
        callbacks: {
          onReady: () => {
            if (typeof ctx.onReady === 'function') ctx.onReady();
          },
          onSubmit: (cardFormData) => {
            if (typeof ctx.onBeforeSubmit === 'function') {
              const block = ctx.onBeforeSubmit();
              if (block) {
                if (window.FandezNotify) {
                  FandezNotify.show({ type: 'warning', title: block, kicker: 'Antes de pagar' });
                }
                return Promise.reject(new Error(block));
              }
            }
            return ctx.submitPayment(cardFormData);
          },
          onError: (error) => {
            console.error('[mp-brick]', containerId, error);
            if (window.FandezNotify) {
              FandezNotify.show('No se pudo cargar el formulario de pago. Recarga la página.', 'error');
            }
          }
        }
      })
      .then((ctrl) => {
        slots[containerId] = { controller: ctrl, amount };
        mountingById[containerId] = null;
        return ctrl;
      })
      .catch((err) => {
        mountingById[containerId] = null;
        console.error('[mp-brick] mount', containerId, err);
        throw err;
      });

    await mountingById[containerId];
    return true;
  }

  window.FandezMpBrick = {
    async sync(ctx) {
      const { containerId, sectionId } = resolveIds(ctx);
      const section = document.getElementById(sectionId);
      const use = shouldUseBrick(ctx);
      if (section) section.classList.toggle('hidden', !use);

      if (!use) {
        await unmountSlot(containerId);
        return { active: false };
      }

      try {
        await mount(ctx);
        return { active: Boolean(slots[containerId]?.controller) };
      } catch (_) {
        return { active: false };
      }
    },
    unmount: unmountAll,
    unmountSlot
  };
})();

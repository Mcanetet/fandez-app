/**
 * Mercado Pago Card Payment Brick — checkout embebido en Fandez (sin redirect a MP).
 */
(function () {
  let controller = null;
  let mounting = null;
  let lastAmount = null;

  function isMercadoPagoGateway(id) {
    return String(id || '').toLowerCase() === 'mercadopago';
  }

  /** Paleta Fandez — evita el azul del theme bootstrap en el loading del botón Pagar */
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

  function shouldUseBrick(ctx) {
    if (!ctx.embed || !ctx.publicKey) return false;
    if (ctx.paymentMethod !== 'card') return false;
    if (!isMercadoPagoGateway(ctx.cardGateway)) return false;
    if (!ctx.amount || ctx.amount < 1) return false;
    return true;
  }

  async function unmount() {
    if (controller && typeof controller.unmount === 'function') {
      try {
        await controller.unmount();
      } catch (_) { /* noop */ }
    }
    controller = null;
    lastAmount = null;
  }

  async function mount(ctx) {
    if (!window.MercadoPago) return false;
    const container = document.getElementById('mpCardPaymentBrick');
    if (!container) return false;

    if (controller && lastAmount === ctx.amount) return true;

    await unmount();
    container.innerHTML = '';

    const mp = new MercadoPago(ctx.publicKey, { locale: 'es-CL' });
    const bricksBuilder = mp.bricks();

    mounting = bricksBuilder
      .create('cardPayment', 'mpCardPaymentBrick', {
        initialization: {
          amount: ctx.amount,
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
          onReady: () => {},
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
            console.error('[mp-brick]', error);
            if (window.FandezNotify) {
              FandezNotify.show('No se pudo cargar el formulario de pago. Recarga la página.', 'error');
            }
          }
        }
      })
      .then((ctrl) => {
        controller = ctrl;
        lastAmount = ctx.amount;
        mounting = null;
        return ctrl;
      })
      .catch((err) => {
        mounting = null;
        console.error('[mp-brick] mount', err);
        throw err;
      });

    await mounting;
    return true;
  }

  window.FandezMpBrick = {
    async sync(ctx) {
      const section = document.getElementById('mpEmbedSection');
      const use = shouldUseBrick(ctx);
      if (section) section.classList.toggle('hidden', !use);

      if (!use) {
        await unmount();
        return { active: false };
      }

      if (mounting) {
        try {
          await mounting;
        } catch (_) {
          return { active: false };
        }
      }

      try {
        await mount(ctx);
        return { active: true };
      } catch (_) {
        return { active: false };
      }
    },
    unmount
  };
})();

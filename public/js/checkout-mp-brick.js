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
            style: {
              theme: 'bootstrap',
              customVariables: {
                baseColor: '#C45C14'
              }
            },
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

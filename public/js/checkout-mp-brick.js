/**
 * Mercado Pago Payment Brick (solo tarjetas) — checkout embebido en Fandez.
 * Usa Payment Brick (no Card Payment Brick) para aceptar prepaid_card (Visa prepago CL, MP 2025).
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

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  async function waitUntilVisible(el, maxFrames = 30) {
    for (let i = 0; i < maxFrames; i += 1) {
      if (isVisible(el)) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return isVisible(el);
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

  function slotMounted(containerId, amount) {
    const slot = slots[containerId];
    const el = document.getElementById(containerId);
    if (!slot?.controller || !el || el.children.length === 0) return false;
    if (slot.amount !== amount) return false;
    return true;
  }

  /** Payment Brick entrega { selectedPaymentMethod, formData }; Card Brick entregaba formData plano. */
  function unwrapSubmitPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (payload.formData && typeof payload.formData === 'object') {
      return {
        ...payload.formData,
        selectedPaymentMethod: payload.selectedPaymentMethod,
        paymentType: payload.selectedPaymentMethod || payload.formData.paymentType
      };
    }
    return payload;
  }

  async function mount(ctx) {
    if (!window.MercadoPago) return false;
    const { containerId, sectionId } = resolveIds(ctx);
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    if (!container) return false;

    const amount = Math.round(Number(ctx.amount) || 0);
    if (slotMounted(containerId, amount)) return true;

    if (section) section.classList.remove('hidden');
    await waitUntilVisible(section || container);

    if (mountingById[containerId]) {
      try {
        await mountingById[containerId];
        return slotMounted(containerId, amount);
      } catch (_) {
        return false;
      }
    }

    await unmountSlot(containerId);
    container.innerHTML = '';

    const payerEmail = String(ctx.payerEmail || ctx.payerEmailFallback || '').trim();
    const mp = new MercadoPago(ctx.publicKey, { locale: 'es-CL' });
    const bricksBuilder = mp.bricks();

    // Sin preferenceId: evita filtrar Visa. Solo tarjetas (crédito/débito/prepago).
    const initialization = {
      amount,
      payer: payerEmail ? { email: payerEmail } : undefined
    };

    mountingById[containerId] = bricksBuilder
      .create('payment', containerId, {
        initialization,
        customization: {
          visual: {
            style: FANDEZ_MP_VISUAL,
            texts: {
              formTitle: 'Tarjeta crédito, débito o prepago'
            }
          },
          paymentMethods: {
            // MP mar-2025: prepaidCard debe ir explícito o Visa prepago falla
            // con «No pudimos obtener la información de pago».
            creditCard: 'all',
            debitCard: 'all',
            prepaidCard: 'all',
            maxInstallments: ctx.maxInstallments || 3,
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
            return ctx.submitPayment(unwrapSubmitPayload(payload));
          },
          onError: (error) => {
            console.error('[mp-brick]', containerId, error);
            if (window.FandezNotify) {
              FandezNotify.show('Mercado Pago no pudo mostrar el formulario. Reintenta o usa el enlace de checkout.', 'error');
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
    return slotMounted(containerId, amount);
  }

  window.FandezMpBrick = {
    async sync(ctx) {
      const { containerId, sectionId } = resolveIds(ctx);
      const section = document.getElementById(sectionId);
      const use = shouldUseBrick(ctx);
      if (section && !use) section.classList.add('hidden');

      if (!use) {
        await unmountSlot(containerId);
        return { active: false, reason: 'invalid_context' };
      }
      if (section) section.classList.remove('hidden');

      try {
        const ok = await mount(ctx);
        return { active: ok };
      } catch (err) {
        return { active: false, reason: err?.message || 'mount_failed' };
      }
    },
    unmount: unmountAll,
    unmountSlot
  };
})();

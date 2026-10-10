/**
 * Checkout API (CardForm) — sin Brick.
 *
 * El Card/Payment Brick en Chile filtraba Visa (solo MC/Amex) aunque
 * /v1/payment_methods tenga visa active. CardForm llama getPaymentMethods(bin)
 * y acepta credit_card / debit_card / prepaid_card → Visa incluida.
 */
(function () {
  /** @type {Record<string, { form: object|null, amount: number, mp: object|null }>} */
  const slots = {};
  /** @type {Record<string, Promise<unknown>|null>} */
  const mountingById = {};

  function isMercadoPagoGateway(id) {
    return String(id || '').toLowerCase() === 'mercadopago';
  }

  function resolveIds(ctx) {
    const containerId = ctx.containerId || 'mpCardPaymentBrick';
    const sectionId = ctx.sectionId || 'mpEmbedSection';
    return { containerId, sectionId };
  }

  function shouldUse(ctx) {
    if (!ctx.embed || !ctx.publicKey) return false;
    if (ctx.paymentMethod !== 'card') return false;
    if (!isMercadoPagoGateway(ctx.cardGateway)) return false;
    const amount = Math.round(Number(ctx.amount) || 0);
    return amount >= 1;
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

  function fieldIds(containerId) {
    const p = `fandezMp_${containerId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return {
      form: `${p}_form`,
      cardNumber: `${p}_cardNumber`,
      expirationDate: `${p}_expirationDate`,
      securityCode: `${p}_securityCode`,
      cardholderName: `${p}_cardholderName`,
      cardholderEmail: `${p}_cardholderEmail`,
      issuer: `${p}_issuer`,
      installments: `${p}_installments`,
      identificationType: `${p}_identificationType`,
      identificationNumber: `${p}_identificationNumber`,
      brandLogo: `${p}_brandLogo`,
      binError: `${p}_binError`,
      submit: `${p}_submit`
    };
  }

  function renderFormHtml(ids, payerEmail) {
    return `
<form id="${ids.form}" class="fandez-mp-cardform space-y-3" novalidate>
  <div>
    <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.cardNumber}">Número de tarjeta</label>
    <div class="relative mt-1">
      <div id="${ids.cardNumber}" class="zilo-input !py-3 min-h-[48px] pr-14"></div>
      <img id="${ids.brandLogo}" alt="" class="hidden absolute right-3 top-1/2 -translate-y-1/2 h-5 w-auto max-w-[40px] pointer-events-none" />
    </div>
    <p id="${ids.binError}" class="hidden text-xs text-red-700 mt-1"></p>
  </div>
  <div class="grid grid-cols-2 gap-2">
    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.expirationDate}">Vencimiento</label>
      <div id="${ids.expirationDate}" class="zilo-input !py-3 min-h-[48px] mt-1"></div>
    </div>
    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.securityCode}">CVV</label>
      <div id="${ids.securityCode}" class="zilo-input !py-3 min-h-[48px] mt-1"></div>
    </div>
  </div>
  <div>
    <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.cardholderName}">Nombre del titular</label>
    <input type="text" id="${ids.cardholderName}" name="cardholderName" autocomplete="cc-name" class="zilo-input !py-3 mt-1 w-full" placeholder="Como aparece en la tarjeta" />
  </div>
  <div class="grid grid-cols-2 gap-2">
    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.identificationType}">Documento</label>
      <select id="${ids.identificationType}" name="identificationType" class="zilo-input !py-3 mt-1 w-full"></select>
    </div>
    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wide text-zilo-muted" for="${ids.identificationNumber}">RUT / número</label>
      <input type="text" id="${ids.identificationNumber}" name="identificationNumber" class="zilo-input !py-3 mt-1 w-full" placeholder="12.345.678-9" />
    </div>
  </div>
  <input type="email" id="${ids.cardholderEmail}" name="cardholderEmail" value="${String(payerEmail || '').replace(/"/g, '&quot;')}" class="hidden" tabindex="-1" aria-hidden="true" />
  <select id="${ids.issuer}" name="issuer" class="hidden" aria-hidden="true"></select>
  <select id="${ids.installments}" name="installments" class="hidden" aria-hidden="true">
    <option value="1">1</option>
  </select>
  <button type="submit" id="${ids.submit}" class="w-full zilo-btn-primary !py-3 !text-sm mt-1">Pagar con tarjeta</button>
  <p class="text-[10px] text-zilo-muted text-center">Checkout API · Visa, Mastercard y Amex · 1 cuota</p>
</form>`;
  }

  function setBrandLogo(ids, method) {
    const img = document.getElementById(ids.brandLogo);
    if (!img) return;
    const src = method?.secure_thumbnail || method?.thumbnail || '';
    if (!src) {
      img.classList.add('hidden');
      img.removeAttribute('src');
      return;
    }
    img.src = src;
    img.alt = method.name || method.id || '';
    img.classList.remove('hidden');
  }

  function setBinError(ids, message) {
    const el = document.getElementById(ids.binError);
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  function pickPaymentMethod(results) {
    const list = Array.isArray(results) ? results : [];
    const active = list.filter((m) => !m.status || m.status === 'active');
    const pool = active.length ? active : list;
    // Preferir el que matchee el BIN; si hay varios, priorizar prepaid/debit/credit en ese orden
    // (Visa Chile a menudo llega como prepaid_card).
    const order = ['prepaid_card', 'debit_card', 'credit_card'];
    for (const type of order) {
      const hit = pool.find((m) => String(m.payment_type_id || '') === type);
      if (hit) return hit;
    }
    return pool[0] || null;
  }

  function forceOneInstallment(selectEl) {
    if (!selectEl) return;
    const keep = Array.from(selectEl.options || []).filter((o) => String(o.value) === '1');
    selectEl.innerHTML = '';
    if (keep.length) {
      keep.forEach((o) => selectEl.appendChild(o));
    } else {
      const opt = document.createElement('option');
      opt.value = '1';
      opt.textContent = '1 cuota';
      selectEl.appendChild(opt);
    }
    selectEl.value = '1';
  }

  async function unmountSlot(containerId) {
    const slot = slots[containerId];
    if (slot?.form && typeof slot.form.unmount === 'function') {
      try {
        slot.form.unmount();
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
    if (!slot?.form || !el || el.children.length === 0) return false;
    return slot.amount === amount;
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
    const ids = fieldIds(containerId);
    const payerEmail = String(ctx.payerEmail || ctx.payerEmailFallback || '').trim();
    container.innerHTML = renderFormHtml(ids, payerEmail);
    container.classList.remove('hidden');

    const mp = new MercadoPago(ctx.publicKey, { locale: 'es-CL' });

    mountingById[containerId] = new Promise((resolve, reject) => {
      let settled = false;
      const done = (ok, err) => {
        if (settled) return;
        settled = true;
        mountingById[containerId] = null;
        if (ok) resolve(true);
        else reject(err || new Error('cardform_mount_failed'));
      };

      try {
        const cardForm = mp.cardForm({
          amount: String(amount),
          iframe: true,
          form: {
            id: ids.form,
            cardNumber: { id: ids.cardNumber, placeholder: 'Número de tarjeta' },
            expirationDate: { id: ids.expirationDate, placeholder: 'MM/AA' },
            securityCode: { id: ids.securityCode, placeholder: 'CVV' },
            cardholderName: { id: ids.cardholderName, placeholder: 'Titular' },
            cardholderEmail: { id: ids.cardholderEmail },
            issuer: { id: ids.issuer },
            installments: { id: ids.installments },
            identificationType: { id: ids.identificationType },
            identificationNumber: { id: ids.identificationNumber, placeholder: 'RUT' }
          },
          callbacks: {
            onFormMounted: (error) => {
              if (error) {
                console.error('[mp-cardform] mount', error);
                done(false, error);
                return;
              }
              slots[containerId] = { form: cardForm, amount, mp };
              if (typeof ctx.onReady === 'function') ctx.onReady();
              done(true);
            },
            onPaymentMethodsReceived: (error, data) => {
              if (error) {
                console.warn('[mp-cardform] paymentMethods', error);
                setBrandLogo(ids, null);
                setBinError(ids, 'No pudimos reconocer la tarjeta. Revisa el número (Visa, Mastercard o Amex).');
                return;
              }
              const method = pickPaymentMethod(data?.results);
              if (!method) {
                setBrandLogo(ids, null);
                setBinError(ids, 'Esta tarjeta no está disponible. Prueba otra.');
                return;
              }
              setBinError(ids, '');
              setBrandLogo(ids, method);
            },
            onInstallmentsReceived: (error, data) => {
              if (error) return;
              const select = document.getElementById(ids.installments);
              // CardForm rellena el select; forzamos 1 cuota (Visa Chile).
              setTimeout(() => forceOneInstallment(select), 0);
              if (data?.payer_costs && select) {
                const one = (data.payer_costs || []).find((c) => Number(c.installments) === 1);
                if (one) {
                  select.innerHTML = '';
                  const opt = document.createElement('option');
                  opt.value = '1';
                  opt.textContent = one.recommended_message || '1 cuota';
                  select.appendChild(opt);
                  select.value = '1';
                }
              }
            },
            onSubmit: (event) => {
              event.preventDefault();
              if (typeof ctx.onBeforeSubmit === 'function') {
                const block = ctx.onBeforeSubmit();
                if (block) {
                  if (window.FandezNotify) {
                    FandezNotify.show({ type: 'warning', title: block, kicker: 'Antes de pagar' });
                  }
                  return;
                }
              }
              const data = cardForm.getCardFormData() || {};
              const formData = {
                token: data.token,
                payment_method_id: data.paymentMethodId,
                paymentMethodId: data.paymentMethodId,
                issuer_id: data.issuerId,
                issuerId: data.issuerId,
                installments: 1,
                transaction_amount: amount,
                payment_type_id: data.paymentTypeId || data.payment_type_id || null,
                payer: {
                  email: data.cardholderEmail || payerEmail,
                  identification: {
                    type: data.identificationType,
                    number: data.identificationNumber
                  }
                }
              };
              if (!formData.token || !formData.payment_method_id) {
                if (window.FandezNotify) {
                  FandezNotify.show('Completa los datos de la tarjeta e intenta de nuevo.', 'error');
                }
                return;
              }
              const btn = document.getElementById(ids.submit);
              if (btn) {
                btn.disabled = true;
                btn.textContent = 'Procesando…';
              }
              Promise.resolve(ctx.submitPayment(formData))
                .catch(() => { /* error ya notificado */ })
                .finally(() => {
                  if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Pagar con tarjeta';
                  }
                });
            },
            onError: (error) => {
              console.error('[mp-cardform]', error);
            }
          }
        });
      } catch (err) {
        done(false, err);
      }
    });

    await mountingById[containerId];
    return slotMounted(containerId, amount);
  }

  window.FandezMpBrick = {
    async sync(ctx) {
      const { containerId, sectionId } = resolveIds(ctx);
      const section = document.getElementById(sectionId);
      const use = shouldUse(ctx);
      if (section && !use) section.classList.add('hidden');

      if (!use) {
        await unmountSlot(containerId);
        return { active: false, reason: 'invalid_context' };
      }
      if (section) section.classList.remove('hidden');

      try {
        const ok = await mount(ctx);
        return { active: ok, mode: 'cardform' };
      } catch (err) {
        console.error('[mp-cardform] sync', err);
        return { active: false, reason: err?.message || 'mount_failed' };
      }
    },
    unmount: unmountAll,
    unmountSlot
  };
})();

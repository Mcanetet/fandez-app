'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const serviceTpl = fs.readFileSync(
  path.join(__dirname, '../views/client/service.ejs'),
  'utf8'
);
const css = fs.readFileSync(path.join(__dirname, '../public/css/main.css'), 'utf8');

function renderGasfiterLean() {
  return ejs.render(serviceTpl, {
    t: (k) => k,
    mod: () => true,
    asset: (s) => s,
    formatCLP: (n) => `$${Number(n || 0).toLocaleString('es-CL')}`,
    locale: 'es',
    user: { id: 'c1', name: 'Ana', role: 'client' },
    profile: {
      address: 'Antonio Bellet 193, Providencia',
      name: 'Ana',
      email: 'ana@test.cl',
      billing: { type: 'natural' }
    },
    service: { id: 'gasfiter', name: 'Gasfitería', fromPrice: 105000, icon: 'gasfiter' },
    pricing: { servicePrice: 105000 },
    serviceFromPrice: 105000,
    company: { whatsapp: '+56', supportEmail: 'soporte@fandez.cl' },
    tracking: null,
    inlinePayFlow: false,
    checkoutDraft: null,
    currentQuery: '',
    urgencyTiers: [
      { id: 'immediate', label: 'Ya', surchargePercent: 25, description: 'Entre 1 y 3 horas' },
      { id: 'today', label: 'Hoy', surchargePercent: 0, description: 'Hoy sin apuro' },
      { id: 'tomorrow', label: 'Mañana', surchargePercent: -10, description: 'Agenda mañana' }
    ],
    activities: [
      {
        id: 'gas-pkg-griferia',
        name: 'Grifería y llaves',
        basePrice: 105000,
        quoteMode: 'client_package',
        suggested: true,
        clientBlurb: 'Mano de obra para llaves. Insumos extra se suman en el diagnóstico.'
      },
      {
        id: 'gas-pkg-baño',
        name: 'Baño (WC, ducha o tina)',
        basePrice: 115000,
        quoteMode: 'client_package',
        clientBlurb: 'Sanitario, ducha o instala el técnico según el terreno.'
      }
    ],
    resolvedServicePath: 'now',
    mpEmbedCheckout: false,
    mpPublicKey: '',
    mpSandboxPayments: false,
    mpTokenConfigured: false,
    maxCardInstallments: 3,
    requestTimeouts: { unassignedNoticeMinutes: 15 }
  }, {
    filename: path.join(__dirname, '../views/client/service.ejs'),
    includer() {
      return { template: '<!-- include -->' };
    }
  });
}

describe('Checkout lean (estilo Mercado Libre)', () => {
  test('la ficha de pedido usa lean salvo tracking', () => {
    expect(serviceTpl).toMatch(/const leanCheckout = !\(typeof tracking !== 'undefined' && tracking\);/);
    expect(serviceTpl).toMatch(/data-lean="1"/);
    expect(serviceTpl).toMatch(/service-lean/);
  });

  test('no pinta overview, tarifas, Sofía ni regalo en lean', () => {
    expect(serviceTpl).toMatch(/if \(!leanCheckout\) \{[\s\S]*service-overview-card/);
    expect(serviceTpl).toMatch(/if \(leanCheckout\) \{[\s\S]*id="pricingBox" class="sr-only"/);
    expect(serviceTpl).toMatch(/mod\('client_aland'\) && !leanCheckout/);
    expect(serviceTpl).toMatch(/mod\('client_regalo'\) && !leanCheckout/);
    expect(serviceTpl).not.toMatch(/leanCheckout \? ' hidden' : '' %>" id="pricingBox"/);
  });

  test('progreso, mapa, fotos y panel “esto es lo que pediste” no ensucian lean', () => {
    expect(serviceTpl).toMatch(/if \(!leanCheckout\) \{[\s\S]*checkout-progress/);
    expect(serviceTpl).not.toMatch(/else \{[\s\S]*checkout-progress[\s\S]*checkoutStep: 1/);
    expect(serviceTpl).toMatch(/leanCheckout && !isGarden && !isFv \? ' hidden'/);
    expect(serviceTpl).toMatch(/id="addressMap" class="sr-only"/);
    expect(serviceTpl).toMatch(/if \(!leanCheckout\) \{[\s\S]*activitySelectedPanel/);
  });

  test('footer legal y Sofía FAB se ocultan en la ficha lean', () => {
    expect(css).toMatch(/body:has\(#servicePage\.service-lean\) #alandFabRoot/);
    expect(css).toMatch(/body:has\(#servicePage\.service-lean\) \.legal-footer/);
    expect(css).not.toMatch(/#urgencyScheduleDetails summary span:last-child\s*\{\s*display:\s*none/);
    expect(css).not.toMatch(/#scheduleWhenBox[^{]*\{\s*display:\s*none/);
  });

  test('gasfitería ahora: HTML visible es paquete + cuándo + dirección + Pagar', () => {
    const html = renderGasfiterLean();
    expect(html).toContain('service-lean');
    expect(html).toMatch(/data-lean="1"/);
    expect(html).toContain('Grifería y llaves');
    expect(html).toContain('$105.000');
    expect(html).toContain('id="urgencyOptions"');
    expect(html).toContain('id="scheduleWhenBox"');
    expect(html).toContain('id="urgencyProgramadoToggle"');
    expect(html).toContain('client.service.urgency_scheduled');
    expect(html).toContain('id="address"');
    expect(html).toContain('btnRequestSticky');

    expect(html).not.toContain('service-overview-card');
    expect(html).not.toContain('checkout-progress');
    expect(html).not.toContain('alandChatSection');
    expect(html).not.toContain('giftToggle');
    expect(html).not.toContain('activitySelectedPanel');
    expect(html).not.toContain('Mano de obra para llaves');
    expect(html).not.toContain('client.service.rates');
    expect(html).not.toContain('client.service.visit_est');
    expect(html).toMatch(/class="[^"]*\bhidden\b[^"]*" id="moreOrderDetails"/);
    expect(html).toMatch(/id="addressMap" class="sr-only"/);
    expect(html).not.toContain('data-id="otro"');
  });
});

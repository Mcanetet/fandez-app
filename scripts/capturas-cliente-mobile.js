'use strict';

/**
 * Capturas reales iPhone — estados de seguimiento del cliente en fandez.cl
 * Uso: node scripts/capturas-cliente-mobile.js
 */
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL || 'https://www.fandez.cl';
const OUT = path.join(__dirname, '..', 'docs', 'capturas-mobile');
const DEST = { lat: -33.4263, lng: -70.6114, address: 'Av. Providencia 2650, Providencia, Santiago' };
const TECH_ID = 'tecnico-pedro-demo';
const ROUTE = [
  { lat: -33.4372, lng: -70.6344 },
  { lat: -33.4270, lng: -70.6120 }
];
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function cookieJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    save(res) {
      const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const line of raw) {
        const [pair] = String(line).split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    clear() { cookies.clear(); }
  };
}

async function http(jar, pathUrl, opts = {}) {
  const res = await fetch(pathUrl.startsWith('http') ? pathUrl : `${BASE}${pathUrl}`, {
    ...opts,
    headers: {
      'User-Agent': 'FandezCapturas/1.0',
      Cookie: jar.header(),
      Accept: opts.accept || 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.headers || {})
    },
    redirect: 'manual'
  });
  jar.save(res);
  return res;
}

async function follow(jar, res) {
  let current = res;
  for (let i = 0; i < 8; i++) {
    if (![301, 302, 303, 307, 308].includes(current.status)) return current;
    const loc = current.headers.get('location');
    if (!loc) return current;
    current = await http(jar, loc, { method: 'GET', accept: 'text/html' });
  }
  return current;
}

async function login(jar, email, password) {
  jar.clear();
  await http(jar, '/login', { accept: 'text/html' });
  const res = await http(jar, '/login', {
    method: 'POST',
    accept: 'text/html',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString()
  });
  await follow(jar, res);
}

async function json(jar, pathUrl, opts = {}) {
  const res = await http(jar, pathUrl, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  return { http: res.status, data };
}

async function dismissChrome(page) {
  await page.addStyleTag({
    content: '#cookieBanner, #alandFab, #alandPanel, .pwa-install-banner, #pwaInstallBanner, #fandezSocketBanner { display:none !important; }'
  });
  const accept = page.locator('#cookieAccept');
  if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {});
}

async function snap(page, name) {
  const file = path.join(OUT, name);
  const hero = page.locator('#tripStatusHero, #providerCard').first();
  if (await hero.count()) await hero.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: false });
  console.log('✓', file);
  return file;
}

async function waitClientTrackingReady(page, timeoutMs = 35000) {
  await page.waitForFunction(() => {
    const card = document.getElementById('providerCard');
    const loader = document.getElementById('loaderOverlay');
    const cardVisible = card && !card.classList.contains('hidden');
    const loaderVisible = loader && !loader.classList.contains('hidden');
    return cardVisible || loaderVisible;
  }, { timeout: timeoutMs });
}

async function openClientTracking(page, requestId) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissChrome(page);
  await page.locator('#email').fill('cliente@fandez.cl');
  await page.locator('#password').fill('cliente123');
  await page.locator('form[action="/login"] button[type="submit"]').click();
  await page.waitForURL(/\/(cliente|verificar-email)/, { timeout: 25000 });
  if (page.url().includes('verificar-email')) {
    throw new Error('Cuenta demo requiere verificación de email');
  }
  await page.goto(`${BASE}/cliente/servicio/gasfiter?tracking=${requestId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await dismissChrome(page);
  await waitClientTrackingReady(page);
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const clientJar = cookieJar();
  const providerJar = cookieJar();
  const techJar = cookieJar();
  const now = new Date();
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  console.log('1) Crear pedido demo…');
  await login(clientJar, 'cliente@fandez.cl', 'cliente123');
  const created = await json(clientJar, '/cliente/solicitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'gasfiter',
      address: DEST.address,
      notes: 'Captura real seguimiento móvil Fandez.',
      lat: DEST.lat,
      lng: DEST.lng,
      gift: null,
      clientPhoto: PHOTO,
      clientBrandPhoto: null,
      brandNotVisible: true,
      urgencyTier: 'today',
      activityId: 'gas-filtracion',
      localTime,
      timeZone: 'America/Santiago'
    })
  });
  const request = created.data?.request;
  if (!request?.id) {
    console.error('Fallo crear pedido', created);
    process.exit(1);
  }
  await json(clientJar, '/pagos/demo/confirmar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: request.id })
  });

  console.log('2) Socio toma pedido y asigna técnico (sin aceptar aún)…');
  await login(providerJar, 'pedro@fandez.cl', 'proveedor123');
  await json(providerJar, '/proveedor/toggle-online', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online: true })
  });
  const taken = await json(providerJar, `/proveedor/accept/${request.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ technicianId: TECH_ID })
  });
  if (!taken.data?.success) {
    console.error('Socio no pudo tomar pedido', taken);
    process.exit(1);
  }
  const clientState = await json(clientJar, `/cliente/solicitud/${request.id}`);
  console.log('Estado cliente API:', {
    status: clientState.data?.request?.status,
    techStatus: clientState.data?.request?.techStatus,
    provider: clientState.data?.provider?.name
  });

  const iphone = devices['iPhone 13'];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iphone,
    locale: 'es-CL',
    timezoneId: 'America/Santiago'
  });
  const page = await context.newPage();
  const shots = [];

  console.log('3) Captura: esperando aceptación del técnico…');
  await openClientTracking(page, request.id);
  shots.push(await snap(page, '01-esperando-aceptacion-tecnico.png'));

  console.log('4) Técnico acepta con ETA…');
  await login(techJar, 'tecnico.pedro@fandez.cl', 'tecnico123');
  await json(techJar, '/tecnico/toggle-online', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online: true })
  });
  const etaRes = await json(techJar, `/tecnico/trabajo/${request.id}/eta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etaMinutesMin: 25, etaMinutesMax: 40 })
  });
  const accept = await json(techJar, `/tecnico/status/${request.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ techStatus: 'aceptado' })
  });
  if (!accept.data?.success) {
    console.error('Técnico no aceptó', accept, etaRes);
    process.exit(1);
  }

  await page.reload({ waitUntil: 'networkidle' });
  await dismissChrome(page);
  await page.waitForTimeout(2500);
  shots.push(await snap(page, '02-tecnico-aceptado-eta.png'));

  console.log('5) Técnico en camino + GPS…');
  await json(techJar, `/tecnico/trabajo/${request.id}/confirmar-servicio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  await json(techJar, `/tecnico/status/${request.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ techStatus: 'en_camino' })
  });
  await json(techJar, '/tecnico/ubicacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: ROUTE[0].lat, lng: ROUTE[0].lng, requestId: request.id })
  });

  await page.reload({ waitUntil: 'networkidle' });
  await dismissChrome(page);
  await page.locator('#liveTrackShell, #trackingMap').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  shots.push(await snap(page, '03-tecnico-en-camino-mapa.png'));

  const mapEl = page.locator('#trackingMap');
  if (await mapEl.count()) {
    const mapFile = path.join(OUT, '04-mapa-en-vivo.png');
    await mapEl.screenshot({ path: mapFile });
    shots.push(mapFile);
    console.log('✓', mapFile);
  }

  await json(techJar, '/tecnico/ubicacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: ROUTE[1].lat, lng: ROUTE[1].lng, requestId: request.id })
  });
  await page.waitForTimeout(2500);
  shots.push(await snap(page, '05-tecnico-cerca-domicilio.png'));

  await browser.close();

  const meta = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    requestId: request.id,
    clientUrl: `${BASE}/cliente/servicio/gasfiter?tracking=${request.id}`,
    shots
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('\nLISTO →', OUT);
  console.log(JSON.stringify(meta, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

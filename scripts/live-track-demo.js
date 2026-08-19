'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'https://www.fandez.cl';
const OUT = path.join(__dirname, '..', 'tmp', 'seguimiento-vivo');
const DEST = { lat: -33.4263, lng: -70.6114, address: 'Av. Providencia 2650, Providencia, Santiago' };
const ROUTE = [
  { label: 'salida', lat: -33.4372, lng: -70.6344 },
  { label: 'medio', lat: -33.4328, lng: -70.6205 },
  { label: 'cerca', lat: -33.4270, lng: -70.6120 }
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
      'User-Agent': 'FandezLiveTrack/1.0',
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
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 400) }; }
  return { http: res.status, data };
}

async function pingLocation(techJar, requestId, point) {
  return json(techJar, '/tecnico/ubicacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: point.lat, lng: point.lng, requestId })
  });
}

async function dismissChrome(page) {
  await page.addStyleTag({
    content: '#cookieBanner, #alandFab, #alandPanel, .pwa-install-banner, #pwaInstallBanner { display:none !important; }'
  });
  const accept = page.locator('#cookieAccept');
  if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {});
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const clientJar = cookieJar();
  const techJar = cookieJar();
  const now = new Date();
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  await login(clientJar, 'cliente@fandez.cl', 'cliente123');
  const created = await json(clientJar, '/cliente/solicitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'gasfiter',
      address: DEST.address,
      notes: 'Pedido de prueba de seguimiento en vivo: el técnico va en camino hacia Providencia.',
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
    console.error('No se pudo crear el pedido', created);
    process.exit(1);
  }
  await json(clientJar, '/pagos/demo/confirmar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: request.id })
  });

  await login(techJar, 'tecnico.pedro@fandez.cl', 'tecnico123');
  await json(techJar, '/tecnico/toggle-online', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ online: true })
  });
  const accept = await json(techJar, `/tecnico/accept/${request.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etaMinutesMin: 30, etaMinutesMax: 45 })
  });
  if (!accept.data?.success) {
    console.error('No se pudo aceptar', accept);
    process.exit(1);
  }
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

  const firstPing = await pingLocation(techJar, request.id, ROUTE[0]);
  console.log('pedido', {
    id: request.id,
    guardian: request.guardianToken,
    accept: accept.data?.success,
    ping: firstPing.data?.success,
    eta: firstPing.data?.eta
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-CL',
    timezoneId: 'America/Santiago'
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissChrome(page);
  await page.locator('#email').fill('cliente@fandez.cl');
  await page.locator('#password').fill('cliente123');
  await page.locator('form[action="/login"] button[type="submit"]').click();
  await page.waitForURL(/\/(cliente|verificar-email)/, { timeout: 20000 });

  const clientUrl = `${BASE}/cliente/servicio/gasfiter?tracking=${request.id}`;
  await page.goto(clientUrl, { waitUntil: 'domcontentloaded' });
  await dismissChrome(page);
  await page.waitForTimeout(2500);
  await page.locator('#liveTrackShell, #providerLiveCard, #trackingMap').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const shots = [];
  async function snap(name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
    console.log('shot', file);
  }

  await snap('01-cliente-salida');

  const ping2 = await pingLocation(techJar, request.id, ROUTE[1]);
  console.log('ping_medio', ping2.data?.eta || ping2.data);
  await page.waitForTimeout(2500);
  await snap('02-cliente-medio');

  const ping3 = await pingLocation(techJar, request.id, ROUTE[2]);
  console.log('ping_cerca', ping3.data?.eta || ping3.data);
  await page.waitForTimeout(2500);
  await snap('03-cliente-cerca');

  const map = page.locator('#trackingMap, #liveTrackShell');
  if (await map.count()) {
    await map.first().screenshot({ path: path.join(OUT, '04-mapa-cliente.png') });
    shots.push(path.join(OUT, '04-mapa-cliente.png'));
  }

  const guardianUrl = `${BASE}/seguimiento/${request.guardianToken}`;
  await page.goto(guardianUrl, { waitUntil: 'domcontentloaded' });
  await dismissChrome(page);
  await page.waitForTimeout(4500);
  await snap('05-guardian');
  const gMap = page.locator('#guardianMap, .live-track-shell');
  if (await gMap.count()) {
    await gMap.first().screenshot({ path: path.join(OUT, '06-mapa-guardian.png') });
    shots.push(path.join(OUT, '06-mapa-guardian.png'));
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'pedido.json'), JSON.stringify({
    id: request.id,
    clientUrl,
    guardianUrl,
    mandoUrl: `${BASE}/proveedor/mando`,
    tecnicoUrl: `${BASE}/tecnico/trabajo/${request.id}`,
    shots
  }, null, 2));
  console.log('LISTO', { id: request.id, clientUrl, guardianUrl, shots });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

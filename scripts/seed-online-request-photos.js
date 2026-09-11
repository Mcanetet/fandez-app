#!/usr/bin/env node
/**
 * Sube fotos semilla a fandez.cl creando un pedido demo (jardinería) con imagen.
 * Uso: node scripts/seed-online-request-photos.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = process.env.APP_URL || 'https://www.fandez.cl';
const SEED = path.join(__dirname, '../data/seed-request-photos');
const EMAIL = process.env.SEED_CLIENT_EMAIL || 'cliente@fandez.cl';
const PASS = process.env.SEED_CLIENT_PASSWORD || 'cliente123';

function toDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function request(method, urlPath, { body, cookies = '', headers = {} } = {}) {
  const u = new URL(urlPath.startsWith('http') ? urlPath : BASE + urlPath);
  const lib = u.protocol === 'https:' ? https : http;
  const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = lib.request({
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      port: u.port || undefined,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const setCookie = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, headers: res.headers, text, setCookie, location: res.headers.location });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  String(existing || '').split(';').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  });
  for (const raw of setCookie || []) {
    const first = String(raw).split(';')[0];
    const i = first.indexOf('=');
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login() {
  const form = new URLSearchParams({ email: EMAIL, password: PASS }).toString();
  const u = new URL(BASE + '/login');
  const lib = u.protocol === 'https:' ? https : http;
  const res = await new Promise((resolve, reject) => {
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      path: '/login',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
        Accept: 'text/html'
      }
    }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, setCookie: r.headers['set-cookie'] || [], location: r.headers.location }));
    });
    req.on('error', reject);
    req.write(form);
    req.end();
  });
  const cookies = mergeCookies('', res.setCookie);
  if (res.status !== 302 && res.status !== 200) {
    throw new Error(`Login falló HTTP ${res.status}`);
  }
  return cookies;
}

async function main() {
  const problem = path.join(SEED, 'fandez-demo-jardin-problema.jpg');
  const lavProblem = path.join(SEED, 'fandez-demo-lavadora-problema.jpg');
  const lavBrand = path.join(SEED, 'fandez-demo-lavadora-marca.jpg');
  if (!fs.existsSync(problem)) throw new Error('Falta foto jardín seed');

  console.log('Login', EMAIL, '→', BASE);
  let cookies = await login();
  console.log('OK sesión');

  // Pedido jardinería con foto (queda searching tras demo pay)
  const gardenBody = {
    serviceId: 'jardineria',
    activityId: 'jard-cesped',
    address: 'Av. Providencia 1200, Providencia',
    notes: 'Pasto alto · pedido demo con foto para socios',
    lat: -33.4265,
    lng: -70.615,
    urgencyTier: 'today',
    squareMeters: 40,
    brandNotVisible: true,
    clientPhoto: toDataUrl(problem),
    localTime: '14:00',
    timeZone: 'America/Santiago'
  };
  let res = await request('POST', '/cliente/solicitar', { body: gardenBody, cookies });
  cookies = mergeCookies(cookies, res.setCookie);
  let data = {};
  try { data = JSON.parse(res.text); } catch (_) {}
  console.log('solicitar jardín', res.status, data.success || data.error || res.text.slice(0, 200));
  if (!data.request?.id && !data.id) {
    // sometimes returns { request }
  }
  const gardenId = data.request?.id || data.id || data.requestId;
  if (!gardenId) throw new Error('No se creó pedido jardín');

  res = await request('POST', '/pagos/crear', {
    body: {
      requestId: gardenId,
      paymentMethod: 'card',
      billing: {
        type: 'natural',
        rut: '11.111.111-1',
        legalName: 'Cliente Demo Fandez',
        fiscalAddress: gardenBody.address,
        invoiceEmail: EMAIL
      }
    },
    cookies
  });
  cookies = mergeCookies(cookies, res.setCookie);
  try { data = JSON.parse(res.text); } catch (_) { data = {}; }
  console.log('pagos/crear jardín', res.status, data.demo || data.error || data.success, data.checkoutUrl || '');

  if (data.demo || data.checkoutUrl?.includes('/pagos/demo')) {
    res = await request('POST', '/pagos/demo/confirmar', { body: { requestId: gardenId }, cookies });
    cookies = mergeCookies(cookies, res.setCookie);
    try { data = JSON.parse(res.text); } catch (_) { data = {}; }
    console.log('demo confirmar jardín', res.status, data.success || data.error || res.text.slice(0, 200));
  }

  // Pedido lavadora con foto problema + marca
  const lavBody = {
    serviceId: 'lavadora',
    activityId: 'lav-tarjeta',
    address: 'Av. Pedro de Valdivia 263, Providencia',
    notes: 'Se para a mitad del lavado · foto demo',
    lat: -33.4259,
    lng: -70.6118,
    urgencyTier: 'today',
    brandNotVisible: false,
    clientPhoto: toDataUrl(lavProblem),
    clientBrandPhoto: toDataUrl(lavBrand),
    localTime: '15:00',
    timeZone: 'America/Santiago'
  };
  res = await request('POST', '/cliente/solicitar', { body: lavBody, cookies });
  cookies = mergeCookies(cookies, res.setCookie);
  try { data = JSON.parse(res.text); } catch (_) { data = {}; }
  console.log('solicitar lavadora', res.status, data.success || data.error || res.text.slice(0, 200));
  const lavId = data.request?.id || data.id || data.requestId;
  if (lavId) {
    res = await request('POST', '/pagos/crear', {
      body: {
        requestId: lavId,
        paymentMethod: 'card',
        billing: {
          type: 'natural',
          rut: '11.111.111-1',
          legalName: 'Cliente Demo Fandez',
          fiscalAddress: lavBody.address,
          invoiceEmail: EMAIL
        }
      },
      cookies
    });
    cookies = mergeCookies(cookies, res.setCookie);
    try { data = JSON.parse(res.text); } catch (_) { data = {}; }
    console.log('pagos/crear lavadora', res.status, data.demo || data.error || data.success);
    if (data.demo || data.checkoutUrl?.includes('/pagos/demo')) {
      res = await request('POST', '/pagos/demo/confirmar', { body: { requestId: lavId }, cookies });
      try { data = JSON.parse(res.text); } catch (_) { data = {}; }
      console.log('demo confirmar lavadora', res.status, data.success || data.error || res.text.slice(0, 200));
    }
  }

  console.log('Listo. IDs:', { gardenId, lavId });
  console.log('Las fotos quedaron en data/uploads/requests/ del servidor.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

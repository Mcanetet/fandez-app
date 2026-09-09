/**
 * Pieza B2B v6 — conversión Zona Oriente.
 * Celular verde con isotipo OFICIAL Fandez (PNG de marca), nunca “F” inventada.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { BRAND, PLUNGER_PATH } = require('../lib/florencia/brand');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'marketing/lanzamiento-socios');
const PUB = path.join(ROOT, 'public/uploads/marketing/campana-socios');
const EASY = '/Users/miguelangel/Downloads/fandez-graficas-ig';
const PHOTO =
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-photo-phone-blank-white.png';
const PARTNER = path.join(OUT, 'nunoa-hub-logo.png');
const FONT = BRAND.fontUnbounded;
const W = 1080;
const H = 1080;

const COL = 48;
const COL_W = 470;
const CHECK_X = 22;
const TEXT_X = 52;

function fontCss() {
  if (!fs.existsSync(FONT)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(FONT).href}') format('woff2');font-weight:700;}`;
}

function appMarkSvg(size = 76) {
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#FFFFFF"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" stroke="${BRAND.accent}" stroke-width="2"/>
  <g transform="translate(24, 24.5) scale(0.26) translate(-60, -71)">
    <path fill="none" stroke="${BRAND.accent}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER_PATH}"/>
  </g></svg>`;
}

/** Marca app: tile blanco + PNG oficial de isotipo (fondo negro → transparente) */
async function officialAppMark(size = 52) {
  const pad = Math.round(size * 0.18);
  const { data, info } = await sharp(BRAND.isotipoPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) data[i + 3] = 0;
  }
  const isoClear = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .resize({
      width: size - pad * 2,
      height: size - pad * 2,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  const bg = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.round(size * 0.22)}" fill="#FFFFFF"/>
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.round(size * 0.22)}" fill="none" stroke="${BRAND.accent}" stroke-width="2"/>
</svg>`)
  )
    .png()
    .toBuffer();
  return sharp(bg)
    .composite([{ input: isoClear, left: pad, top: pad }])
    .png()
    .toBuffer();
}

function ticket(y, title, sub = '') {
  const h = sub ? 64 : 50;
  const titleY = sub ? 22 : 32;
  return `
  <g transform="translate(${COL},${y})">
    <rect x="0" y="0" width="${COL_W}" height="${h}" rx="12" fill="#FFFFFF" fill-opacity="0.94"/>
    <circle cx="${CHECK_X}" cy="${h / 2}" r="11" fill="${BRAND.accent}"/>
    <path d="M${CHECK_X - 6} ${h / 2} l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>
    <text x="${TEXT_X}" y="${titleY}" class="t">${title}</text>
    ${sub ? `<text x="${TEXT_X}" y="${titleY + 22}" class="ts">${sub}</text>` : ''}
  </g>`;
}

async function detectPhoneScreen(photoBuf) {
  const { data, info } = await sharp(photoBuf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width;
  let best = 0;
  let bx = 600;
  let by = 180;
  const winW = 150;
  const winH = 290;
  for (let y = 100; y < 280; y += 6) {
    for (let x = 540; x < 680; x += 6) {
      let c = 0;
      for (let dy = 0; dy < winH; dy += 4) {
        for (let dx = 0; dx < winW; dx += 4) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 220 && g > 215 && b > 200 && Math.abs(r - g) < 18) c += 1;
        }
      }
      if (c > best) {
        best = c;
        bx = x;
        by = y;
      }
    }
  }
  return { left: bx + 4, top: by + 8, score: best };
}

async function main() {
  const photo = await sharp(PHOTO)
    .resize(W, H, { fit: 'cover', position: 'right' })
    .png()
    .toBuffer();

  const phoneScreenW = 152;
  const phoneScreenH = 292;
  const markSize = 50;
  const phoneMark = await officialAppMark(markSize);
  const cornerMark = await officialAppMark(76);

  const phoneUiBase = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${phoneScreenW}" height="${phoneScreenH}">
  <defs>${fontCss()}</defs>
  <rect width="${phoneScreenW}" height="${phoneScreenH}" rx="22" fill="#0F3D24"/>
  <rect x="6" y="6" width="${phoneScreenW - 12}" height="${phoneScreenH - 12}" rx="16" fill="#167A3C"/>
  <text x="${phoneScreenW / 2}" y="110" text-anchor="middle" fill="#FFFFFF" font-family="Unbounded,Arial,sans-serif" font-size="15" font-weight="700">Fandez</text>
  <text x="${phoneScreenW / 2}" y="138" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="600">Pago recibido</text>
  <text x="${phoneScreenW / 2}" y="180" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="800">$45.000</text>
  <text x="${phoneScreenW / 2}" y="208" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="600">Las Condes / Ñuñoa</text>
  <circle cx="${phoneScreenW / 2}" cy="248" r="16" fill="#FFFFFF" fill-opacity="0.95"/>
  <path d="M${phoneScreenW / 2 - 7} 248 l5 5 11-12" fill="none" stroke="#167A3C" stroke-width="3" stroke-linecap="round"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const phoneScreen = await sharp(phoneUiBase)
    .composite([
      {
        input: phoneMark,
        left: Math.round((phoneScreenW - markSize) / 2),
        top: 28
      }
    ])
    .png()
    .toBuffer();

  const ui = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F7F3EE" stop-opacity="0.97"/>
      <stop offset="40%" stop-color="#F7F3EE" stop-opacity="0.9"/>
      <stop offset="56%" stop-color="#F7F3EE" stop-opacity="0.22"/>
      <stop offset="68%" stop-color="#F7F3EE" stop-opacity="0"/>
    </linearGradient>
    ${fontCss()}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wash)"/>

  <style>
    .brand{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:25px;fill:#1A1814}
    .eye{font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;fill:#6B6560;letter-spacing:0.4px}
    .h1{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:40px;fill:#1A1814}
    .ho{fill:${BRAND.accent}}
    .comunas{font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;fill:#6B6560}
    .t{font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;fill:#1A1814}
    .ts{font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:500;fill:#5C5650}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:20px;fill:#FFFFFF}
    .banner{font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;fill:#FFFFFF}
    .stamp1{font-family:Arial Black,Arial,sans-serif;font-size:14px;font-weight:700;fill:${BRAND.accent}}
    .stamp2{font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:700;fill:${BRAND.accent}}
  </style>

  <text x="128" y="64" class="brand">Fandez</text>
  <text x="${COL}" y="124" class="eye">RECLUTAMIENTO ESTRATÉGICO DE SOCIOS</text>

  <text x="${COL}" y="178" class="h1">Consigue trabajos</text>
  <text x="${COL}" y="228" class="h1">diarios en <tspan class="ho">Zona Oriente</tspan></text>
  <text x="${COL}" y="258" class="comunas">Providencia · Las Condes · Ñuñoa · La Reina · Vitacura</text>

  <rect x="${COL}" y="278" width="${COL_W}" height="44" rx="10" fill="#1A1814"/>
  <text x="${COL + COL_W / 2}" y="306" text-anchor="middle" class="banner">Lanzamiento Octubre 2026 · Registro de Socios Abierto</text>

  ${ticket(340, 'Sin costos fijos')}
  ${ticket(400, 'Cobros garantizados')}
  ${ticket(460, 'Trabajos cerca de ti')}
  ${ticket(520, '¿Tu servicio no aparece?', 'Elige Otros y descríbelo en la app')}

  <rect x="${COL}" y="612" width="420" height="64" rx="14" fill="${BRAND.accent}"/>
  <text x="${COL + 210}" y="652" text-anchor="middle" class="cta">ÚNETE GRATIS EN FANDEZ.CL</text>

  <g transform="translate(258, 780) rotate(-4)">
    <g transform="translate(-155, -46)" opacity="0.92">
      <rect x="3" y="3" width="310" height="92" rx="6" fill="none" stroke="${BRAND.accent}" stroke-width="4"/>
      <rect x="12" y="12" width="292" height="74" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="1.8"/>
      <text x="155" y="42" text-anchor="middle" class="stamp1">★ CUPOS LIMITADOS ★</text>
      <text x="155" y="70" text-anchor="middle" class="stamp2">SANTIAGO ORIENTE</text>
    </g>
  </g>
</svg>`);

  const uiPng = await sharp(ui).png().toBuffer();

  const partnerBuf = await sharp(PARTNER).resize({ width: 148 }).png().toBuffer();
  const pMeta = await sharp(partnerBuf).metadata();
  const inner = 8;
  const bw = pMeta.width + inner * 2;
  const bh = pMeta.height + inner * 2;
  const badge = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}">
  <rect x="0.5" y="0.5" width="${bw - 1}" height="${bh - 1}" rx="12" fill="#FFFCF8" fill-opacity="0.96" stroke="#E0D7CC" stroke-width="1"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const pad = 18;
  const hubLeft = W - pad - bw;
  const hubTop = H - pad - bh;

  const detected = await detectPhoneScreen(photo);
  const phoneLeft = detected.left;
  const phoneTop = detected.top;
  console.log('phone detect', detected);

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-oriente-v6.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: phoneScreen, left: phoneLeft, top: phoneTop },
      { input: cornerMark, left: 42, top: 26 },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  fs.mkdirSync(PUB, { recursive: true });
  fs.mkdirSync(EASY, { recursive: true });
  await fs.promises.copyFile(outPath, path.join(PUB, 'fandez-ig-b2b-proveedor-oriente-v6.png'));
  await fs.promises.copyFile(outPath, path.join(EASY, 'fandez-ig-b2b-proveedor-oriente-v6.png'));

  console.log('ok v6 zona oriente', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

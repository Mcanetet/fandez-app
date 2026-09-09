/**
 * Pieza B2B v7 — misma info que v6, pero celular grande = proyección
 * desde el celular en la mano (sin pantallas duplicadas).
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { BRAND } = require('../lib/florencia/brand');

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
  let bx = 635;
  let by = 120;
  const winW = 120;
  const winH = 240;
  for (let y = 100; y < 360; y += 5) {
    for (let x = 540; x < 760; x += 5) {
      let c = 0;
      for (let dy = 0; dy < winH; dy += 4) {
        for (let dx = 0; dx < winW; dx += 4) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 225 && g > 220 && b > 205 && Math.abs(r - g) < 18) c += 1;
        }
      }
      if (c > best) {
        best = c;
        bx = x;
        by = y;
      }
    }
  }
  return { left: bx, top: by, score: best };
}

async function main() {
  const photo = await sharp(PHOTO)
    .resize(W, H, { fit: 'cover', position: 'right' })
    .png()
    .toBuffer();

  const detected = await detectPhoneScreen(photo);
  // Bounds reales del celular (caja azul que enmarca la pantalla)
  const srcLeft = 618;
  const srcTop = 228; // borde superior físico del celular
  const srcW = 90;
  const srcH = 175;
  const emitY = srcTop;
  const emitL = srcLeft;
  const emitR = srcLeft + srcW;
  const emitX = srcLeft + Math.round(srcW / 2);
  const phoneBottom = srcTop + srcH;

  // Celular grande más abajo para que el haz tenga recorrido
  const bigW = 170;
  const bigH = 290;
  const bigLeft = 638;
  const bigTop = 480;
  const bigCx = bigLeft + bigW / 2;
  const bigTopL = bigLeft;
  const bigTopR = bigLeft + bigW;
  const meetY = bigTop;

  const markSize = 48;
  const phoneMark = await officialAppMark(markSize);
  const cornerMark = await officialAppMark(76);

  // UI del celular grande (única pantalla con la info)
  const bigUiBase = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bigW}" height="${bigH}">
  <defs>${fontCss()}
    <filter id="glow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#167A3C" flood-opacity="0.55"/>
    </filter>
  </defs>
  <g filter="url(#glow)">
    <rect x="4" y="4" width="${bigW - 8}" height="${bigH - 8}" rx="26" fill="#0B0A09"/>
    <rect x="10" y="10" width="${bigW - 20}" height="${bigH - 20}" rx="20" fill="#0F3D24"/>
    <rect x="16" y="16" width="${bigW - 32}" height="${bigH - 32}" rx="16" fill="#167A3C"/>
  </g>
  <text x="${bigW / 2}" y="100" text-anchor="middle" fill="#FFFFFF" font-family="Unbounded,Arial,sans-serif" font-size="18" font-weight="700">Fandez</text>
  <text x="${bigW / 2}" y="128" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="600">Pago recibido</text>
  <text x="${bigW / 2}" y="178" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800">$45.000</text>
  <text x="${bigW / 2}" y="210" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="600">Las Condes / Ñuñoa</text>
  <circle cx="${bigW / 2}" cy="252" r="18" fill="#FFFFFF" fill-opacity="0.95"/>
  <path d="M${bigW / 2 - 8} 252 l6 6 12-14" fill="none" stroke="#167A3C" stroke-width="3.2" stroke-linecap="round"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const bigPhone = await sharp(bigUiBase)
    .composite([
      {
        input: phoneMark,
        left: Math.round((bigW - markSize) / 2),
        top: 28
      }
    ])
    .png()
    .toBuffer();

  // Un solo cono: sale del borde superior (ancho del celular) y se abre al grande
  // El relleno del cono EMPIEZA debajo del celular para no crear silueta encima.
  const projSvg = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="beam" gradientUnits="userSpaceOnUse"
      x1="${emitX}" y1="${phoneBottom}" x2="${bigCx}" y2="${meetY}">
      <stop offset="0%" stop-color="#E8FFF2" stop-opacity="0.7"/>
      <stop offset="50%" stop-color="#7BE8A8" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#3DCF7A" stop-opacity="0.1"/>
    </linearGradient>
  </defs>

  <!-- Pantalla del celular = fuente de luz (solo el área de pantalla, no un marco mayor) -->
  <rect x="${emitL + 3}" y="${emitY + 8}" width="${srcW - 6}" height="${srcH - 14}" rx="8" fill="#3DCF7A" fill-opacity="0.45"/>

  <!-- Origen: borde SUPERIOR exacto -->
  <rect x="${emitL}" y="${emitY}" width="${srcW}" height="5" rx="2" fill="#FFFFFF"/>

  <!-- Laterales del mismo ancho (stroke fino, sin relleno exterior) -->
  <line x1="${emitL}" y1="${emitY}" x2="${emitL}" y2="${phoneBottom}" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="${emitR}" y1="${emitY}" x2="${emitR}" y2="${phoneBottom}" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.5"/>

  <!-- Proyección que se ensancha debajo del celular -->
  <polygon
    points="${emitL},${phoneBottom} ${emitR},${phoneBottom} ${bigTopR},${meetY} ${bigTopL},${meetY}"
    fill="url(#beam)"/>
  <line x1="${emitL}" y1="${phoneBottom}" x2="${bigTopL}" y2="${meetY}" stroke="#E8FFF2" stroke-opacity="0.9" stroke-width="2.2"/>
  <line x1="${emitR}" y1="${phoneBottom}" x2="${bigTopR}" y2="${meetY}" stroke="#E8FFF2" stroke-opacity="0.9" stroke-width="2.2"/>
</svg>`);

  const projPng = await sharp(projSvg).png().toBuffer();
  console.log('layout', { srcLeft, srcTop, srcW, emitY, phoneBottom, bigLeft, bigTop });

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

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-oriente-v7.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: projPng, left: 0, top: 0 },
      { input: bigPhone, left: bigLeft, top: bigTop },
      { input: cornerMark, left: 42, top: 26 },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  // También actualiza v6 como alias de conversión vigente
  const v6 = path.join(OUT, 'fandez-ig-b2b-proveedor-oriente-v6.png');
  fs.mkdirSync(PUB, { recursive: true });
  fs.mkdirSync(EASY, { recursive: true });
  await fs.promises.copyFile(outPath, v6);
  for (const name of [
    'fandez-ig-b2b-proveedor-oriente-v7.png',
    'fandez-ig-b2b-proveedor-oriente-v6.png'
  ]) {
    await fs.promises.copyFile(outPath, path.join(PUB, name));
    await fs.promises.copyFile(outPath, path.join(EASY, name));
  }

  console.log('ok v7 proyección', outPath, { detected, srcLeft, srcTop, bigLeft, bigTop });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Pieza B2B oriente — técnico con rostro completo + celular a escala natural en la mano.
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
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-photo-human-real.png';
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

/** Grano + contraste suave para romper el look “piel de plástico” de IA. */
async function humanizePhoto(photoBuf) {
  const { data, info } = await sharp(photoBuf)
    .ensureAlpha()
    .modulate({ brightness: 0.98, saturation: 0.92 })
    .linear(1.06, -8)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Grano fijo (reproducible) mezclado suave
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.9));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.85));
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

/** Bbox de la pantalla blanca del celular (foto humanizada). */
async function detectWhitePhone(photoBuf) {
  const { data, info } = await sharp(photoBuf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const w = info.width;
  let minX = w;
  let maxX = 0;
  let minY = info.height;
  let maxY = 0;
  let n = 0;
  for (let y = 500; y < 670; y++) {
    for (let x = 555; x < 650; x++) {
      const i = (y * w + x) * 4;
      if (data[i] > 240 && data[i + 1] > 238 && data[i + 2] > 230 && Math.abs(data[i] - data[i + 1]) < 12) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        n += 1;
      }
    }
  }
  if (n < 1500) {
    return { left: 573, top: 531, width: 58, height: 121, score: n };
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    score: n
  };
}

async function main() {
  // Encuadre abierto + humanización (grano / menos look IA)
  const photoRaw = await sharp(PHOTO)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  // Detectar pantalla blanca ANTES del grano (más estable)
  const white = await detectWhitePhone(photoRaw);
  const photo = await humanizePhoto(photoRaw);

  await sharp(photo).toFile('/tmp/v8-base2.png');

  // UI verde a escala natural sobre el celular (sin tapar la cara)
  const padL = 10;
  const padT = 8;
  const padR = 12;
  const padB = 14;
  const phoneLeft = white.left - padL;
  const phoneTop = white.top - padT;
  const phoneW = white.width + padL + padR;
  const phoneH = white.height + padT + padB;
  const markSize = Math.max(22, Math.round(phoneW * 0.36));
  const phoneMark = await officialAppMark(markSize);
  const cornerMark = await officialAppMark(76);

  const markTop = Math.max(4, Math.round(phoneH * 0.05));
  const fsTitle = Math.max(8, Math.round(phoneW * 0.12));
  const fsSub = Math.max(7, Math.round(phoneW * 0.09));
  const fsAmt = Math.max(11, Math.round(phoneW * 0.2));
  const fsLoc = Math.max(6, Math.round(phoneW * 0.075));
  // baseline de "Fandez" debajo del logo (sin solaparse)
  const titleY = markTop + markSize + fsTitle + Math.max(3, Math.round(phoneH * 0.03));
  const subY = titleY + Math.max(11, Math.round(fsSub * 1.35));
  const amtY = subY + Math.max(14, Math.round(fsAmt * 1.05));
  const locY = amtY + Math.max(9, Math.round(fsLoc * 1.2));
  const cyCheck = Math.min(
    phoneH - Math.round(phoneH * 0.1),
    locY + Math.max(16, Math.round(phoneH * 0.12))
  );
  const rCheck = Math.max(7, Math.round(phoneW * 0.11));

  const phoneUi = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${phoneW}" height="${phoneH}">
  <defs>${fontCss()}</defs>
  <rect width="${phoneW}" height="${phoneH}" rx="10" fill="#0B0A09"/>
  <rect x="3" y="3" width="${phoneW - 6}" height="${phoneH - 6}" rx="8" fill="#0F3D24"/>
  <rect x="6" y="6" width="${phoneW - 12}" height="${phoneH - 12}" rx="6" fill="#167A3C"/>
  <text x="${phoneW / 2}" y="${titleY}" text-anchor="middle" fill="#FFFFFF" font-family="Unbounded,Arial,sans-serif" font-size="${fsTitle}" font-weight="700">Fandez</text>
  <text x="${phoneW / 2}" y="${subY}" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="${fsSub}" font-weight="600">Pago recibido</text>
  <text x="${phoneW / 2}" y="${amtY}" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="${fsAmt}" font-weight="800">$45.000</text>
  <text x="${phoneW / 2}" y="${locY}" text-anchor="middle" fill="#D4F5DF" font-family="Arial,Helvetica,sans-serif" font-size="${fsLoc}" font-weight="600">Las Condes / Ñuñoa</text>
  <circle cx="${phoneW / 2}" cy="${cyCheck}" r="${rCheck}" fill="#FFFFFF" fill-opacity="0.95"/>
  <path d="M${phoneW / 2 - rCheck * 0.45} ${cyCheck} l${rCheck * 0.32} ${rCheck * 0.32} ${rCheck * 0.6} ${-rCheck * 0.7}" fill="none" stroke="#167A3C" stroke-width="${Math.max(1.5, phoneW * 0.02)}" stroke-linecap="round"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const phoneScreen = await sharp(phoneUi)
    .composite([
      {
        input: phoneMark,
        left: Math.round((phoneW - markSize) / 2),
        top: markTop
      }
    ])
    .png()
    .toBuffer();

  const whiteCover = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${white.width + 4}" height="${white.height + 4}">
  <rect width="${white.width + 4}" height="${white.height + 4}" rx="2" fill="#0B0A09"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const ui = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F7F3EE" stop-opacity="0.97"/>
      <stop offset="42%" stop-color="#F7F3EE" stop-opacity="0.88"/>
      <stop offset="58%" stop-color="#F7F3EE" stop-opacity="0.18"/>
      <stop offset="70%" stop-color="#F7F3EE" stop-opacity="0"/>
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
    .ig{font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;fill:#5C5650}
    .igh{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:17px;fill:${BRAND.accent}}
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
  <text x="${COL + 210}" y="652" text-anchor="middle" class="cta">ÚNETE GRATIS EN WWW.FANDEZ.CL</text>

  <g transform="translate(258, 760) rotate(-4)">
    <g transform="translate(-155, -46)" opacity="0.92">
      <rect x="3" y="3" width="310" height="92" rx="6" fill="none" stroke="${BRAND.accent}" stroke-width="4"/>
      <rect x="12" y="12" width="292" height="74" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="1.8"/>
      <text x="155" y="42" text-anchor="middle" class="stamp1">★ CUPOS LIMITADOS ★</text>
      <text x="155" y="70" text-anchor="middle" class="stamp2">SANTIAGO ORIENTE</text>
    </g>
  </g>

  <text x="${COL}" y="900" class="ig">Síguenos en Instagram</text>
  <text x="${COL}" y="928" class="igh">@fandez.cl</text>
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

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-oriente-v8.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: whiteCover, left: white.left - 2, top: white.top - 2 },
      { input: phoneScreen, left: phoneLeft, top: phoneTop },
      { input: cornerMark, left: 42, top: 26 },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  fs.mkdirSync(PUB, { recursive: true });
  fs.mkdirSync(EASY, { recursive: true });
  await fs.promises.copyFile(outPath, path.join(OUT, 'fandez-ig-b2b-proveedor-oriente-v7.png'));
  for (const name of [
    'fandez-ig-b2b-proveedor-oriente-v8.png',
    'fandez-ig-b2b-proveedor-oriente-v7.png'
  ]) {
    await fs.promises.copyFile(outPath, path.join(PUB, name));
    await fs.promises.copyFile(outPath, path.join(EASY, name));
  }

  console.log('ok oriente rostro completo', outPath, { phoneLeft, phoneTop, phoneW, phoneH, white });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

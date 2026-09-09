/**
 * Pieza B2B v5 — diseño experto: alineación, URL fuerte, timbre FOMO,
 * copy psicológico + ticket “Otros” (8 servicios / crear el tuyo).
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
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-photo-clean-v4b.png';
const PARTNER = path.join(OUT, 'nunoa-hub-logo.png');
const FONT = BRAND.fontUnbounded;
const W = 1080;
const H = 1080;

// Columna tipográfica fija (alineación profesional)
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

async function main() {
  const photo = await sharp(PHOTO)
    .resize(W, H, { fit: 'cover', position: 'right' })
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
    .eye{font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:600;fill:#6B6560;letter-spacing:0.3px}
    .h1{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:44px;fill:#1A1814}
    .ho{fill:${BRAND.accent}}
    .t{font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;fill:#1A1814}
    .ts{font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:500;fill:#5C5650}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:22px;fill:#FFFFFF}
    .url{font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:800;fill:${BRAND.accent}}
    .stamp1{font-family:Arial Black,Arial,sans-serif;font-size:15px;font-weight:700;fill:${BRAND.accent}}
    .stamp2{font-family:Arial Black,Arial,sans-serif;font-size:18px;font-weight:700;fill:${BRAND.accent}}
  </style>

  <text x="128" y="64" class="brand">Fandez</text>
  <text x="${COL}" y="124" class="eye">RECLUTAMIENTO ESTRATÉGICO DE SOCIOS</text>

  <text x="${COL}" y="178" class="h1">Consigue trabajos</text>
  <text x="${COL}" y="230" class="h1">diarios en <tspan class="ho">Ñuñoa</tspan></text>

  <!-- Banner lanzamiento app -->
  <rect x="${COL}" y="248" width="${COL_W}" height="52" rx="10" fill="#1A1814"/>
  <text x="${COL + COL_W / 2}" y="270" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="600">App Fandez · lanzamiento octubre 2026</text>
  <text x="${COL + COL_W / 2}" y="290" text-anchor="middle" fill="${BRAND.accentSoft}" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="600">Hoy abrimos cupos de socios · activa tu zona</text>

  ${ticket(316, 'Sin costos fijos')}
  ${ticket(374, 'Cobros garantizados')}
  ${ticket(432, 'Trabajos cerca de ti')}
  ${ticket(490, '¿Tu servicio no aparece?', 'Elige Otros y descríbelo en la app')}

  <rect x="${COL}" y="574" width="420" height="56" rx="14" fill="${BRAND.accent}"/>
  <text x="${COL + 210}" y="610" text-anchor="middle" class="cta">Únete gratis como Proveedor</text>

  <!-- URL protagonista: máximo contraste -->
  <rect x="${COL}" y="646" width="420" height="52" rx="12" fill="${BRAND.accent}"/>
  <text x="${COL + 210}" y="682" text-anchor="middle" fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="800">www.fandez.cl</text>

  <!-- Timbre FOMO: centrado bajo URL -->
  <g transform="translate(258, 828) rotate(-4)">
    <g transform="translate(-139, -49)" opacity="0.92">
      <rect x="3" y="3" width="272" height="98" rx="6" fill="none" stroke="${BRAND.accent}" stroke-width="4"/>
      <rect x="12" y="12" width="254" height="80" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="1.8"/>
      <text x="139" y="44" text-anchor="middle" class="stamp1" letter-spacing="1.5">CUPOS LIMITADOS</text>
      <text x="139" y="76" text-anchor="middle" class="stamp2">★ ÑUÑOA ★</text>
    </g>
  </g>
</svg>`);

  const uiPng = await sharp(ui).png().toBuffer();
  const mark = await sharp(Buffer.from(appMarkSvg(76))).png().toBuffer();

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

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-nunoa-v5.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: mark, left: 42, top: 26 },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  for (const name of [
    'fandez-ig-b2b-proveedor-nunoa-v5.png',
    'fandez-ig-b2b-proveedor-nunoa-v4.png',
    'fandez-ig-b2b-proveedor-nunoa-v3.png',
    'fandez-ig-b2b-proveedor-nunoa-v1.png'
  ]) {
    const p = path.join(OUT, name);
    if (name !== 'fandez-ig-b2b-proveedor-nunoa-v5.png') {
      await fs.promises.copyFile(outPath, p);
    }
    fs.mkdirSync(PUB, { recursive: true });
    fs.mkdirSync(EASY, { recursive: true });
    await fs.promises.copyFile(outPath, path.join(PUB, name));
    await fs.promises.copyFile(outPath, path.join(EASY, name));
  }

  console.log('ok v5 expert', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

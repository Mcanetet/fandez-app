/**
 * Pieza B2B limpia: foto + tipografía controlada (sin parches).
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

function fontCss() {
  if (!fs.existsSync(FONT)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(FONT).href}') format('woff2');font-weight:700;}`;
}

function appMarkSvg(size = 78) {
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#FFFFFF"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" stroke="${BRAND.accent}" stroke-width="2"/>
  <g transform="translate(24, 24.5) scale(0.26) translate(-60, -71)">
    <path fill="none" stroke="${BRAND.accent}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER_PATH}"/>
  </g></svg>`;
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
      <stop offset="0%" stop-color="#F7F3EE" stop-opacity="0.96"/>
      <stop offset="42%" stop-color="#F7F3EE" stop-opacity="0.88"/>
      <stop offset="58%" stop-color="#F7F3EE" stop-opacity="0.25"/>
      <stop offset="70%" stop-color="#F7F3EE" stop-opacity="0"/>
    </linearGradient>
    ${fontCss()}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wash)"/>

  <style>
    .brand{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:26px;fill:#1A1814}
    .h1{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:46px;fill:#1A1814}
    .ho{fill:${BRAND.accent}}
    .b{font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:600;fill:#1A1814}
    .bs{font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:600;fill:#1A1814}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:24px;fill:#FFFFFF}
    .url{font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;fill:${BRAND.accent}}
    .scar{font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;fill:${BRAND.accent};letter-spacing:0.5px}
  </style>

  <text x="132" y="72" class="brand">Fandez</text>

  <text x="48" y="170" class="h1">Consigue</text>
  <text x="48" y="224" class="h1">trabajos diarios</text>
  <text x="48" y="278" class="h1">en <tspan class="ho">Ñuñoa</tspan></text>

  <!-- tickets / beneficios (4) -->
  <g transform="translate(48,310)">
    <rect x="0" y="-20" width="460" height="46" rx="11" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="24" cy="3" r="10" fill="${BRAND.accent}"/>
    <path d="M18 3 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <text x="44" y="9" class="b">Sin costos fijos</text>
  </g>
  <g transform="translate(48,368)">
    <rect x="0" y="-20" width="460" height="46" rx="11" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="24" cy="3" r="10" fill="${BRAND.accent}"/>
    <path d="M18 3 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <text x="44" y="9" class="b">Cobros garantizados</text>
  </g>
  <g transform="translate(48,426)">
    <rect x="0" y="-20" width="460" height="46" rx="11" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="24" cy="3" r="10" fill="${BRAND.accent}"/>
    <path d="M18 3 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <text x="44" y="9" class="b">Trabajos cerca de ti</text>
  </g>
  <g transform="translate(48,484)">
    <rect x="0" y="-20" width="480" height="46" rx="11" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="24" cy="3" r="10" fill="${BRAND.accent}"/>
    <path d="M18 3 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <text x="44" y="9" class="bs">Crea el servicio que haces a domicilio</text>
  </g>

  <rect x="48" y="560" width="400" height="60" rx="14" fill="${BRAND.accent}"/>
  <text x="248" y="598" text-anchor="middle" class="cta">Únete gratis como Proveedor</text>

  <text x="48" y="660" class="url">www.fandez.cl</text>

  <!-- scarcity chip limpio -->
  <rect x="48" y="690" width="280" height="40" rx="20" fill="#FFFFFF" fill-opacity="0.92" stroke="${BRAND.accent}" stroke-width="1.5"/>
  <text x="188" y="716" text-anchor="middle" class="scar">CUPOS LIMITADOS · ÑUÑOA</text>
</svg>`);

  const uiPng = await sharp(ui).png().toBuffer();
  const mark = await sharp(Buffer.from(appMarkSvg(78))).png().toBuffer();

  const partnerBuf = await sharp(PARTNER).resize({ width: 150 }).png().toBuffer();
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

  const pad = 20;
  const hubLeft = W - pad - bw;
  const hubTop = H - pad - bh;

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-nunoa-v4.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: mark, left: 42, top: 28 },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  // también como principal v1/v3
  for (const name of [
    'fandez-ig-b2b-proveedor-nunoa-v4.png',
    'fandez-ig-b2b-proveedor-nunoa-v3.png',
    'fandez-ig-b2b-proveedor-nunoa-v1.png'
  ]) {
    const p = path.join(OUT, name);
    if (name !== 'fandez-ig-b2b-proveedor-nunoa-v4.png') {
      await fs.promises.copyFile(outPath, p);
    }
    fs.mkdirSync(PUB, { recursive: true });
    fs.mkdirSync(EASY, { recursive: true });
    await fs.promises.copyFile(outPath, path.join(PUB, name));
    await fs.promises.copyFile(outPath, path.join(EASY, name));
  }

  console.log('ok v4 clean design', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

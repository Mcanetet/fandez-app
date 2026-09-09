/**
 * B2B v1: técnico cuerpo continuo + Hub abajo en franja con fondo (sin tapar cuerpo).
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
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-tech-photo-base.png';
const PARTNER = path.join(OUT, 'nunoa-hub-logo.png');
const FONT = BRAND.fontUnbounded;
const W = 1080;
const H = 1080;
const FOOTER = 118;

function fontCss() {
  if (!fs.existsSync(FONT)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(FONT).href}') format('woff2');font-weight:700;}`;
}

function appMarkSvg(size = 84) {
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#FFFFFF"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" stroke="${BRAND.accent}" stroke-width="2"/>
  <g transform="translate(24, 24.5) scale(0.26) translate(-60, -71)">
    <path fill="none" stroke="${BRAND.accent}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER_PATH}"/>
  </g></svg>`;
}

async function main() {
  const photoH = H - FOOTER;

  const hero = await sharp(PHOTO)
    .resize(W, photoH, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const ui = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${photoH}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F7F3EE" stop-opacity="0.97"/>
      <stop offset="50%" stop-color="#F7F3EE" stop-opacity="0.9"/>
      <stop offset="64%" stop-color="#F7F3EE" stop-opacity="0.18"/>
      <stop offset="74%" stop-color="#F7F3EE" stop-opacity="0"/>
    </linearGradient>
    ${fontCss()}
  </defs>
  <rect width="${W}" height="${photoH}" fill="url(#g)"/>
  <style>
    .ey{font-family:Arial,Helvetica,sans-serif;font-size:21px;fill:#1A1814}
    .h{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:40px;fill:#1A1814}
    .ho{fill:${BRAND.accent}}
    .sub{font-family:Arial,Helvetica,sans-serif;font-size:20px;fill:#3D3935}
    .b{font-family:Arial,Helvetica,sans-serif;font-size:22px;fill:#1A1814;font-weight:600}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:23px;fill:#FFFFFF}
    .url{font-family:Arial,Helvetica,sans-serif;font-size:20px;fill:${BRAND.accent};font-weight:700}
    .brand{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:27px;fill:#1A1814}
  </style>
  <text x="40" y="140" class="ey">¿Buscas más clientes para tu Pyme o servicio técnico?</text>
  <text x="40" y="200" class="h">Consigue trabajos</text>
  <text x="40" y="250" class="h">diarios en <tspan class="ho">Ñuñoa</tspan></text>
  <text x="40" y="300" class="h">con <tspan class="ho">Fandez</tspan></text>
  <text x="40" y="344" class="sub">Conectamos tu talento con cientos de</text>
  <text x="40" y="370" class="sub">hogares que necesitan tus servicios.</text>

  <rect x="40" y="400" width="460" height="46" rx="12" fill="#FFFFFF" fill-opacity="0.9"/>
  <circle cx="66" cy="423" r="11" fill="${BRAND.accent}"/>
  <path d="M60 423 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <text x="88" y="430" class="b">Sin costos fijos de suscripción</text>

  <rect x="40" y="456" width="460" height="46" rx="12" fill="#FFFFFF" fill-opacity="0.9"/>
  <circle cx="66" cy="479" r="11" fill="${BRAND.accent}"/>
  <path d="M60 479 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <text x="88" y="486" class="b">Cobros garantizados</text>

  <rect x="40" y="512" width="460" height="46" rx="12" fill="#FFFFFF" fill-opacity="0.9"/>
  <circle cx="66" cy="535" r="11" fill="${BRAND.accent}"/>
  <path d="M60 535 l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <text x="88" y="542" class="b">Trabajos cerca de tu ubicación</text>

  <rect x="580" y="390" width="250" height="92" rx="14" fill="#FFFFFF" fill-opacity="0.96"/>
  <rect x="580" y="390" width="250" height="32" rx="14" fill="${BRAND.accent}"/>
  <rect x="580" y="406" width="250" height="16" fill="${BRAND.accent}"/>
  <text x="596" y="412" fill="#fff" font-family="Arial" font-size="14" font-weight="700">Nuevo trabajo asignado</text>
  <text x="596" y="450" fill="${BRAND.accent}" font-family="Unbounded,Arial" font-size="28" font-weight="700">$45.000</text>
  <text x="596" y="472" fill="#1A1814" font-family="Arial" font-size="13">Instalación de grifería · Ñuñoa</text>

  <rect x="40" y="600" width="390" height="56" rx="14" fill="${BRAND.accent}"/>
  <text x="235" y="636" text-anchor="middle" class="cta">Únete gratis como Proveedor</text>
  <text x="40" y="688" class="url">www.fandez.cl</text>
  <text x="136" y="74" class="brand">Fandez</text>
</svg>`);

  const uiPng = await sharp(ui).png().toBuffer();
  const mark = await sharp(Buffer.from(appMarkSvg(84))).png().toBuffer();

  const top = await sharp(hero)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: mark, left: 40, top: 30 }
    ])
    .png()
    .toBuffer();

  const footer = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${FOOTER}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F7F3EE"/>
      <stop offset="100%" stop-color="#EFE8DF"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${FOOTER}" fill="url(#f)"/>
  <rect x="0" y="0" width="${W}" height="3" fill="${BRAND.accent}"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const partnerBuf = await sharp(PARTNER).resize({ width: 168 }).png().toBuffer();
  const pMeta = await sharp(partnerBuf).metadata();
  const inner = 10;
  const bw = pMeta.width + inner * 2;
  const bh = pMeta.height + inner * 2;
  const badge = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}">
  <rect x="0.5" y="0.5" width="${bw - 1}" height="${bh - 1}" rx="12" fill="#FFFFFF" stroke="#E0D7CC" stroke-width="1"/>
</svg>`)
  )
    .png()
    .toBuffer();

  const hubLeft = W - 24 - bw;
  const hubTop = photoH + Math.round((FOOTER - bh) / 2);

  const outPath = path.join(OUT, 'fandez-ig-b2b-proveedor-nunoa-v1.png');
  await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 247, g: 243, b: 238 } }
  })
    .composite([
      { input: top, left: 0, top: 0 },
      { input: footer, left: 0, top: photoH },
      { input: badge, left: hubLeft, top: hubTop },
      { input: partnerBuf, left: hubLeft + inner, top: hubTop + inner }
    ])
    .png()
    .toFile(outPath);

  fs.mkdirSync(EASY, { recursive: true });
  fs.mkdirSync(PUB, { recursive: true });
  await fs.promises.copyFile(outPath, path.join(PUB, 'fandez-ig-b2b-proveedor-nunoa-v1.png'));
  await fs.promises.copyFile(outPath, path.join(EASY, 'fandez-ig-b2b-proveedor-nunoa-v1.png'));
  console.log('ok continuous body + hub in footer', { hubLeft, hubTop });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

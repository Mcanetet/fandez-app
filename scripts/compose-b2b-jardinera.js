/**
 * Pieza B2B jardinera v2 — sin disonancia: Jardinería en catálogo + pago visible.
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
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-jardinera-photo-v2.png';
const PARTNER = path.join(OUT, 'nunoa-hub-logo.png');
const FONT = BRAND.fontUnbounded;
const W = 1080;
const H = 1080;
const COL = 44;
const COL_W = 500;

// Jardinería primero y destacada — buyer persona de la pieza
const SERVICES = [
  { name: 'Jardinería', featured: true },
  { name: 'Eléctrico' },
  { name: 'Gásfiter' },
  { name: 'Cerrajero' },
  { name: 'Termos' },
  { name: 'Lavavajillas' },
  { name: 'Lavadora' },
  { name: 'Calderas' },
  { name: 'Generadores' },
  { name: 'Pintura' }
];

function fontCss() {
  if (!fs.existsSync(FONT)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(FONT).href}') format('woff2');font-weight:700;}`;
}

function appMarkSvg(size = 72) {
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

  const chipW = 232;
  const chipH = 30;
  const gapX = 10;
  const gapY = 6;
  const chipsStart = 318;
  let chipParts = '';
  SERVICES.forEach((svc, i) => {
    const c = i % 2;
    const r = Math.floor(i / 2);
    const x = COL + c * (chipW + gapX);
    const y = chipsStart + r * (chipH + gapY);
    if (svc.featured) {
      chipParts += `
    <rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="8" fill="#FFF4EB" stroke="${BRAND.accent}" stroke-width="1.8"/>
    <circle cx="${x + 14}" cy="${y + chipH / 2}" r="4.5" fill="${BRAND.accent}"/>
    <text x="${x + 28}" y="${y + 20}" class="svcFeat">${svc.name}</text>`;
    } else {
      chipParts += `
    <rect x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="8" fill="#FFFFFF" fill-opacity="0.94"/>
    <circle cx="${x + 14}" cy="${y + chipH / 2}" r="4.5" fill="${BRAND.accent}"/>
    <text x="${x + 28}" y="${y + 20}" class="svc">${svc.name}</text>`;
    }
  });

  // 10 servicios = 5 filas
  const listEnd = chipsStart + 5 * (chipH + gapY) + 8;
  const ctaY = listEnd + 8;
  const stampY = Math.min(ctaY + 100, 900);

  const ui = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F7F3EE" stop-opacity="0.97"/>
      <stop offset="44%" stop-color="#F7F3EE" stop-opacity="0.9"/>
      <stop offset="58%" stop-color="#F7F3EE" stop-opacity="0.22"/>
      <stop offset="70%" stop-color="#F7F3EE" stop-opacity="0"/>
    </linearGradient>
    <filter id="payShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0A2E18" flood-opacity="0.35"/>
    </filter>
    ${fontCss()}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wash)"/>
  <style>
    .brand{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:24px;fill:#1A1814}
    .eye{font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;fill:#6B6560;letter-spacing:0.35px}
    .h1{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:30px;fill:#1A1814}
    .ho{fill:${BRAND.accent}}
    .comunas{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;fill:#6B6560}
    .sec{font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;fill:#1A1814}
    .svc{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;fill:#1A1814}
    .svcFeat{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;fill:${BRAND.accent}}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:17px;fill:#FFFFFF}
    .banner{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;fill:#FFFFFF}
    .stamp1{font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:700;fill:${BRAND.accent}}
    .stamp2{font-family:Arial Black,Arial,sans-serif;font-size:12px;font-weight:700;fill:${BRAND.accent}}
    .payAmt{font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;fill:#FFFFFF}
    .payLbl{font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;fill:#D4F5DF}
    .paySub{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;fill:#FFFFFF}
  </style>

  <text x="122" y="52" class="brand">Fandez</text>
  <text x="${COL}" y="96" class="eye">RECLUTAMIENTO ESTRATÉGICO DE SOCIOS</text>

  <text x="${COL}" y="138" class="h1">Jardineras y Jardineros</text>
  <text x="${COL}" y="174" class="h1">consiguen trabajos</text>
  <text x="${COL}" y="210" class="h1">diarios en <tspan class="ho">Zona Oriente</tspan></text>
  <text x="${COL}" y="236" class="comunas">Providencia · Las Condes · Ñuñoa · La Reina · Vitacura</text>

  <rect x="${COL}" y="250" width="${COL_W}" height="36" rx="10" fill="#1A1814"/>
  <text x="${COL + COL_W / 2}" y="273" text-anchor="middle" class="banner">Lanzamiento Octubre 2026 · Registro de Socios Abierto</text>

  <text x="${COL}" y="306" class="sec">Servicios en la app:</text>
  ${chipParts}

  <rect x="${COL}" y="${ctaY}" width="420" height="52" rx="14" fill="${BRAND.accent}"/>
  <text x="${COL + 210}" y="${ctaY + 33}" text-anchor="middle" class="cta">ÚNETE GRATIS EN FANDEZ.CL</text>

  <g transform="translate(258, ${stampY}) rotate(-4)">
    <g transform="translate(-150, -40)" opacity="0.92">
      <rect x="3" y="3" width="300" height="80" rx="6" fill="none" stroke="${BRAND.accent}" stroke-width="3.5"/>
      <rect x="11" y="11" width="284" height="64" rx="4" fill="none" stroke="${BRAND.accent}" stroke-width="1.6"/>
      <text x="150" y="38" text-anchor="middle" class="stamp1">★ CUPOS LIMITADOS ★</text>
      <text x="150" y="60" text-anchor="middle" class="stamp2">SANTIAGO ORIENTE</text>
    </g>
  </g>

  <!-- Pop-up verde: dopamina / prueba de pago (sobre zona del celular) -->
  <g transform="translate(620, 390)" filter="url(#payShadow)">
    <rect x="0" y="0" width="280" height="118" rx="16" fill="#0F3D24"/>
    <rect x="6" y="6" width="268" height="106" rx="12" fill="#167A3C"/>
    <text x="140" y="32" text-anchor="middle" class="payLbl">✓ PAGO RECIBIDO</text>
    <text x="140" y="68" text-anchor="middle" class="payAmt">$45.000</text>
    <text x="140" y="94" text-anchor="middle" class="paySub">Mantención de Jardín</text>
  </g>
</svg>`);

  const uiPng = await sharp(ui).png().toBuffer();
  const mark = await sharp(Buffer.from(appMarkSvg(72))).png().toBuffer();
  const partnerBuf = await sharp(PARTNER).resize({ width: 140 }).png().toBuffer();
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

  const outPath = path.join(OUT, 'fandez-ig-b2b-jardinera-oriente-v2.png');
  await sharp(photo)
    .composite([
      { input: uiPng, left: 0, top: 0 },
      { input: mark, left: 40, top: 18 },
      { input: badge, left: W - 18 - bw, top: H - 18 - bh },
      { input: partnerBuf, left: W - 18 - bw + inner, top: H - 18 - bh + inner }
    ])
    .png()
    .toFile(outPath);

  // Alias v1 actualizado + copias
  const alias = path.join(OUT, 'fandez-ig-b2b-jardinera-oriente-v1.png');
  fs.mkdirSync(PUB, { recursive: true });
  fs.mkdirSync(EASY, { recursive: true });
  await fs.promises.copyFile(outPath, alias);
  for (const name of [
    'fandez-ig-b2b-jardinera-oriente-v2.png',
    'fandez-ig-b2b-jardinera-oriente-v1.png'
  ]) {
    await fs.promises.copyFile(outPath, path.join(PUB, name));
    await fs.promises.copyFile(outPath, path.join(EASY, name));
  }
  console.log('ok jardinera v2', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

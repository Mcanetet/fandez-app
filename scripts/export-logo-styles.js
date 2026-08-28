/**
 * Genera 5 estilos de logo Fandez × 2 (con marca / sin marca).
 * Uso: node scripts/export-logo-styles.js
 *
 * 1 Contorno · 2 Sólido · 3 Ícono app · 4 Sello · 5 Negativo
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/logo-estilos');
const FONT = path.join(ROOT, 'public/fonts/unbounded-700.woff2');
const SIZE = 1100;
const MARGIN = 0.06;

const PLUNGER =
  'M60 22 C78 22 92 34 94 50 C95 58 92 66 84 70 C98 74 108 84 108 96 C108 112 86 122 60 122 C34 122 12 112 12 96 C12 84 22 74 36 70 C28 66 25 58 26 50 C28 34 42 22 60 22 Z';

const STYLES = [
  {
    id: '01',
    slug: 'contorno',
    name: 'Contorno',
    blurb: 'Trazo abierto, versión oficial actual. Interior transparente.'
  },
  {
    id: '02',
    slug: 'solido',
    name: 'Sólido',
    blurb: 'Copa rellena ámbar. Más peso visual, icono denso.'
  },
  {
    id: '03',
    slug: 'icono-app',
    name: 'Ícono app',
    blurb: 'Cuadrado ámbar redondeado + símbolo blanco (home screen).'
  },
  {
    id: '04',
    slug: 'sello',
    name: 'Sello',
    blurb: 'Círculo carbón con contorno ámbar. Aspecto de marca/certificación.'
  },
  {
    id: '05',
    slug: 'negativo',
    name: 'Negativo',
    blurb: 'Campo carbón + trazo ámbar. Para fondos oscuros y merchandising.'
  }
];

function markSvg({ fill, stroke, strokeWidth = 14, size = 220 }) {
  const fillAttr = fill ? `fill="${fill}"` : 'fill="none"';
  const strokeAttr = stroke
    ? `stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`
    : 'stroke="none"';
  return `<svg width="${size}" height="${Math.round((size * 130) / 120)}" viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path ${fillAttr} ${strokeAttr} d="${PLUNGER}"/>
  </svg>`;
}

function styleMark(styleId, forDarkBg = false) {
  switch (styleId) {
    case '01': // contorno
      return markSvg({ stroke: forDarkBg ? '#FFFFFF' : '#C45C14', strokeWidth: 14, size: 210 });
    case '02': // sólido
      return markSvg({ fill: forDarkBg ? '#FFFFFF' : '#C45C14', size: 210 });
    case '03': // icono app — el “mark” es el tile completo
      return `<svg width="210" height="210" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="112" height="112" rx="28" fill="#C45C14"/>
        <g transform="translate(60,62) scale(0.62) translate(-60,-72)">
          <path fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
        </g>
      </svg>`;
    case '04': // sello
      return `<svg width="220" height="220" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="54" fill="#1A1814"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="#C45C14" stroke-width="4"/>
        <g transform="translate(60,62) scale(0.52) translate(-60,-72)">
          <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
        </g>
      </svg>`;
    case '05': // negativo — tile carbón
      return `<svg width="210" height="210" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="112" height="112" rx="28" fill="#1A1814"/>
        <g transform="translate(60,62) scale(0.62) translate(-60,-72)">
          <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
        </g>
      </svg>`;
    default:
      return markSvg({ stroke: '#C45C14' });
  }
}

function pageBg(styleId) {
  // Fondos claros para export; 03/04/05 ya traen su propio campo
  return '#FFFFFF';
}

function wordColor(styleId) {
  return '#1A1814';
}

async function packSquare(pngBuffer, outPath) {
  const sharp = require('sharp');
  const trimmed = await sharp(pngBuffer)
    .flatten({ background: '#FFFFFF' })
    .trim({ threshold: 10 })
    .png()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;
  const inner = Math.round(SIZE * (1 - MARGIN * 2));
  const scale = Math.min(inner / width, inner / height);
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));
  const left = Math.round((SIZE - cw) / 2);
  const top = Math.round((SIZE - ch) / 2);
  const resized = await sharp(trimmed.data).resize(cw, ch).png().toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: '#FFFFFF' }
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 93, mozjpeg: true })
    .toFile(outPath);
}

async function render(page, { style, withWordmark, fontB64 }) {
  const mark = styleMark(style.id);
  const gap = withWordmark ? '26px' : '0';
  const pad = withWordmark ? '44px 52px 40px' : '48px';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@font-face{
  font-family:'Unbounded';
  src:url(data:font/woff2;base64,${fontB64}) format('woff2');
  font-weight:700; font-style:normal; font-display:block;
}
html,body{margin:0;background:${pageBg(style.id)};}
#lockup{
  display:inline-flex; flex-direction:column; align-items:center;
  gap:${gap}; padding:${pad}; background:${pageBg(style.id)};
}
#lockup .wm{
  font-family:Unbounded,sans-serif; font-weight:700; font-size:84px;
  letter-spacing:-0.03em; color:${wordColor(style.id)}; line-height:1; white-space:nowrap;
}
</style></head><body>
<div id="lockup">
  ${mark}
  ${withWordmark ? '<span class="wm">Fandez</span>' : ''}
</div>
</body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  if (withWordmark) {
    await page.evaluate(async () => {
      await document.fonts.load('700 84px Unbounded');
      await document.fonts.ready;
    });
    for (let i = 0; i < 25; i++) {
      const ok = await page.evaluate(() => document.fonts.check('700 84px Unbounded'));
      if (ok) break;
      await page.waitForTimeout(40);
    }
  }
  return page.locator('#lockup').screenshot({ type: 'png' });
}

function writeIndex(rows) {
  const cards = rows
    .map(
      (r) => `
    <article class="card">
      <header>
        <span class="n">${r.style.id}</span>
        <h2>${r.style.name}</h2>
        <p>${r.style.blurb}</p>
      </header>
      <div class="pair">
        <figure>
          <img src="${path.basename(r.sin)}" alt="${r.style.name} sin marca">
          <figcaption>Sin marca</figcaption>
        </figure>
        <figure>
          <img src="${path.basename(r.con)}" alt="${r.style.name} con marca">
          <figcaption>Con marca</figcaption>
        </figure>
      </div>
    </article>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fandez — 5 estilos de logo</title>
  <style>
    :root { --ink:#1A1814; --muted:#6B635A; --bg:#F4F2EE; --amber:#C45C14; --border:#E6E0D8; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 2rem 1.2rem 3rem; }
    h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    .lead { color: var(--muted); max-width: 40rem; margin-bottom: 1.5rem; }
    .card {
      background:#fff; border:1px solid var(--border); border-radius:1rem;
      padding:1.15rem; margin-bottom:1rem;
    }
    .n { font-size:0.68rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--amber); }
    h2 { margin:0.2rem 0; font-size:1.25rem; letter-spacing:-0.02em; }
    header p { margin:0; color:var(--muted); font-size:0.92rem; }
    .pair { display:grid; gap:0.75rem; margin-top:0.9rem; }
    @media (min-width:700px) { .pair { grid-template-columns:1fr 1fr; } }
    figure { margin:0; }
    figure img {
      width:100%; aspect-ratio:1; object-fit:contain; background:#fff;
      border:1px solid var(--border); border-radius:0.75rem; display:block;
    }
    figcaption {
      text-align:center; font-size:0.72rem; font-weight:700; letter-spacing:0.06em;
      text-transform:uppercase; color:var(--muted); margin-top:0.4rem;
    }
    footer { text-align:center; color:var(--muted); font-size:0.8rem; margin-top:1.5rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>5 estilos de logo</h1>
    <p class="lead">Cada estilo tiene versión <strong>sin marca</strong> (solo símbolo) y <strong>con marca</strong> (símbolo + Fandez en Unbounded Bold). Dime el número (01–05) y si lo quieres con o sin texto.</p>
    ${cards}
    <footer>docs/logo-estilos · regenerar: <code>node scripts/export-logo-styles.js</code></footer>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

async function main() {
  if (!fs.existsSync(FONT)) throw new Error('Falta public/fonts/unbounded-700.woff2');
  const { chromium } = require('@playwright/test');
  fs.mkdirSync(OUT, { recursive: true });
  const fontB64 = fs.readFileSync(FONT).toString('base64');

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 900, height: 1100 },
    deviceScaleFactor: 2
  });

  const rows = [];
  for (const style of STYLES) {
    const sinPath = path.join(OUT, `fandez-${style.id}-${style.slug}-sin-marca.jpg`);
    const conPath = path.join(OUT, `fandez-${style.id}-${style.slug}-con-marca.jpg`);

    const sinPng = await render(page, { style, withWordmark: false, fontB64 });
    const conPng = await render(page, { style, withWordmark: true, fontB64 });
    await packSquare(sinPng, sinPath);
    await packSquare(conPng, conPath);

    rows.push({ style, sin: sinPath, con: conPath });
    console.log('✓', path.relative(ROOT, sinPath));
    console.log('✓', path.relative(ROOT, conPath));
  }

  await browser.close();
  writeIndex(rows);
  console.log('✓', path.relative(ROOT, path.join(OUT, 'index.html')));
  console.log('\nAbre: docs/logo-estilos/index.html');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

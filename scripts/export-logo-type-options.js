/**
 * Genera 3 opciones de logo (isotipo + wordmark) con tipografías tech distintas.
 * Uso: node scripts/export-logo-type-options.js
 *
 * A) Syne ExtraBold — identidad / marca
 * B) Unbounded Bold — tech display contemporánea
 * C) Space Grotesk Bold — startup / producto digital
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/logo-opciones');
const MARGIN = 0.05;
const SIDE = 1200;

const PLUNGER =
  'M60 22 C78 22 92 34 94 50 C95 58 92 66 84 70 C98 74 108 84 108 96 C108 112 86 122 60 122 C34 122 12 112 12 96 C12 84 22 74 36 70 C28 66 25 58 26 50 C28 34 42 22 60 22 Z';

const OPTIONS = [
  {
    id: 'A',
    slug: 'syne',
    name: 'Syne ExtraBold',
    file: 'syne-800.woff2',
    weight: 800,
    tracking: '-0.045em',
    pitch: 'Identidad de marca. Geometría con carácter; se aleja de Inter/Arial.',
    vibe: 'Oficio + plataforma'
  },
  {
    id: 'B',
    slug: 'unbounded',
    name: 'Unbounded Bold',
    file: 'unbounded-700.woff2',
    weight: 700,
    tracking: '-0.03em',
    pitch: 'Display tech actual. Terminales cuadrados; se lee “producto digital”.',
    vibe: 'Futuro / app nativa'
  },
  {
    id: 'C',
    slug: 'space-grotesk',
    name: 'Space Grotesk Bold',
    file: 'space-grotesk-700.woff2',
    weight: 700,
    tracking: '-0.035em',
    pitch: 'Clásico de startups tech. Limpia, confiable, muy usada en SaaS.',
    vibe: 'Startup / SaaS'
  }
];

async function packSquare(pngBuffer, outPath) {
  const sharp = require('sharp');
  const trimmed = await sharp(pngBuffer)
    .flatten({ background: '#FFFFFF' })
    .trim({ threshold: 12 })
    .png()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;
  const inner = Math.round(SIDE * (1 - MARGIN * 2));
  const scale = Math.min(inner / width, inner / height);
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));
  const left = Math.round((SIDE - cw) / 2);
  const top = Math.round((SIDE - ch) / 2);
  const resized = await sharp(trimmed.data).resize(cw, ch).png().toBuffer();

  await sharp({
    create: { width: SIDE, height: SIDE, channels: 3, background: '#FFFFFF' }
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 93, mozjpeg: true })
    .toFile(outPath);
}

async function renderLockup(page, opt, layout) {
  const fontB64 = fs
    .readFileSync(path.join(ROOT, 'public/fonts', opt.file))
    .toString('base64');

  const isStack = layout === 'stack';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@font-face{
  font-family:'Brand';
  src:url(data:font/woff2;base64,${fontB64}) format('woff2');
  font-weight:${opt.weight};
  font-style:normal;
  font-display:block;
}
html,body{margin:0;background:#fff}
#lockup{
  display:inline-flex;
  flex-direction:${isStack ? 'column' : 'row'};
  align-items:center;
  gap:${isStack ? '28px' : '34px'};
  padding:${isStack ? '48px 56px 44px' : '40px 52px'};
  background:#fff;
}
#lockup svg{width:${isStack ? '210px' : '150px'};height:${isStack ? '228px' : '163px'};display:block}
#lockup .wm{
  font-family:Brand,sans-serif;
  font-weight:${opt.weight};
  font-size:${isStack ? '92px' : '108px'};
  letter-spacing:${opt.tracking};
  color:#1A1814;
  line-height:1;
  white-space:nowrap;
}
</style></head><body>
<div id="lockup">
  <svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
  </svg>
  <span class="wm">Fandez</span>
</div>
</body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async (w) => {
    await document.fonts.load(w + ' 96px Brand');
    await document.fonts.ready;
  }, String(opt.weight));
  for (let i = 0; i < 30; i++) {
    const ok = await page.evaluate((w) => document.fonts.check(w + ' 96px Brand'), String(opt.weight));
    if (ok) break;
    await page.waitForTimeout(40);
  }
  return page.locator('#lockup').screenshot({ type: 'png' });
}

function writeCompareHtml(files) {
  const cards = OPTIONS.map((opt, i) => {
    const f = files[i];
    return `
    <article class="card">
      <header>
        <span class="opt">Opción ${opt.id}</span>
        <h2>${opt.name}</h2>
        <p class="vibe">${opt.vibe}</p>
      </header>
      <div class="preview light">
        <img src="${path.basename(f.stack)}" alt="Fandez · ${opt.name}">
      </div>
      <div class="preview dark">
        <img src="${path.basename(f.stack)}" alt="">
      </div>
      <p class="pitch">${opt.pitch}</p>
      <p class="file"><code>${path.basename(f.stack)}</code></p>
    </article>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fandez — 3 tipografías para el logo</title>
  <style>
    :root { --ink:#1A1814; --muted:#6B635A; --bg:#F4F2EE; --amber:#C45C14; --border:#E6E0D8; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -0.03em; margin: 0 0 0.4rem; }
    .lead { color: var(--muted); max-width: 40rem; margin-bottom: 1.75rem; }
    .grid { display: grid; gap: 1.1rem; }
    @media (min-width: 900px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    .card {
      background: #fff; border: 1px solid var(--border); border-radius: 1rem;
      padding: 1.1rem; display: flex; flex-direction: column; gap: 0.75rem;
    }
    .opt {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--amber);
    }
    h2 { margin: 0.15rem 0; font-size: 1.15rem; letter-spacing: -0.02em; }
    .vibe { margin: 0; font-size: 0.85rem; color: var(--muted); }
    .preview {
      border-radius: 0.75rem; border: 1px solid var(--border);
      overflow: hidden; aspect-ratio: 1; display: grid; place-items: center;
      background: #fff;
    }
    .preview img { width: 100%; height: 100%; object-fit: contain; }
    .preview.dark { background: #1A1814; }
    .preview.dark img { filter: none; mix-blend-mode: lighten; }
    /* On dark: show white version by inverting only if needed — better: keep light card as main */
    .preview.dark { display: none; }
    .pitch { margin: 0; font-size: 0.9rem; color: var(--muted); line-height: 1.45; flex: 1; }
    .file { margin: 0; font-size: 0.72rem; color: var(--muted); }
    code { font-size: 0.78em; }
    footer { margin-top: 2rem; font-size: 0.8rem; color: var(--muted); text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Elige tipografía del logo</h1>
    <p class="lead">Mismo isotipo (sopapo → infinito). Tres wordmarks de empresas tech de servicios. Abre cada JPG o mira las tres aquí.</p>
    <div class="grid">${cards}</div>
    <footer>Fandez · comparación tipográfica · regenerar con <code>node scripts/export-logo-type-options.js</code></footer>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

async function main() {
  const { chromium } = require('@playwright/test');
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1200 },
    deviceScaleFactor: 2
  });

  const files = [];
  for (const opt of OPTIONS) {
    const stackPng = await renderLockup(page, opt, 'stack');
    const horizPng = await renderLockup(page, opt, 'row');
    const stackJpg = path.join(OUT, `fandez-opcion-${opt.id}-${opt.slug}.jpg`);
    const horizJpg = path.join(OUT, `fandez-opcion-${opt.id}-${opt.slug}-horizontal.jpg`);
    await packSquare(stackPng, stackJpg);
    await packSquare(horizPng, horizJpg);
    files.push({ stack: stackJpg, horiz: horizJpg });
    console.log('✓', path.relative(ROOT, stackJpg));
    console.log('✓', path.relative(ROOT, horizJpg));
  }

  await browser.close();
  writeCompareHtml(files);
  console.log('✓', path.relative(ROOT, path.join(OUT, 'index.html')));
  console.log('\nAbre: docs/logo-opciones/index.html');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

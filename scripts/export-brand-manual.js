/**
 * Exporta el manual de marca a PDF y los ejemplares JPG para INAPI.
 * Uso: node scripts/export-brand-manual.js
 *
 * INAPI: JPG/PNG, mín. 850×850, máx. 3700×3700, ≤ 2 MB
 * Wordmark oficial: Unbounded Bold (opción B).
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const INAPI = path.join(DOCS, 'inapi');
const FONT_PATH = path.join(ROOT, 'public/fonts/unbounded-700.woff2');
const MARGIN = 0.04;
const MIN = 850;
const MAX = 2000;

const PLUNGER =
  'M60 22 C78 22 92 34 94 50 C95 58 92 66 84 70 C98 74 108 84 108 96 C108 112 86 122 60 122 C34 122 12 112 12 96 C12 84 22 74 36 70 C28 66 25 58 26 50 C28 34 42 22 60 22 Z';

function isotipoSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="0 0 120 130">
  <rect x="-80" y="-80" width="280" height="290" fill="#FFFFFF"/>
  <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
</svg>`;
}

async function packToSquare(pngBuffer, outPath) {
  const sharp = require('sharp');
  const trimmed = await sharp(pngBuffer)
    .flatten({ background: '#FFFFFF' })
    .trim({ threshold: 12 })
    .png()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = trimmed.info;
  let side = Math.max(MIN, Math.ceil(Math.max(width, height) / (1 - MARGIN * 2)));
  side = Math.min(side, MAX);

  const inner = Math.round(side * (1 - MARGIN * 2));
  const scale = Math.min(inner / width, inner / height);
  const contentW = Math.max(1, Math.round(width * scale));
  const contentH = Math.max(1, Math.round(height * scale));
  const left = Math.round((side - contentW) / 2);
  const top = Math.round((side - contentH) / 2);
  const resized = await sharp(trimmed.data).resize(contentW, contentH).png().toBuffer();

  await sharp({
    create: { width: side, height: side, channels: 3, background: '#FFFFFF' }
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outPath);

  return { side, contentW, contentH };
}

async function renderMixta(page) {
  const fontB64 = fs.readFileSync(FONT_PATH).toString('base64');
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Unbounded';
    src: url(data:font/woff2;base64,${fontB64}) format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: block;
  }
  html, body { margin: 0; background: #fff; }
  #lockup {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    padding: 48px 56px 44px;
    background: #fff;
  }
  #lockup svg { width: 220px; height: 238px; display: block; }
  #lockup .wm {
    font-family: Unbounded, sans-serif;
    font-weight: 700;
    font-size: 88px;
    letter-spacing: -0.03em;
    color: #1A1814;
    line-height: 1;
    white-space: nowrap;
  }
</style>
</head><body>
  <div id="lockup">
    <svg viewBox="0 0 120 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER}"/>
    </svg>
    <span class="wm">Fandez</span>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
  for (let i = 0; i < 30; i++) {
    const ok = await page.evaluate(() => document.fonts.check('700 88px Unbounded'));
    if (ok) break;
    await page.waitForTimeout(50);
  }
  await page.evaluate(async () => {
    await document.fonts.load('700 88px Unbounded');
    await document.fonts.ready;
  });
  const info = await page.evaluate(() => {
    const el = document.querySelector('.wm');
    return { family: getComputedStyle(el).fontFamily, width: Math.round(el.getBoundingClientRect().width) };
  });
  console.log('  Unbounded:', info);
  return page.locator('#lockup').screenshot({ type: 'png' });
}

async function main() {
  const sharp = require('sharp');
  const { chromium } = require('@playwright/test');
  if (!fs.existsSync(FONT_PATH)) throw new Error('Falta public/fonts/unbounded-700.woff2');
  fs.mkdirSync(INAPI, { recursive: true });

  const isoPath = path.join(INAPI, 'fandez-isotipo.jpg');
  const mixPath = path.join(INAPI, 'fandez-mixta.jpg');

  const isoSvg = await sharp(Buffer.from(isotipoSvg())).png().toBuffer();
  const iso = await packToSquare(isoSvg, isoPath);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 900, height: 1100 },
    deviceScaleFactor: 2
  });
  const mixtaPng = await renderMixta(page);
  const mix = await packToSquare(mixtaPng, mixPath);

  console.log(
    '✓',
    path.relative(ROOT, isoPath),
    `${iso.side}x${iso.side}`,
    `logo ${iso.contentW}x${iso.contentH}`,
    Math.round(fs.statSync(isoPath).size / 1024) + ' KB'
  );
  console.log(
    '✓',
    path.relative(ROOT, mixPath),
    `${mix.side}x${mix.side}`,
    `logo ${mix.contentW}x${mix.contentH}`,
    Math.round(fs.statSync(mixPath).size / 1024) + ' KB'
  );

  await page.goto(pathToFileURL(path.join(DOCS, 'manual-marca.html')).href, {
    waitUntil: 'networkidle',
    timeout: 60_000
  });
  await page.emulateMedia({ media: 'print' });
  const pdf = path.join(DOCS, 'Fandez-Manual-de-Marca.pdf');
  await page.pdf({
    path: pdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' }
  });
  await browser.close();
  console.log('✓', path.relative(ROOT, pdf), Math.round(fs.statSync(pdf).size / 1024) + ' KB');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

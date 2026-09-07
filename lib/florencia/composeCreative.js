/**
 * Composición de piezas: estampa logo oficial Fandez + genera creatividades de campaña.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { BRAND, isotipoSvgMarkup } = require('./brand');

function getSharp() {
  try {
    return require('sharp');
  } catch (_) {
    return null;
  }
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fontFaceCss() {
  const fontPath = BRAND.fontUnbounded;
  if (!fs.existsSync(fontPath)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(fontPath).href}') format('woff2');font-weight:700;font-style:normal;}`;
}

/**
 * Estampa isotipo oficial + wordmark en esquina de una foto (post-IA).
 */
async function stampOfficialLogo(inputPath, outputPath, {
  corner = 'top-left',
  markSize = 96,
  pad = 36,
  variant = 'light' // light | dark
} = {}) {
  const sharp = getSharp();
  if (!sharp) {
    await fs.promises.copyFile(inputPath, outputPath);
    return { stamped: false, reason: 'sharp_unavailable' };
  }

  const stroke = variant === 'dark' ? '#FFFFFF' : BRAND.accent;
  const wordColor = variant === 'dark' ? '#FFFFFF' : BRAND.ink;
  const markSvg = isotipoSvgMarkup({ stroke, size: markSize });
  const markPng = await sharp(Buffer.from(markSvg)).png().toBuffer();

  const wordSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="40">
  <style>${fontFaceCss()} text{font-family:'Unbounded',Arial,sans-serif;font-weight:700;}</style>
  <text x="0" y="30" fill="${wordColor}" font-size="28">Fandez</text>
</svg>`;
  const wordPng = await sharp(Buffer.from(wordSvg)).png().toBuffer();

  const meta = await sharp(inputPath).metadata();
  const w = meta.width || 1024;
  const h = meta.height || 1024;
  const left = corner.includes('right') ? w - pad - markSize - 12 : pad;
  const top = corner.includes('bottom') ? h - pad - markSize - 8 : pad;
  const wordLeft = left + markSize + 10;
  const wordTop = top + Math.round((markSize - 40) / 2);

  await sharp(inputPath)
    .composite([
      { input: markPng, left, top },
      { input: wordPng, left: wordLeft, top: Math.max(8, wordTop) }
    ])
    .png()
    .toFile(outputPath);

  return { stamped: true, width: w, height: h };
}

/**
 * Creatividad plantilla campaña socios (logo oficial, tipografía Unbounded).
 */
async function renderPartnerCampaignCreative({
  format = 'ig-feed', // ig-feed | ig-story | linkedin | tiktok | carousel
  headline = BRAND.taglinePartner,
  sub = BRAND.marketLine,
  cta = BRAND.ctaPartner,
  stepLabel = '',
  outPath
} = {}) {
  const sharp = getSharp();
  if (!sharp) throw new Error('sharp es requerido para generar creatividades de campaña');

  const sizes = {
    'ig-feed': [1080, 1080],
    carousel: [1080, 1080],
    linkedin: [1200, 627],
    'ig-story': [1080, 1920],
    tiktok: [1080, 1920]
  };
  const [W, H] = sizes[format] || sizes['ig-feed'];
  const isTall = H > W;
  const isWide = W > H;

  const markSize = isWide ? 72 : isTall ? 110 : 120;
  const markSvg = isotipoSvgMarkup({ stroke: BRAND.accent, size: markSize });
  const markBuf = await sharp(Buffer.from(markSvg)).png().toBuffer();

  const headlineSize = isWide ? 36 : isTall ? 52 : 48;
  const pad = isWide ? 48 : 64;
  const ctaY = H - (isTall ? 220 : 160);
  const markY = pad;
  const markX = pad;
  const textX = pad;
  const headlineY = isTall ? Math.round(H * 0.42) : Math.round(H * 0.48);
  const headlineLines = String(headline || '').split(/(?<=\.)\s+/).filter(Boolean);
  if (headlineLines.length === 1 && headline.length > 28) {
    const mid = headline.lastIndexOf(' ', Math.floor(headline.length / 2));
    if (mid > 0) {
      headlineLines[0] = headline.slice(0, mid);
      headlineLines[1] = headline.slice(mid + 1);
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>
      ${fontFaceCss()}
      .brand{font-family:'Unbounded',Arial Black,sans-serif;font-weight:700;}
      .body{font-family:Arial,Helvetica,sans-serif;}
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="${BRAND.cream}"/>
  <rect x="0" y="0" width="${W}" height="${Math.round(H * 0.28)}" fill="${BRAND.black}"/>
  <text x="${pad + markSize + 16}" y="${pad + Math.round(markSize * 0.62)}" class="brand" fill="${BRAND.white}" font-size="${isWide ? 28 : 34}">Fandez</text>
  ${stepLabel ? `<text x="${pad}" y="${Math.round(H * 0.36)}" class="body" fill="${BRAND.accent}" font-size="18" font-weight="700">${escapeXml(stepLabel)}</text>` : ''}
  <text x="${textX}" y="${headlineY}" class="brand" fill="${BRAND.ink}" font-size="${headlineSize}">${escapeXml(headlineLines[0] || headline)}</text>
  ${headlineLines[1] ? `<text x="${textX}" y="${headlineY + headlineSize + 12}" class="brand" fill="${BRAND.ink}" font-size="${Math.round(headlineSize * 0.92)}">${escapeXml(headlineLines[1])}</text>` : ''}
  <text x="${textX}" y="${headlineY + headlineSize * (headlineLines[1] ? 2.2 : 1.4) + 28}" class="body" fill="${BRAND.muted}" font-size="${isWide ? 18 : 22}">${escapeXml(sub)}</text>
  <rect x="${pad}" y="${ctaY}" width="${Math.min(440, W - pad * 2)}" height="64" rx="16" fill="${BRAND.accent}"/>
  <text x="${pad + 28}" y="${ctaY + 40}" class="brand" fill="${BRAND.white}" font-size="22">${escapeXml(cta)}</text>
</svg>`;

  const composed = await sharp(Buffer.from(svg))
    .composite([{ input: markBuf, left: markX, top: markY }])
    .png()
    .toBuffer();

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, composed);
  return { path: outPath, width: W, height: H };
}

async function generatePartnerCampaignSet(outDir) {
  const dir = outDir || path.join(__dirname, '../../marketing/lanzamiento-socios');
  await fs.promises.mkdir(dir, { recursive: true });

  const pieces = [
    {
      file: 'fandez-ig-feed-hook.png',
      format: 'ig-feed',
      headline: 'Pedidos listos. Tú eliges.',
      sub: 'Gasfitería, electricidad y más · Santiago'
    },
    {
      file: 'fandez-ig-carousel-01.png',
      format: 'carousel',
      stepLabel: '01 · Cómo funciona',
      headline: 'El cliente ya pidió.',
      sub: 'Tú ves el pedido y decides si lo tomas.'
    },
    {
      file: 'fandez-ig-carousel-02.png',
      format: 'carousel',
      stepLabel: '02 · Beneficio',
      headline: 'Demanda en tu zona.',
      sub: 'Sin pelear cotizaciones por WhatsApp.'
    },
    {
      file: 'fandez-ig-carousel-03.png',
      format: 'carousel',
      stepLabel: '03 · CTA',
      headline: 'Abre tu cupo de socio.',
      sub: 'Registro gratis · activación guiada 24–72 h'
    },
    {
      file: 'fandez-story-tiktok-cta.png',
      format: 'ig-story',
      headline: '¿Sigues cotizando por WhatsApp?',
      sub: 'En Fandez el cliente ya pidió. Tú eliges.'
    },
    {
      file: 'fandez-linkedin-banner.png',
      format: 'linkedin',
      headline: 'Cupos de socios en Santiago',
      sub: 'Empresas formales de servicios del hogar'
    }
  ];

  const results = [];
  for (const p of pieces) {
    const outPath = path.join(dir, p.file);
    // eslint-disable-next-line no-await-in-loop
    const r = await renderPartnerCampaignCreative({
      format: p.format,
      headline: p.headline,
      sub: p.sub,
      stepLabel: p.stepLabel || '',
      cta: BRAND.ctaPartner,
      outPath
    });
    results.push(r);
  }
  return results;
}

module.exports = {
  stampOfficialLogo,
  renderPartnerCampaignCreative,
  generatePartnerCampaignSet,
  getSharp
};

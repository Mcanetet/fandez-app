/**
 * Composición de piezas: estampa logo oficial Fandez + genera creatividades de campaña.
 * Logo = isotipo app (fondo blanco + contorno ámbar), igual que el panel admin.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { BRAND, PLUNGER_PATH } = require('./brand');

const BUNDLED_DIR = path.join(__dirname, '../../marketing/lanzamiento-socios');
const PUBLIC_CAMPAIGN_DIR = path.join(__dirname, '../../public/uploads/marketing/campana-socios');

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

/** Isotipo idéntico al de la app (cuadro blanco + contorno ámbar). */
function appMarkSvg({ size = 128 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none">
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#FFFFFF"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="12" stroke="${BRAND.accent}" stroke-width="2"/>
  <g transform="translate(24, 24.5) scale(0.26) translate(-60, -71)">
    <path fill="none" stroke="${BRAND.accent}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" d="${PLUNGER_PATH}"/>
  </g>
</svg>`;
}

/**
 * Estampa isotipo oficial + wordmark en esquina de una foto (post-IA).
 */
async function stampOfficialLogo(inputPath, outputPath, {
  corner = 'top-left',
  markSize = 96,
  pad = 36,
  variant = 'light'
} = {}) {
  const sharp = getSharp();
  if (!sharp) {
    await fs.promises.copyFile(inputPath, outputPath);
    return { stamped: false, reason: 'sharp_unavailable' };
  }

  const wordColor = variant === 'dark' ? '#FFFFFF' : BRAND.ink;
  const markPng = await sharp(Buffer.from(appMarkSvg({ size: markSize }))).png().toBuffer();

  const wordSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="44">
  <style>${fontFaceCss()} text{font-family:'Unbounded',Arial,sans-serif;font-weight:700;}</style>
  <text x="0" y="32" fill="${wordColor}" font-size="30">Fandez</text>
</svg>`;
  const wordPng = await sharp(Buffer.from(wordSvg)).png().toBuffer();

  const meta = await sharp(inputPath).metadata();
  const w = meta.width || 1024;
  const h = meta.height || 1024;
  const left = corner.includes('right') ? w - pad - markSize - 12 : pad;
  const top = corner.includes('bottom') ? h - pad - markSize - 8 : pad;
  const wordLeft = left + markSize + 12;
  const wordTop = top + Math.round((markSize - 44) / 2);

  await sharp(inputPath)
    .composite([
      { input: markPng, left, top },
      { input: wordPng, left: wordLeft, top: Math.max(8, wordTop) }
    ])
    .png()
    .toFile(outputPath);

  return { stamped: true, width: w, height: h };
}

async function renderPartnerCampaignCreative({
  format = 'ig-feed',
  headline = BRAND.taglinePartner,
  sub = BRAND.marketLine,
  cta = BRAND.ctaPartner,
  stepLabel = '',
  outPath
} = {}) {
  const sharp = getSharp();
  if (!sharp) throw new Error('sharp_unavailable');

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

  const markSize = isWide ? 88 : isTall ? 120 : 128;
  const markBuf = await sharp(Buffer.from(appMarkSvg({ size: markSize }))).png().toBuffer();

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

  const wordX = pad + markSize + 18;
  const wordY = pad + Math.round(markSize * 0.62);

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
  <text x="${wordX}" y="${wordY}" class="brand" fill="${BRAND.white}" font-size="${isWide ? 30 : 36}">Fandez</text>
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

const CAMPAIGN_PIECES = [
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

async function copyBundledToPublic() {
  await fs.promises.mkdir(PUBLIC_CAMPAIGN_DIR, { recursive: true });
  const copied = [];
  for (const p of CAMPAIGN_PIECES) {
    const src = path.join(BUNDLED_DIR, p.file);
    const dest = path.join(PUBLIC_CAMPAIGN_DIR, p.file);
    if (!fs.existsSync(src)) continue;
    // eslint-disable-next-line no-await-in-loop
    await fs.promises.copyFile(src, dest);
    copied.push({
      path: dest,
      file: p.file,
      url: `/uploads/marketing/campana-socios/${p.file}`,
      width: null,
      height: null,
      bundled: true
    });
  }
  return copied;
}

async function generatePartnerCampaignSet(outDir) {
  const dir = outDir || BUNDLED_DIR;
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.mkdir(PUBLIC_CAMPAIGN_DIR, { recursive: true });

  const sharp = getSharp();
  const results = [];

  if (sharp) {
    for (const p of CAMPAIGN_PIECES) {
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
      const publicPath = path.join(PUBLIC_CAMPAIGN_DIR, p.file);
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.copyFile(outPath, publicPath);
      results.push({
        ...r,
        file: p.file,
        url: `/uploads/marketing/campana-socios/${p.file}`,
        publicPath
      });
    }
    return { results, mode: 'generated', sharp: true };
  }

  // Sin sharp (p. ej. Hostinger sin binario): servir piezas ya generadas del repo
  const copied = await copyBundledToPublic();
  if (!copied.length) {
    throw new Error('No hay gráficas empaquetadas y sharp no está disponible en el servidor.');
  }
  // También sincronizar a marketing/ si falta
  for (const c of copied) {
    const bundled = path.join(dir, c.file);
    if (!fs.existsSync(bundled)) {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.copyFile(c.path, bundled);
    }
  }
  return { results: copied, mode: 'bundled', sharp: false };
}

module.exports = {
  stampOfficialLogo,
  renderPartnerCampaignCreative,
  generatePartnerCampaignSet,
  copyBundledToPublic,
  getSharp,
  PUBLIC_CAMPAIGN_DIR,
  CAMPAIGN_PIECES,
  appMarkSvg
};

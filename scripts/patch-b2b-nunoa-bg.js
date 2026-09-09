/**
 * Restaura v1 B2B: rellena hueco crema abajo-derecha con taller + logos.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { stampOfficialLogo } = require('../lib/florencia/composeCreative');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'marketing/lanzamiento-socios');
const PUB = path.join(ROOT, 'public/uploads/marketing/campana-socios');
const EASY = '/Users/miguelangel/Downloads/fandez-graficas-ig';
const CLEAN =
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-ig-b2b-v1-restore-clean.png';
const PHOTO =
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-tech-photo-base.png';
const PARTNER = path.join(OUT, 'nunoa-hub-logo.png');

async function main() {
  const W = 1024;
  const H = 1024;
  const base = await sharp(CLEAN).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const fill = await sharp(PHOTO)
    .resize(W, H, { fit: 'cover', position: 'right' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const data = base.data;
  const fdata = fill.data;
  const startX = Math.floor(W * 0.55);
  const startY = Math.floor(H * 0.62);
  for (let y = startY; y < H; y++) {
    for (let x = startX; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isCream = r > 220 && g > 210 && b > 195 && Math.abs(r - g) < 25 && Math.abs(g - b) < 30;
      const isPale = r > 200 && g > 190 && b > 175 && (r + g + b) / 3 > 205 && Math.abs(r - b) < 40;
      if (isCream || isPale) {
        const tx = (x - startX) / (W - startX);
        const ty = (y - startY) / (H - startY);
        const strength = Math.min(1, tx * 0.55 + ty * 0.7);
        if (strength > 0.25) {
          const a = Math.min(1, (strength - 0.25) / 0.55);
          data[i] = Math.round(r * (1 - a) + fdata[i] * a);
          data[i + 1] = Math.round(g * (1 - a) + fdata[i + 1] * a);
          data[i + 2] = Math.round(b * (1 - a) + fdata[i + 2] * a);
        }
      }
    }
  }

  const patched = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const tmp = path.join(OUT, '._tmp-patched.png');
  const tmpLogo = path.join(OUT, '._tmp-patched-logo.png');
  await sharp(patched).toFile(tmp);
  await stampOfficialLogo(tmp, tmpLogo, { corner: 'top-left', markSize: 92, pad: 26, variant: 'light' });

  const partnerBuf = await sharp(PARTNER).resize({ width: 165, withoutEnlargement: true }).png().toBuffer();
  const pMeta = await sharp(partnerBuf).metadata();
  const inner = 8;
  const bw = pMeta.width + inner * 2;
  const bh = pMeta.height + inner * 2;
  const badge = await sharp(
    Buffer.from(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}">
      <rect width="${bw}" height="${bh}" rx="10" fill="#FFFCF8" fill-opacity="0.92"/>
    </svg>`
    )
  )
    .png()
    .toBuffer();
  const pad = 16;
  const left = W - pad - bw;
  const top = H - pad - bh;

  const outName = 'fandez-ig-b2b-proveedor-nunoa-v1.png';
  const outPath = path.join(OUT, outName);
  await sharp(tmpLogo)
    .composite([
      { input: badge, left, top },
      { input: partnerBuf, left: left + inner, top: top + inner }
    ])
    .png()
    .toFile(outPath);

  for (const dir of [PUB, EASY]) {
    fs.mkdirSync(dir, { recursive: true });
    await fs.promises.copyFile(outPath, path.join(dir, outName));
  }
  await fs.promises.unlink(tmp);
  await fs.promises.unlink(tmpLogo);
  console.log('ok', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Avatar Instagram 1080×1080 — isotipo oficial Fandez (seguro para crop circular).
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { BRAND } = require('../lib/florencia/brand');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'marketing/lanzamiento-socios');
const PUB = path.join(ROOT, 'public/uploads/marketing/campana-socios');
const SIZE = 1080;
const MARK = Math.round(SIZE * 0.52);

async function amberMark(size) {
  const { data, info } = await sharp(BRAND.isotipoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function whiteMark(size) {
  const { data, info } = await sharp(BRAND.isotipoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) {
      data[i + 3] = 0;
      continue;
    }
    if (data[i + 3] > 20) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function make(name, bg, mark) {
  const buf = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: bg }
  })
    .composite([
      {
        input: mark,
        left: Math.round((SIZE - MARK) / 2),
        top: Math.round((SIZE - MARK) / 2)
      }
    ])
    .png()
    .toBuffer();

  const file = `fandez-ig-avatar-${name}.png`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PUB, { recursive: true });
  const dest = path.join(OUT, file);
  await sharp(buf).toFile(dest);
  await fs.promises.copyFile(dest, path.join(PUB, file));
  console.log('ok', dest);
}

async function main() {
  await make('white-on-amber', { r: 196, g: 92, b: 20 }, await whiteMark(MARK));
  await make('amber-on-cream', { r: 247, g: 243, b: 238 }, await amberMark(MARK));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

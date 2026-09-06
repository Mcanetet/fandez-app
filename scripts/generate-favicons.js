/**
 * Genera favicons + iconos PWA/notificación v10 desde public/favicon.svg
 * Uso: node scripts/generate-favicons.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('Instala sharp: npm install --save-dev sharp');
    process.exit(1);
  }

  const publicDir = path.join(__dirname, '../public');
  const svg = fs.readFileSync(path.join(publicDir, 'favicon.svg'));
  const badgeSvg = fs.readFileSync(path.join(publicDir, 'icons', 'fandez-badge.svg'));

  const sizes = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['favicon-48.png', 48],
    ['favicon-96.png', 96],
    ['favicon.png', 96],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icons/fandez-96.png', 96],
    ['icons/fandez-180.png', 180],
    ['icons/fandez-192.png', 192],
    ['icons/fandez-512.png', 512],
    // v10 — rompe caché CDN / PWA / notificaciones (Saturno Chrome)
    ['icons/fandez-v10-48.png', 48],
    ['icons/fandez-v10-96.png', 96],
    ['icons/fandez-v10-180.png', 180],
    ['icons/fandez-v10-192.png', 192],
    ['icons/fandez-v10-512.png', 512],
    ['icons/fandez-v10-notify.png', 192]
  ];

  fs.mkdirSync(path.join(publicDir, 'icons'), { recursive: true });

  for (const [name, size] of sizes) {
    await sharp(svg).resize(size, size).png().toFile(path.join(publicDir, name));
    console.log('✓', name);
  }

  await sharp(badgeSvg).resize(96, 96).png().toFile(path.join(publicDir, 'icons', 'fandez-v10-badge-96.png'));
  console.log('✓ icons/fandez-v10-badge-96.png');

  const ico16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const ico48 = await sharp(svg).resize(48, 48).png().toBuffer();
  const toIco = require('to-ico');
  const ico = await toIco([ico16, ico32, ico48]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log('✓ favicon.ico');
  fs.writeFileSync(path.join(publicDir, 'icons', 'fandez-v10.ico'), ico);
  console.log('✓ icons/fandez-v10.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Genera favicon.ico, PNGs y manifest desde public/favicon.svg
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

  const sizes = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['favicon-48.png', 48],
    ['favicon-96.png', 96],
    ['favicon.png', 96],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    // Rutas nuevas para PWA / pantalla de inicio (evitar caché de iOS)
    ['icons/fandez-96.png', 96],
    ['icons/fandez-180.png', 180],
    ['icons/fandez-192.png', 192],
    ['icons/fandez-512.png', 512],
    ['icons/fandez-v3-96.png', 96],
    ['icons/fandez-v3-180.png', 180],
    ['icons/fandez-v3-192.png', 192],
    ['icons/fandez-v3-512.png', 512],
    // v4 — ámbar marca (rompe caché de iOS/Android)
    ['icons/fandez-v4-96.png', 96],
    ['icons/fandez-v4-180.png', 180],
    ['icons/fandez-v4-192.png', 192],
    ['icons/fandez-v4-512.png', 512],
    // v5 — rutas nuevas (Hostinger CDN cachea 1 año; path distinto = cache miss)
    ['icons/fandez-v5-96.png', 96],
    ['icons/fandez-v5-180.png', 180],
    ['icons/fandez-v5-192.png', 192],
    ['icons/fandez-v5-512.png', 512],
    // v6 — favicon ámbar actualizado (cache bust CDN)
    ['icons/fandez-v6-96.png', 96],
    ['icons/fandez-v6-180.png', 180],
    ['icons/fandez-v6-192.png', 192],
    ['icons/fandez-v6-512.png', 512]
  ];

  fs.mkdirSync(path.join(publicDir, 'icons'), { recursive: true });

  for (const [name, size] of sizes) {
    await sharp(svg).resize(size, size).png().toFile(path.join(publicDir, name));
    console.log('✓', name);
  }

  const ico16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const ico48 = await sharp(svg).resize(48, 48).png().toBuffer();
  const toIco = require('to-ico');
  const ico = await toIco([ico16, ico32, ico48]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log('✓ favicon.ico');
  fs.writeFileSync(path.join(publicDir, 'icons', 'fandez-v5.ico'), ico);
  console.log('✓ icons/fandez-v5.ico');
  fs.writeFileSync(path.join(publicDir, 'icons', 'fandez-v6.ico'), ico);
  console.log('✓ icons/fandez-v6.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

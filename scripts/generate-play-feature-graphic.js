#!/usr/bin/env node
/**
 * Genera feature graphic Google Play 1024×500.
 * Salida: public/play/feature-graphic-1024x500.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '..', 'public', 'play');
const OUT = path.join(OUT_DIR, 'feature-graphic-1024x500.png');
const ICON = path.join(__dirname, '..', 'public', 'icons', 'fandez-v11-512.png');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const W = 1024;
  const H = 500;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="100%" height="100%" fill="#1A1814"/>
      <rect x="0" y="0" width="8" height="100%" fill="#C45C14"/>
      <text x="72" y="210" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#FFFFFF">Fandez</text>
      <text x="72" y="280" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#E8E4DE">Técnico a domicilio en Santiago</text>
      <text x="72" y="340" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#A39E96">Hogar y empresa · pago en app · seguimiento</text>
    </svg>`
  );

  const iconSize = 220;
  const icon = await sharp(ICON)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(bg)
    .composite([{ input: icon, left: W - iconSize - 72, top: Math.round((H - iconSize) / 2) }])
    .png()
    .toFile(OUT);

  console.log('OK', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

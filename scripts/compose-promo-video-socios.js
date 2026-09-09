/**
 * Reel promocional socios Fandez (9:16) — conciencia + inscripción septiembre.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { BRAND } = require('../lib/florencia/brand');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'marketing/lanzamiento-socios');
const PUB = path.join(ROOT, 'public/uploads/marketing/campana-socios');
const FRAMES = path.join(OUT, '_promo-frames');
const PHOTO =
  '/Users/miguelangel/.cursor/projects/Users-miguelangel-Downloads-fandez-app/assets/fandez-b2b-photo-human-real.png';
const FONT = BRAND.fontUnbounded;
const W = 1080;
const H = 1920;

function fontCss() {
  if (!fs.existsSync(FONT)) return '';
  return `@font-face{font-family:'Unbounded';src:url('${pathToFileURL(FONT).href}') format('woff2');font-weight:700;}`;
}

async function officialMark(size = 92) {
  const pad = Math.round(size * 0.16);
  const { data, info } = await sharp(BRAND.isotipoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) data[i + 3] = 0;
  }
  const iso = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({
      width: size - pad * 2,
      height: size - pad * 2,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  const bg = await sharp(
    Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.round(size * 0.2)}" fill="#FFFFFF"/>
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.round(size * 0.2)}" fill="none" stroke="${BRAND.accent}" stroke-width="2"/>
</svg>`)
  )
    .png()
    .toBuffer();
  return sharp(bg).composite([{ input: iso, left: pad, top: pad }]).png().toBuffer();
}

function svgFrame({ bg, extra = '', title, lines = [], kicker = '', cta = '', dark = false, progress = 0 }) {
  const ink = dark ? '#F7F3EE' : '#1A1814';
  const muted = dark ? '#C8C2BA' : '#6B6560';
  const titleSize = title && title.length > 26 ? 52 : 62;
  const titleRows = title.split('\n');
  const lineStart = 850 + titleRows.length * 76 + 36;
  const barW = Math.round(952 * Math.min(1, Math.max(0.12, progress)));
  return Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>${fontCss()}</defs>
  ${bg}
  ${extra}
  <style>
    .k{font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:2.2px;fill:${muted}}
    .t{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:${titleSize}px;fill:${ink}}
    .l{font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:700;fill:${ink}}
    .cta{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:26px;fill:#FFFFFF}
    .brand{font-family:'Unbounded',Arial,sans-serif;font-weight:700;font-size:34px;fill:${ink}}
  </style>
  <text x="154" y="168" class="brand">Fandez</text>
  <rect x="56" y="720" width="72" height="6" rx="3" fill="${BRAND.accent}"/>
  ${kicker ? `<text x="56" y="780" class="k">${kicker}</text>` : ''}
  ${titleRows.map((row, i) => `<text x="56" y="${850 + i * 76}" class="t">${row}</text>`).join('\n')}
  ${lines.map((row, i) => `<text x="56" y="${lineStart + i * 54}" class="l">${row}</text>`).join('\n')}
  ${
    cta
      ? `<rect x="56" y="1360" width="780" height="88" rx="16" fill="${BRAND.accent}"/>
         <text x="446" y="1418" text-anchor="middle" class="cta">${cta}</text>`
      : ''
  }
  <rect x="56" y="1520" width="780" height="8" rx="4" fill="${dark ? '#3A342E' : '#E4DDD4'}"/>
  <rect x="56" y="1520" width="${Math.round(barW * 0.82)}" height="8" rx="4" fill="${BRAND.accent}"/>
</svg>`);
}

async function writeFrame(name, overlays, photoBuf) {
  const layers = [];
  if (photoBuf) layers.push({ input: photoBuf, left: 0, top: 0 });
  layers.push({ input: await sharp(overlays.svg).png().toBuffer(), left: 0, top: 0 });
  layers.push({ input: overlays.mark, left: 52, top: 96 });
  const out = path.join(FRAMES, name);
  await sharp({
    create: { width: W, height: H, channels: 3, background: overlays.canvas }
  })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(out);
  return out;
}

function findFfmpeg() {
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) return installer.path;
  } catch (_) {
    /* optional */
  }
  for (const bin of ['ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PUB, { recursive: true });

  const mark = await officialMark(88);
  const photo = fs.existsSync(PHOTO)
    ? await sharp(PHOTO)
        .resize(W, H, { fit: 'cover', position: 'right' })
        .modulate({ brightness: 0.72, saturation: 0.85 })
        .jpeg({ quality: 82 })
        .toBuffer()
    : null;

  const cream = { r: 247, g: 243, b: 238 };
  const ink = { r: 26, g: 24, b: 20 };
  const amber = { r: 196, g: 92, b: 20 };

  const scenes = [
    {
      file: '01.jpg',
      canvas: cream,
      photo: false,
      title: 'Si tu oficio\nvive en WhatsApp…',
      kicker: 'RECLUTAMIENTO DE SOCIOS',
      lines: ['esto es para ti.']
    },
    {
      file: '02.jpg',
      canvas: ink,
      photo: true,
      dark: true,
      title: 'Fandez es el espacio\npara servicios.',
      kicker: 'QUÉ SOMOS',
      lines: ['Se piden. Se toman.', 'Se resuelven.']
    },
    {
      file: '03.jpg',
      canvas: cream,
      photo: false,
      title: 'Más alcance.',
      kicker: 'LO QUE CAMBIA',
      lines: ['El cliente ya pidió.', 'Tú apareces donde hay demanda.']
    },
    {
      file: '04.jpg',
      canvas: cream,
      photo: false,
      title: 'Más pedidos.',
      kicker: 'LO QUE CAMBIA',
      lines: ['Ves zona, servicio y cobro.', 'Si te sirve, lo tomas.']
    },
    {
      file: '05.jpg',
      canvas: amber,
      photo: false,
      dark: true,
      title: 'Tú eliges\nel trabajo.',
      kicker: 'CONTROL',
      lines: ['Sin costos fijos.', 'Cobros claros en la app.']
    },
    {
      file: '06.jpg',
      canvas: cream,
      photo: false,
      title: 'Septiembre:\nregistro de socios.',
      kicker: 'AHORA',
      lines: ['Estamos inscribiendo a quienes', 'quieren impulsar su oficio.']
    },
    {
      file: '07.jpg',
      canvas: ink,
      photo: true,
      dark: true,
      title: 'Cupos abiertos\npara Santiago.',
      kicker: 'LANZAMIENTO OCTUBRE 2026',
      lines: ['Inscríbete gratis hoy.'],
      cta: 'WWW.FANDEZ.CL'
    },
    {
      file: '08.jpg',
      canvas: cream,
      photo: false,
      title: 'Síguenos.\nInscríbete.',
      kicker: 'INSTAGRAM',
      lines: ['@fandez.cl · link en la bio'],
      cta: 'QUIERO SER SOCIO'
    }
  ];

  for (const [i, s] of scenes.entries()) {
    const wash = s.photo
      ? `<rect width="${W}" height="${H}" fill="#0B0A09" fill-opacity="0.42"/>
         <rect width="${W}" height="${H}" fill="#F7F3EE" fill-opacity="0.08"/>`
      : `<rect width="${W}" height="${H}" fill="${s.canvas === ink ? '#1A1814' : s.canvas === amber ? '#C45C14' : '#F7F3EE'}"/>`;
    const svg = svgFrame({
      bg: wash,
      dark: !!s.dark,
      title: s.title,
      kicker: s.kicker,
      lines: s.lines || [],
      cta: s.cta || '',
      progress: (i + 1) / scenes.length
    });
    await writeFrame(s.file, { svg, mark, canvas: s.canvas }, s.photo ? photo : null);
  }

  const concat = scenes.map((s) => `file '${path.join(FRAMES, s.file)}'\nduration 4.6`).join('\n');
  const last = scenes[scenes.length - 1];
  const listPath = path.join(FRAMES, 'list.txt');
  fs.writeFileSync(listPath, `${concat}\nfile '${path.join(FRAMES, last.file)}'\n`);

  const voiceAiff = path.join(FRAMES, 'voice.aiff');
  const voiceM4a = path.join(FRAMES, 'voice.m4a');
  const script = [
    'Si tu oficio todavía vive en WhatsApp, esto es para ti.',
    'Fandez es el espacio donde se piden y se toman los servicios del hogar.',
    'Más alcance. Más pedidos. Cobros claros. Tú eliges el trabajo.',
    'En septiembre estamos registrando a los socios que quieren impulsar su oficio.',
    'Inscríbete gratis en fandez punto cl.',
    'Y síguenos en Instagram: arroba fandez punto cl.'
  ].join(' ');

  const say = spawnSync(
    'say',
    ['-v', 'Paulina', '-r', '168', '-o', voiceAiff, script],
    { encoding: 'utf8' }
  );
  if (say.status !== 0) {
    throw new Error(say.stderr || 'say falló');
  }
  spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', voiceAiff, voiceM4a], { encoding: 'utf8' });

  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.log('frames ok, falta ffmpeg', FRAMES);
    return;
  }

  const mp4 = path.join(OUT, 'fandez-ig-reel-socios-septiembre.mp4');
  const cover = path.join(OUT, 'fandez-ig-reel-socios-cover.jpg');
  const enc = spawnSync(
    ffmpeg,
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-i',
      fs.existsSync(voiceM4a) ? voiceM4a : voiceAiff,
      '-vf',
      'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      '-movflags',
      '+faststart',
      mp4
    ],
    { encoding: 'utf8' }
  );
  if (enc.status !== 0) {
    console.error(enc.stderr);
    throw new Error('ffmpeg falló');
  }

  await sharp(path.join(FRAMES, '01.jpg')).jpeg({ quality: 90 }).toFile(cover);
  await fs.promises.copyFile(mp4, path.join(PUB, 'fandez-ig-reel-socios-septiembre.mp4'));
  await fs.promises.copyFile(cover, path.join(PUB, 'fandez-ig-reel-socios-cover.jpg'));
  await fs.promises.copyFile(mp4, path.join(OUT, 'fandez-reel-socios-septiembre.mp4'));
  console.log('ok video Instagram Reels', mp4, cover);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

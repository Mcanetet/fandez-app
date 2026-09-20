#!/usr/bin/env node
/**
 * Empaqueta Fandez Admin (local, NO publicar en la web).
 * Salida: dist/Fandez-Admin/ + ~/Downloads/Fandez-Admin.zip
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'Fandez-Admin');
const DOWNLOADS = path.join(require('os').homedir(), 'Downloads');
const ADMIN_URL =
  process.env.ADMIN_LOGIN_URL ||
  'https://www.fandez.cl/ops-dde167af2c3bc7dd/app';

const LOGO_PATH = `
  M60 22
  C78 22 92 34 94 50
  C95 58 92 66 84 70
  C98 74 108 84 108 96
  C108 112 86 122 60 122
  C34 122 12 112 12 96
  C12 84 22 74 36 70
  C28 66 25 58 26 50
  C28 34 42 22 60 22
  Z
`;

function iconSvg(size = 512) {
  const pad = size * 0.18;
  const inner = size - pad * 2;
  const scale = inner / 120;
  const tx = pad + (inner - 120 * scale) / 2;
  const ty = pad + (inner - 130 * scale) / 2 + size * 0.02;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#0A0A0A"/>
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${LOGO_PATH}"/>
  </g>
</svg>`;
}

function markSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" fill="none" role="img" aria-label="Fandez">
  <path fill="none" stroke="#C45C14" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" d="${LOGO_PATH}"/>
</svg>`;
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0A0A0A">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Fandez Admin">
  <link rel="apple-touch-icon" href="assets/icon.png">
  <link rel="icon" href="assets/icon.png">
  <title>Fandez Admin</title>
  <style>
    :root {
      --bg: #0A0A0A;
      --bg2: #141414;
      --ink: #F5F2EE;
      --muted: #9A9188;
      --accent: #C45C14;
      --line: rgba(255,255,255,.08);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(720px 380px at 50% -8%, rgba(196,92,20,.22), transparent 55%),
        radial-gradient(520px 280px at 90% 100%, rgba(196,92,20,.08), transparent 50%),
        var(--bg);
      padding: 28px 20px;
    }
    .shell {
      width: min(420px, 100%);
      text-align: center;
    }
    .mark {
      width: 88px;
      height: 96px;
      margin: 0 auto 22px;
      filter: drop-shadow(0 10px 28px rgba(196,92,20,.28));
    }
    .mark img, .mark svg { width: 100%; height: 100%; display: block; }
    .word {
      font-size: clamp(1.7rem, 5vw, 2.05rem);
      font-weight: 700;
      letter-spacing: -0.04em;
      margin: 0 0 6px;
    }
    .word span { color: var(--accent); }
    .tag {
      display: inline-block;
      margin: 0 0 18px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    p {
      margin: 0 auto 24px;
      max-width: 32ch;
      color: var(--muted);
      font-size: .98rem;
      line-height: 1.5;
    }
    a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 15px 18px;
      border-radius: 14px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      text-decoration: none;
      font-size: 1rem;
      box-shadow: 0 10px 30px rgba(196,92,20,.35);
    }
    a.btn:active { transform: translateY(1px); }
    .panel {
      margin-top: 18px;
      padding: 14px;
      border-radius: 14px;
      background: var(--bg2);
      border: 1px solid var(--line);
      text-align: left;
    }
    .panel strong {
      display: block;
      font-size: 11px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .panel code {
      display: block;
      font-size: 11px;
      word-break: break-all;
      color: #D8D0C6;
      line-height: 1.45;
    }
    .meta {
      margin-top: 18px;
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="mark" aria-hidden="true">
      <img src="assets/logo-mark.svg" alt="">
    </div>
    <h1 class="word">Fandez <span>Admin</span></h1>
    <div class="tag">Operaciones · privado</div>
    <p>Mismo logo que clientes y socios. Acceso local al panel — no está publicado en la web pública.</p>
    <a class="btn" id="go" href="${ADMIN_URL}">Abrir panel admin</a>
    <div class="panel">
      <strong>Link del panel</strong>
      <code>${ADMIN_URL}</code>
    </div>
    <p class="meta">Usuario: admin@fandez.cl · No compartas este paquete.</p>
  </main>
</body>
</html>
`;

const leeme = `FANDEZ ADMIN — PAQUETE LOCAL (NO PUBLICAR EN LA WEB)
====================================================

Este ZIP no vive en fandez.cl. Es una app local de acceso.
El link del panel es distinto al de la app de clientes/socios.

Panel:
${ADMIN_URL}

Usuario: admin@fandez.cl
Clave: la de Hostinger (ADMIN_PASSWORD) o admin123 si no la cambiaste.

CÓMO USAR
---------
macOS:
  1) Doble clic en "Fandez Admin.app"
  2) Si macOS bloquea: clic derecho → Abrir

Cualquier dispositivo:
  - Abre Abrir-Admin.html (fondo negro + logo oficial)
  - O usa Fandez-Admin.url (Windows)

iPhone:
  - Safari → Abrir-Admin.html → Compartir → Añadir a pantalla de inicio

IMPORTANTE
----------
- No subas este paquete a la web pública ni a redes.
- /admin en fandez.cl es un señuelo (404).
`;

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

  const iconSvgBuf = Buffer.from(iconSvg(512));
  const iconPng = path.join(OUT, 'assets', 'icon.png');
  await sharp(iconSvgBuf).png().toFile(iconPng);
  fs.writeFileSync(path.join(OUT, 'assets', 'logo-mark.svg'), markSvg());
  fs.writeFileSync(path.join(OUT, 'Abrir-Admin.html'), html);
  fs.writeFileSync(path.join(OUT, 'LEEME.txt'), leeme);
  fs.writeFileSync(
    path.join(OUT, 'Fandez-Admin.url'),
    `[{000214A0-0000-0000-C000-000000000046}]
Prop3=19,11
[InternetShortcut]
URL=${ADMIN_URL}
IconIndex=0
`
  );

  // Iconset → icns
  const iconset = path.join('/tmp', 'fandez-admin-black.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  const sizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ];
  const master = await sharp(Buffer.from(iconSvg(1024))).png().toBuffer();
  for (const [sz, name] of sizes) {
    await sharp(master).resize(sz, sz).png().toFile(path.join(iconset, name));
  }
  const icnsOut = path.join(OUT, 'assets', 'AppIcon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsOut]);

  // AppleScript app: abre Abrir-Admin.html junto al .app (portable),
  // o el panel si no encuentra el HTML.
  const appName = 'Fandez Admin.app';
  const appPath = path.join(OUT, appName);
  const script = `
set appPosix to POSIX path of (path to me)
set parentDir to do shell script "dirname " & quoted form of appPosix
set htmlPosix to parentDir & "/Abrir-Admin.html"
try
  do shell script "test -f " & quoted form of htmlPosix
  tell application "Finder"
    open (POSIX file htmlPosix)
  end tell
on error
  open location "${ADMIN_URL}"
end try
`;
  const scriptFile = '/tmp/fandez-admin-open.applescript';
  fs.writeFileSync(scriptFile, script);
  execFileSync('osacompile', ['-o', appPath, scriptFile]);
  // Replace icon
  const appIcns = path.join(appPath, 'Contents', 'Resources', 'applet.icns');
  fs.copyFileSync(icnsOut, appIcns);

  // Copy to Downloads folder + zip
  const dlDir = path.join(DOWNLOADS, 'Fandez-Admin');
  const dlZip = path.join(DOWNLOADS, 'Fandez-Admin.zip');
  fs.rmSync(dlDir, { recursive: true, force: true });
  fs.rmSync(dlZip, { force: true });
  execFileSync('cp', ['-R', OUT, dlDir]);
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', dlDir, dlZip]);

  // Also zip inside dist
  const distZip = path.join(ROOT, 'dist', 'Fandez-Admin.zip');
  fs.rmSync(distZip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', OUT, distZip]);

  console.log('OK');
  console.log('Carpeta:', dlDir);
  console.log('ZIP:    ', dlZip);
  console.log('Panel:  ', ADMIN_URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dirs = [
  path.join(__dirname, '../data'),
  path.join(__dirname, '../data/backups'),
  path.join(__dirname, '../public/uploads/providers'),
  path.join(__dirname, '../public/uploads/requests'),
  path.join(__dirname, '../public/uploads/marketing'),
  path.join(__dirname, '../public/uploads/marketing/campana-socios')
];

dirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

// Publica gráficas de campaña socios (logo oficial) en /uploads
try {
  const srcDir = path.join(__dirname, '../marketing/lanzamiento-socios');
  const destDir = path.join(__dirname, '../public/uploads/marketing/campana-socios');
  const files = [
    'fandez-ig-feed-hook.png',
    'fandez-ig-carousel-01.png',
    'fandez-ig-carousel-02.png',
    'fandez-ig-carousel-03.png',
    'fandez-story-tiktok-cta.png',
    'fandez-linkedin-banner.png'
  ];
  files.forEach((file) => {
    const src = path.join(srcDir, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, file));
  });
  console.log('Campaña socios → public/uploads/marketing/campana-socios');
} catch (err) {
  console.warn('Copia campaña socios omitida:', err.message);
}

try {
  execSync('npx tailwindcss -i ./src/tailwind-input.css -o ./public/css/tailwind.css --minify', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('Tailwind CSS compilado → public/css/tailwind.css');
} catch (err) {
  console.warn('Tailwind build omitido (instala devDependencies):', err.message);
}

console.log('Fandez build OK — carpetas de datos listas');

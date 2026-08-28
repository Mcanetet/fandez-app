const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dirs = [
  path.join(__dirname, '../data'),
  path.join(__dirname, '../data/backups'),
  path.join(__dirname, '../public/uploads/providers'),
  path.join(__dirname, '../public/uploads/requests'),
  path.join(__dirname, '../public/uploads/marketing')
];

dirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

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

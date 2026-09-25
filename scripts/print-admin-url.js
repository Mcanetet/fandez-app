#!/usr/bin/env node
/**
 * Imprime la URL de ingreso al admin según ADMIN_PATH del .env
 * Uso: node scripts/print-admin-url.js
 *      node scripts/print-admin-url.js --suggest
 *      node scripts/print-admin-url.js --prod
 */
require('dotenv').config();
const appMode = require('../lib/appMode');

const site = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const base = appMode.getAdminBasePath();

if (process.argv.includes('--suggest')) {
  const suggested = appMode.suggestAdminPath();
  console.log('Sugerencia para .env / Hostinger:\n');
  console.log(`ADMIN_PATH=${suggested}`);
  console.log(`\nLogin: ${site}${suggested}/login`);
  console.log(`Instalar app: ${site}${suggested}/instalar-admin`);
  console.log(`Bandeja: ${site}${suggested}/app`);
  console.log('\nGuarda este enlace solo en tu gestor de contraseñas. No lo publiques ni lo enlaces desde la web.');
  process.exit(0);
}

if (process.argv.includes('--prod')) {
  const prodSite = 'https://www.fandez.cl';
  const prodBase = process.env.ADMIN_PATH && process.env.ADMIN_PATH !== '/admin'
    ? appMode.normalizeAdminPath(process.env.ADMIN_PATH)
    : '/ops-dde167af2c3bc7dd';
  console.log('Fandez Admin — enlaces privados (no compartir):\n');
  console.log(`Login:          ${prodSite}${prodBase}/login`);
  console.log(`Instalar app:   ${prodSite}${prodBase}/instalar-admin`);
  console.log(`Bandeja:        ${prodSite}${prodBase}/app`);
  console.log('\n1) Entra al Login → MFA');
  console.log('2) Abre Instalar app en Chrome → ⋮ → Añadir a la pantalla de inicio');
  console.log('3) Borra el ícono viejo si te mandaba al acceso normal');
  process.exit(0);
}

console.log(`ADMIN_PATH actual: ${base}`);
console.log(`Login: ${site}${base}/login`);
console.log(`Instalar app: ${site}${base}/instalar-admin`);
console.log(`Bandeja: ${site}${base}/app`);
if (base === '/admin') {
  console.log('\n⚠ /admin es predecible. Genera uno secreto con:');
  console.log('  node scripts/print-admin-url.js --suggest');
  console.log('  En producción usa: node scripts/print-admin-url.js --prod');
}

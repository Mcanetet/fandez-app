#!/usr/bin/env node
/**
 * Descifra un backup .enc descargado del repo GitHub de backups.
 *
 * Uso:
 *   BACKUP_GITHUB_ENCRYPT_KEY='...' node scripts/decrypt-github-backup.js ./2026-09-14-abcd.enc ./snapshot.json
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { decryptBuffer } = require('../lib/backupGithub');

const encPath = process.argv[2];
const outPath = process.argv[3] || './snapshot-restored.json';
const key = process.env.BACKUP_GITHUB_ENCRYPT_KEY;

if (!encPath || !key) {
  console.error('Uso: BACKUP_GITHUB_ENCRYPT_KEY=... node scripts/decrypt-github-backup.js archivo.enc [salida.json]');
  process.exit(1);
}

const blob = fs.readFileSync(path.resolve(encPath));
const gz = decryptBuffer(blob, key);
const json = zlib.gunzipSync(gz).toString('utf8');
JSON.parse(json); // validate
fs.writeFileSync(path.resolve(outPath), json);
console.log('OK →', path.resolve(outPath));

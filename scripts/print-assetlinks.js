#!/usr/bin/env node
/**
 * Imprime assetlinks.json desde env o desde un keystore.
 * Uso:
 *   node scripts/print-assetlinks.js
 *   node scripts/print-assetlinks.js --keystore android-twa/android.keystore --alias fandez
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  buildAssetLinksJson,
  getAndroidPackageId,
  getSha256Fingerprints
} = require('../lib/androidTwa');

function parseArgs(argv) {
  const out = { keystore: null, alias: 'fandez' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--keystore') out.keystore = argv[++i];
    else if (argv[i] === '--alias') out.alias = argv[++i];
  }
  return out;
}

function fingerprintFromKeystore(keystore, alias) {
  const out = execFileSync(
    'keytool',
    ['-list', '-v', '-keystore', keystore, '-alias', alias],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }
  );
  const m = out.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
  if (!m) throw new Error('No se encontró SHA256 en la salida de keytool');
  return m[1].toUpperCase();
}

function main() {
  const args = parseArgs(process.argv);
  let fingerprints = getSha256Fingerprints();

  if (args.keystore) {
    const abs = path.resolve(args.keystore);
    if (!fs.existsSync(abs)) {
      console.error('Keystore no encontrado:', abs);
      process.exit(1);
    }
    const fp = fingerprintFromKeystore(abs, args.alias);
    fingerprints = [...new Set([...fingerprints, fp])];
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = fingerprints.join(',');
  }

  const json = buildAssetLinksJson();
  if (!json.length) {
    console.error(
      'Sin fingerprints. Define ANDROID_SHA256_CERT_FINGERPRINTS o pasa --keystore.'
    );
    console.error('Package id:', getAndroidPackageId());
    process.exit(2);
  }

  console.log(JSON.stringify(json, null, 2));
}

main();

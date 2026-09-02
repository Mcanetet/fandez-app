#!/usr/bin/env node
'use strict';

require('dotenv').config();
const appMode = require('../lib/appMode');
const { runGoLiveChecks } = require('../lib/goLiveCheck');

const BASE = (process.env.APP_URL || process.env.BASE_URL || 'https://www.fandez.cl').replace(/\/$/, '');

function printSection(title) {
  console.log('\n' + title);
  console.log('─'.repeat(title.length));
}

async function fetchRemote() {
  try {
    const res = await fetch(`${BASE}/health?go=1`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

(async () => {
  printSection('Fandez — chequeo go-live (local)');
  const boot = appMode.assertSecureBoot();
  if (boot.length) {
    console.log('ERRORES de arranque:');
    boot.forEach((e) => console.log('  ✗', e));
  } else {
    console.log('✓ assertSecureBoot OK');
  }

  let store = null;
  try {
    store = require('../models/store');
    if (!store.isReady()) {
      await store.init();
    }
  } catch (err) {
    console.log('⚠ Store local no disponible:', err.message);
  }

  const local = runGoLiveChecks(store);
  if (local.errors.length) {
    printSection('Errores');
    local.errors.forEach((e) => console.log('  ✗', e));
  }
  if (local.warnings.length) {
    printSection('Advertencias');
    local.warnings.forEach((w) => {
      console.log(`  ⚠ [${w.code}] ${w.message}`);
      if (w.action) console.log('      →', w.action);
    });
  }
  console.log('\nSoft launch ready (local):', local.softLaunchReady ? 'SÍ' : 'NO');

  const remote = await fetchRemote();
  if (remote?.goLive) {
    printSection(`Remoto ${BASE}/health?go=1`);
    console.log('mode:', remote.mode, '| ok:', remote.ok);
    if (remote.goLive.errors?.length) {
      remote.goLive.errors.forEach((e) => console.log('  ✗', e));
    }
    if (remote.goLive.warnings?.length) {
      remote.goLive.warnings.forEach((w) => console.log(`  ⚠ [${w.code}] ${w.message}`));
    }
    console.log('Soft launch ready (remoto):', remote.goLive.softLaunchReady ? 'SÍ' : 'NO');
  } else {
    console.log('\n(No se pudo leer /health?go=1 remoto)');
  }

  process.exit(local.ok && local.softLaunchReady ? 0 : 1);
})();

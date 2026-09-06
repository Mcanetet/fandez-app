#!/usr/bin/env node
/**
 * Recuperación ante incidente (malware / virus / corrupción).
 *
 * Uso:
 *   node scripts/disaster-recovery.js export [ruta.json]
 *   node scripts/disaster-recovery.js restore ruta.json [--yes]
 *   node scripts/disaster-recovery.js recover ruta.json [--yes] [--password=...]
 *   node scripts/disaster-recovery.js status
 *
 * Flujo recomendado si la web fue comprometida:
 *   1) Redeploy código limpio desde GitHub (fandez-app)
 *   2) node scripts/disaster-recovery.js recover ./fandez-backup-....json --yes
 *   3) Rotar SESSION_SECRET, ADMIN_PASSWORD, claves MP/SMTP en Hostinger
 *   4) Reiniciar la app y verificar /health
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');
const repository = require('../models/repository');
const backup = require('../lib/backup');
const appMode = require('../lib/appMode');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args.flags[k] = v === undefined ? true : v;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Fandez — recuperación de desastre / antivirus operativo

  export [archivo.json]     Genera backup completo (BD) a un JSON descargable
  restore archivo.json      Restaura la BD desde un JSON (crea pre-restore automático)
  recover archivo.json      Restaura + restablece admin (uso post-incidente)
  status                    Muestra últimos backups y estado de config

Flags:
  --yes                     No pedir confirmación
  --password=CLAVE          Contraseña admin en recover (o usa ADMIN_PASSWORD)
`);
}

async function initStore() {
  if (!db.isConfigured()) {
    throw new Error('Define DB_HOST, DB_USER, DB_PASSWORD y DB_NAME (o DATABASE_URL) en .env');
  }
  await db.ping();
  await repository.migrate();
  const store = require('../models/store');
  await store.init();
  return store;
}

async function cmdExport(outPath) {
  const store = await initStore();
  const result = await backup.createBackup(store, 'cli-export', 'disaster-recovery');
  const snapshot = await backup.readSnapshot(result.manifest.id);
  if (!snapshot) throw new Error('No se pudo leer el snapshot recién creado');

  const bodyForHash = { ...snapshot };
  const stable = JSON.stringify(bodyForHash);
  const payload = {
    ...snapshot,
    integrity: {
      alg: 'sha256',
      sha256: sha256(Buffer.from(stable, 'utf8')),
      exportedAt: new Date().toISOString(),
      note: 'Verifica este hash al restaurar si el archivo salió de un entorno comprometido'
    }
  };

  const target = path.resolve(
    outPath
      || path.join(
        process.cwd(),
        `fandez-backup-v${result.manifest.appVersion || 'x'}-${new Date().toISOString().slice(0, 10)}.json`
      )
  );
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  console.log('✓ Backup exportado');
  console.log(`  Archivo: ${target}`);
  console.log(`  Usuarios: ${payload.users?.length || 0} · Solicitudes: ${payload.requests?.length || 0}`);
  console.log(`  SHA-256:  ${payload.integrity.sha256}`);
  console.log('\nGuárdalo FUERA del servidor (Drive, USB, otro PC). Si hay virus en la web, esa copia limpia te salva.');
  return target;
}

function loadSnapshotFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`No existe el archivo: ${abs}`);
  const raw = fs.readFileSync(abs, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error('El archivo no es JSON válido');
  }
  const snapshot = backup.validateSnapshot(data);
  if (data.integrity?.sha256) {
    const copy = { ...data };
    delete copy.integrity;
    const calc = sha256(Buffer.from(JSON.stringify(copy), 'utf8'));
    if (calc !== data.integrity.sha256) {
      console.warn('⚠ El SHA-256 del archivo no coincide. El JSON pudo haberse alterado.');
      console.warn(`  Esperado: ${data.integrity.sha256}`);
      console.warn(`  Actual:   ${calc}`);
    } else {
      console.log('✓ Integridad SHA-256 OK');
    }
  }
  return { abs, snapshot: data };
}

async function cmdRestore(filePath, { yes }) {
  const { abs, snapshot } = loadSnapshotFile(filePath);
  if (!yes) {
    console.log(`Vas a RESTAURAR la base desde:\n  ${abs}`);
    console.log('Esto reemplaza usuarios, solicitudes y datos operativos con el contenido del backup.');
    console.log('Pasa --yes para confirmar.');
    process.exit(2);
  }
  const store = await initStore();
  const result = await backup.restoreFromSnapshotData(store, snapshot, {
    triggeredBy: 'disaster-recovery-cli',
    restoreUploads: false,
    saveImport: true
  });
  console.log('✓ Base de datos restaurada');
  console.log(`  Pre-restore backup id: ${result.preRestoreBackupId}`);
  console.log(`  Stats:`, result.stats || {});
  return result;
}

async function cmdRecover(filePath, { yes, password }) {
  await cmdRestore(filePath, { yes });
  const pass = password || process.env.ADMIN_PASSWORD;
  if (!pass || pass === 'admin123') {
    console.warn('\n⚠ Define una ADMIN_PASSWORD fuerte o usa --password=...');
  }
  const result = await repository.resetAdminPassword(pass || `Fandez-${Date.now().toString(36)}`);
  const base = appMode.getAdminBasePath();
  const site = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  console.log('\n✓ Acceso admin restablecido');
  console.log(`  Email: ${result.email}`);
  console.log(`  Password: ${pass || '(generada — revisa arriba si usaste default)'} `);
  console.log(`  Login: ${site}${base}/login`);
  console.log(`
Siguiente (obligatorio tras un virus):
  1. Redeploy limpio desde GitHub si aún no lo hiciste
  2. Cambia SESSION_SECRET, ADMIN_PASSWORD, MP_*, SMTP_PASS en Hostinger
  3. Reinicia la app y abre ${site}/health
  4. Revisa usuarios admin y desactiva cuentas dudosas
`);
}

async function cmdStatus() {
  await initStore();
  const cfg = await backup.loadConfigAsync();
  const list = await backup.listBackups();
  console.log('Modo app:', appMode.getMode());
  console.log('Backups auto:', cfg.enabled && cfg.autoBackup ? 'ON' : 'OFF');
  console.log('Último backup:', cfg.lastBackupAt || 'nunca');
  console.log(`Historial: ${list.length} copia(s)`);
  list.slice(0, 8).forEach((b) => {
    console.log(`  - ${b.type} · ${b.createdAt} · v${b.appVersion || '?'} · ${b.id.slice(0, 8)}`);
  });
  if (!list.length) {
    console.log('\nNo hay backups. Ejecuta: npm run backup:export');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || args.flags.help) {
    printHelp();
    process.exit(0);
  }

  try {
    if (cmd === 'export') await cmdExport(args._[1]);
    else if (cmd === 'restore') await cmdRestore(args._[1], { yes: !!args.flags.yes });
    else if (cmd === 'recover') {
      await cmdRecover(args._[1], {
        yes: !!args.flags.yes,
        password: typeof args.flags.password === 'string' ? args.flags.password : undefined
      });
    } else if (cmd === 'status') await cmdStatus();
    else {
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    try { await db.close(); } catch (_) { /* noop */ }
  }
}

main();

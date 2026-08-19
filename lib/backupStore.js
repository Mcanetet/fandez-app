const fs = require('fs');
const path = require('path');
const db = require('./db');

const BACKUPS_ROOT = path.join(__dirname, '../data/backups');
const CONFIG_KEY = 'backup_config';

function isAvailable() {
  return db.isConfigured();
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToBackupListItem(row) {
  const manifest = parseJson(row.manifest, {});
  return {
    ...manifest,
    id: row.id,
    folderName: row.folder_name || manifest.folderName || null,
    folderPath: row.folder_name ? path.join(BACKUPS_ROOT, row.folder_name) : null,
    storage: 'database'
  };
}

async function saveBackup({ id, manifest, snapshot, folderName = null }) {
  if (!isAvailable()) return false;
  await db.query(
    `INSERT INTO app_backups (id, backup_type, triggered_by, created_at, manifest, snapshot, folder_name, includes_uploads)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       backup_type = VALUES(backup_type),
       triggered_by = VALUES(triggered_by),
       created_at = VALUES(created_at),
       manifest = VALUES(manifest),
       snapshot = VALUES(snapshot),
       folder_name = VALUES(folder_name),
       includes_uploads = VALUES(includes_uploads)`,
    [
      id,
      manifest.type || 'manual',
      manifest.triggeredBy || null,
      new Date(manifest.createdAt || Date.now()),
      JSON.stringify(manifest),
      JSON.stringify(snapshot),
      folderName,
      manifest.includesUploads ? 1 : 0
    ]
  );
  return true;
}

async function listBackups() {
  if (!isAvailable()) return [];
  const res = await db.query(
    'SELECT id, backup_type, triggered_by, created_at, manifest, folder_name, includes_uploads FROM app_backups ORDER BY created_at DESC'
  );
  return res.rows.map(rowToBackupListItem);
}

async function getBackupById(id) {
  if (!isAvailable()) return null;
  const res = await db.query('SELECT * FROM app_backups WHERE id = ? LIMIT 1', [id]);
  if (!res.rows.length) return null;
  const row = res.rows[0];
  const manifest = parseJson(row.manifest, {});
  return {
    ...manifest,
    id: row.id,
    folderName: row.folder_name,
    folderPath: row.folder_name ? path.join(BACKUPS_ROOT, row.folder_name) : null,
    storage: 'database'
  };
}

async function readSnapshot(id) {
  if (!isAvailable()) return null;
  const res = await db.query('SELECT snapshot FROM app_backups WHERE id = ? LIMIT 1', [id]);
  if (!res.rows.length) return null;
  return parseJson(res.rows[0].snapshot, null);
}

async function deleteBackup(id) {
  if (!isAvailable()) return false;
  const existing = await getBackupById(id);
  if (!existing) return false;
  await db.query('DELETE FROM app_backups WHERE id = ?', [id]);
  return true;
}

async function loadConfig(defaultConfig) {
  if (!isAvailable()) return null;
  const res = await db.query('SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1', [CONFIG_KEY]);
  if (!res.rows.length) return null;
  return { ...defaultConfig, ...parseJson(res.rows[0].setting_value, {}) };
}

async function saveConfig(config) {
  if (!isAvailable()) return false;
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [CONFIG_KEY, JSON.stringify(config)]
  );
  return true;
}

async function migrateFromFilesystem() {
  if (!isAvailable() || !fs.existsSync(BACKUPS_ROOT)) return 0;

  const existing = await db.query('SELECT id FROM app_backups');
  const known = new Set(existing.rows.map((r) => r.id));
  let imported = 0;

  for (const name of fs.readdirSync(BACKUPS_ROOT)) {
    const folderPath = path.join(BACKUPS_ROOT, name);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const manifestPath = path.join(folderPath, 'manifest.json');
    const snapshotPath = path.join(folderPath, 'snapshot.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(snapshotPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.id || known.has(manifest.id)) continue;
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      await saveBackup({ id: manifest.id, manifest, snapshot, folderName: name });
      known.add(manifest.id);
      imported++;
    } catch (err) {
      console.warn('[Fandez Backup] No se pudo migrar backup en disco:', name, err.message);
    }
  }

  if (imported > 0) {
    console.log(`💾 ${imported} backup(s) migrados de disco a MySQL`);
  }
  return imported;
}

module.exports = {
  isAvailable,
  saveBackup,
  listBackups,
  getBackupById,
  readSnapshot,
  deleteBackup,
  loadConfig,
  saveConfig,
  migrateFromFilesystem,
  BACKUPS_ROOT
};

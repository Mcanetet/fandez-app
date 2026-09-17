/**
 * Offsite backup helpers (cifrado AES-256-GCM + gzip).
 *
 * Modo recomendado (sin humano):
 *   GitHub Actions en repo privado llama POST /backups/export-encrypted
 *   y guarda el .enc en ese mismo repo con GITHUB_TOKEN.
 *
 * Env en Hostinger (minimo):
 *   BACKUP_SYNC_TOKEN=...
 *   BACKUP_GITHUB_ENCRYPT_KEY=...
 *
 * Modo opcional (push desde el servidor):
 *   BACKUP_GITHUB_ENABLED=true
 *   BACKUP_GITHUB_TOKEN=...
 *   BACKUP_GITHUB_REPO=owner/fandez-backups
 */
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');

const SALT = 'fandez-backup-github-v1';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function hasEncryptKey() {
  return Boolean(env('BACKUP_GITHUB_ENCRYPT_KEY'));
}

function isGithubBackupEnabled() {
  return env('BACKUP_GITHUB_ENABLED').toLowerCase() === 'true'
    && Boolean(env('BACKUP_GITHUB_TOKEN'))
    && Boolean(env('BACKUP_GITHUB_REPO'))
    && hasEncryptKey();
}

function getStatus() {
  return {
    enabled: isGithubBackupEnabled(),
    exportReady: hasEncryptKey() && Boolean(env('BACKUP_SYNC_TOKEN') || env('BACKUP_GITHUB_SYNC_TOKEN')),
    repo: env('BACKUP_GITHUB_REPO') || null,
    branch: env('BACKUP_GITHUB_BRANCH', 'main'),
    retentionDays: Number(env('BACKUP_GITHUB_RETENTION_DAYS', '14')) || 14,
    configured: {
      token: Boolean(env('BACKUP_GITHUB_TOKEN')),
      encryptKey: hasEncryptKey(),
      repo: Boolean(env('BACKUP_GITHUB_REPO')),
      syncToken: Boolean(env('BACKUP_SYNC_TOKEN') || env('BACKUP_GITHUB_SYNC_TOKEN'))
    }
  };
}

function deriveKey(passphrase) {
  return crypto.scryptSync(String(passphrase), SALT, 32);
}

function encryptBuffer(plainBuf, passphrase) {
  const key = deriveKey(passphrase);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decryptBuffer(blob, passphrase) {
  const key = deriveKey(passphrase);
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function buildSafeManifest(manifest = {}) {
  return {
    id: manifest.id,
    type: manifest.type,
    triggeredBy: manifest.triggeredBy,
    createdAt: manifest.createdAt,
    schemaVersion: manifest.schemaVersion,
    appVersion: manifest.appVersion,
    appVersionLabel: manifest.appVersionLabel,
    gitCommit: manifest.gitCommit,
    includesUploads: false,
    includesSecurityLogs: manifest.includesSecurityLogs,
    encrypted: true,
    algorithm: 'aes-256-gcm+gzip',
    stats: {
      users: manifest.stats?.users,
      requests: manifest.stats?.requests,
      consents: manifest.stats?.consents,
      dataBytes: manifest.stats?.dataBytes
    }
  };
}

function encryptSnapshotPackage({ manifest, snapshot }) {
  const key = env('BACKUP_GITHUB_ENCRYPT_KEY');
  if (!key) return { error: 'Falta BACKUP_GITHUB_ENCRYPT_KEY en el servidor.' };
  if (!snapshot) return { error: 'Snapshot vacio' };

  const slim = { ...snapshot, uploads: undefined };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(slim), 'utf8'), { level: 9 });
  const enc = encryptBuffer(gz, key);
  if (enc.length > 70 * 1024 * 1024) {
    return { error: 'Backup demasiado grande (>70MB cifrado).' };
  }

  const date = String(manifest.createdAt || new Date().toISOString()).slice(0, 10);
  const shortId = String(manifest.id || 'x').slice(0, 8);
  const type = String(manifest.type || 'daily').replace(/[^a-z0-9_-]/gi, '') || 'daily';
  const baseName = `${date}-${shortId}`;
  const safeManifest = buildSafeManifest(manifest);

  return {
    success: true,
    type,
    date,
    baseName,
    encPath: `backups/${type}/${baseName}.enc`,
    manifestPath: `backups/${type}/${baseName}.manifest.json`,
    encBuffer: enc,
    manifestBuffer: Buffer.from(`${JSON.stringify(safeManifest, null, 2)}\n`, 'utf8'),
    safeManifest,
    bytes: enc.length
  };
}

function githubRequest(method, apiPath, body = null) {
  const token = env('BACKUP_GITHUB_TOKEN');
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'fandez-backup',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { json = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: json });
        } else {
          const msg = json?.message || raw || `HTTP ${res.statusCode}`;
          const err = new Error(`GitHub API ${res.statusCode}: ${msg}`);
          err.status = res.statusCode;
          err.data = json;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getFileSha(repo, branch, filePath) {
  try {
    const res = await githubRequest(
      'GET',
      `/repos/${repo}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(branch)}`
    );
    return res.data?.sha || null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function putFile(repo, branch, filePath, contentBuf, message) {
  const sha = await getFileSha(repo, branch, filePath);
  const body = {
    message,
    content: contentBuf.toString('base64'),
    branch
  };
  if (sha) body.sha = sha;
  return githubRequest('PUT', `/repos/${repo}/contents/${encodeURI(filePath)}`, body);
}

async function deleteFile(repo, branch, filePath, sha, message) {
  return githubRequest('DELETE', `/repos/${repo}/contents/${encodeURI(filePath)}`, {
    message,
    sha,
    branch
  });
}

async function listDir(repo, branch, dirPath) {
  try {
    const res = await githubRequest(
      'GET',
      `/repos/${repo}/contents/${encodeURI(dirPath)}?ref=${encodeURIComponent(branch)}`
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

async function applyGithubRetention(repo, branch, prefix, retentionDays) {
  const days = Math.max(3, Number(retentionDays) || 14);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const dirs = ['daily', 'weekly', 'monthly', 'manual', 'startup', 'scheduler'];
  let removed = 0;

  for (const type of dirs) {
    const entries = await listDir(repo, branch, `${prefix}/${type}`);
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      const m = String(entry.name || '').match(/^(\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      const ts = Date.parse(`${m[1]}T00:00:00Z`);
      if (!Number.isFinite(ts) || ts >= cutoff) continue;
      try {
        await deleteFile(repo, branch, entry.path, entry.sha, `chore: purge backup ${entry.name}`);
        removed += 1;
      } catch (err) {
        console.warn('[backup-github] no se pudo borrar', entry.path, err.message);
      }
    }
  }
  return removed;
}

async function pushBackupToGithub({ manifest, snapshot }) {
  if (!isGithubBackupEnabled()) {
    return { skipped: true, reason: 'disabled_or_incomplete_env' };
  }
  const packed = encryptSnapshotPackage({ manifest, snapshot });
  if (packed.error) return { error: packed.error };

  const repo = env('BACKUP_GITHUB_REPO');
  const branch = env('BACKUP_GITHUB_BRANCH', 'main');
  const retentionDays = Number(env('BACKUP_GITHUB_RETENTION_DAYS', '14')) || 14;

  await putFile(repo, branch, packed.encPath, packed.encBuffer, `backup(${packed.type}): ${packed.date} ${packed.baseName}`);
  await putFile(repo, branch, packed.manifestPath, packed.manifestBuffer, `backup manifest(${packed.type}): ${packed.date}`);

  let removed = 0;
  try {
    removed = await applyGithubRetention(repo, branch, 'backups', retentionDays);
  } catch (err) {
    console.warn('[backup-github] retencion:', err.message);
  }

  return {
    success: true,
    repo,
    branch,
    path: packed.encPath,
    manifestPath: packed.manifestPath,
    bytes: packed.bytes,
    removed
  };
}

module.exports = {
  isGithubBackupEnabled,
  getStatus,
  encryptSnapshotPackage,
  pushBackupToGithub,
  encryptBuffer,
  decryptBuffer,
  deriveKey,
  hasEncryptKey
};

/**
 * Bandeja de alertas operativas para Fandez Admin (PWA privada).
 * Los agentes encolan aquí; el founder resuelve desde el celular.
 */
'use strict';

const crypto = require('crypto');
const db = require('../db');
const webPush = require('../webPush');
const { founderEmails } = require('../founderGates');

let memory = [];
let tableReady = false;

async function ensureTable() {
  if (!db.isConfigured || !db.isConfigured()) return false;
  if (tableReady) return true;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ops_inbox (
      id VARCHAR(64) PRIMARY KEY,
      agent VARCHAR(64) NOT NULL DEFAULT 'Sofía',
      severity VARCHAR(32) NOT NULL DEFAULT 'high',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      link VARCHAR(512) DEFAULT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      meta_json JSON DEFAULT NULL,
      created_at DATETIME NOT NULL,
      resolved_at DATETIME DEFAULT NULL,
      resolved_by VARCHAR(64) DEFAULT NULL,
      KEY idx_ops_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
  return true;
}

function newId() {
  return `ops-${crypto.randomBytes(8).toString('hex')}`;
}

function toRow(item) {
  return {
    id: item.id,
    agent: item.agent,
    severity: item.severity,
    title: item.title,
    body: item.body,
    link: item.link || null,
    status: item.status || 'open',
    meta: item.meta || null,
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || null
  };
}

/**
 * @returns {Promise<object>}
 */
async function enqueue({
  agent = 'Sofía',
  severity = 'high',
  title,
  body,
  link = null,
  meta = null,
  push = true,
  store = null
} = {}) {
  if (!title || !body) return null;
  const item = {
    id: newId(),
    agent: String(agent).slice(0, 64),
    severity: String(severity || 'high').slice(0, 32),
    title: String(title).slice(0, 255),
    body: String(body).slice(0, 8000),
    link: link ? String(link).slice(0, 512) : null,
    status: 'open',
    meta: meta && typeof meta === 'object' ? meta : null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null
  };

  memory.unshift(item);
  if (memory.length > 500) memory = memory.slice(0, 500);

  try {
    if (await ensureTable()) {
      const now = item.createdAt.slice(0, 19).replace('T', ' ');
      await db.query(
        `INSERT INTO ops_inbox
          (id, agent, severity, title, body, link, status, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        [
          item.id,
          item.agent,
          item.severity,
          item.title,
          item.body,
          item.link,
          item.meta ? JSON.stringify(item.meta) : null,
          now
        ]
      );
    }
  } catch (err) {
    console.warn('[ops-inbox] persist:', err.message);
  }

  if (push) {
    try {
      await pushToAdmins(store, item);
    } catch (err) {
      console.warn('[ops-inbox] push:', err.message);
    }
  }

  return toRow(item);
}

function adminUserIds(store) {
  const users = store?.USERS || [];
  const founders = new Set(founderEmails());
  return users
    .filter((u) => u.role === 'admin' && u.active !== false)
    .filter((u) => !founders.size || founders.has(String(u.email || '').toLowerCase()) || founders.size === 0)
    .map((u) => u.id)
    .filter(Boolean);
}

async function pushToAdmins(store, item) {
  if (!webPush.isReady()) return { sent: 0 };
  let storeRef = store;
  if (!storeRef || !storeRef.USERS) {
    try { storeRef = require('../../models/store'); } catch (_) { storeRef = null; }
  }
  const ids = adminUserIds(storeRef);
  // Si no hay match por founder email, avisar a todos los admins activos.
  const target = ids.length
    ? ids
    : (storeRef?.USERS || []).filter((u) => u.role === 'admin' && u.active !== false).map((u) => u.id);
  if (!target.length) return { sent: 0 };

  const appMode = require('../appMode');
  const base = appMode.getAdminBasePath();
  const url = item.link || `${base}/app?alert=${encodeURIComponent(item.id)}`;

  return webPush.notifyUsers(target, {
    title: `Fandez Admin · ${item.agent}`,
    body: item.title,
    url,
    tag: `ops-${item.id}`,
    requireInteraction: ['critical', 's1', 'high'].includes(String(item.severity).toLowerCase()),
    icon: '/icons/fandez-admin-notify.png?v=1',
    badge: '/icons/fandez-admin-96.png?v=1'
  });
}

async function listOpen({ limit = 50 } = {}) {
  try {
    if (await ensureTable()) {
      const result = await db.query(
        `SELECT id, agent, severity, title, body, link, status, meta_json AS metaJson,
                created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy
         FROM ops_inbox
         WHERE status = 'open'
         ORDER BY created_at DESC
         LIMIT ?`,
        [Math.min(100, Math.max(1, limit))]
      );
      return (result.rows || []).map((r) => ({
        id: r.id,
        agent: r.agent,
        severity: r.severity,
        title: r.title,
        body: r.body,
        link: r.link,
        status: r.status,
        meta: typeof r.metaJson === 'string' ? JSON.parse(r.metaJson || 'null') : r.metaJson,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        resolvedBy: r.resolvedBy
      }));
    }
  } catch (err) {
    console.warn('[ops-inbox] list:', err.message);
  }
  return memory.filter((m) => m.status === 'open').slice(0, limit).map(toRow);
}

async function listRecent({ limit = 80 } = {}) {
  try {
    if (await ensureTable()) {
      const result = await db.query(
        `SELECT id, agent, severity, title, body, link, status, meta_json AS metaJson,
                created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy
         FROM ops_inbox
         ORDER BY created_at DESC
         LIMIT ?`,
        [Math.min(200, Math.max(1, limit))]
      );
      return (result.rows || []).map((r) => ({
        id: r.id,
        agent: r.agent,
        severity: r.severity,
        title: r.title,
        body: r.body,
        link: r.link,
        status: r.status,
        meta: typeof r.metaJson === 'string' ? JSON.parse(r.metaJson || 'null') : r.metaJson,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        resolvedBy: r.resolvedBy
      }));
    }
  } catch (_) { /* fallthrough */ }
  return memory.slice(0, limit).map(toRow);
}

async function resolve(id, { byUserId = null } = {}) {
  const now = new Date().toISOString();
  const mem = memory.find((m) => m.id === id);
  if (mem) {
    mem.status = 'resolved';
    mem.resolvedAt = now;
    mem.resolvedBy = byUserId;
  }
  try {
    if (await ensureTable()) {
      await db.query(
        `UPDATE ops_inbox SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?`,
        [now.slice(0, 19).replace('T', ' '), byUserId, id]
      );
    }
  } catch (err) {
    console.warn('[ops-inbox] resolve:', err.message);
  }
  return mem ? toRow(mem) : { id, status: 'resolved', resolvedAt: now, resolvedBy: byUserId };
}

async function openCount() {
  const open = await listOpen({ limit: 100 });
  return open.length;
}

module.exports = {
  enqueue,
  listOpen,
  listRecent,
  resolve,
  openCount,
  ensureTable,
  adminUserIds
};

/**
 * Web Push (notificaciones del sistema estilo WhatsApp).
 * Icono Fandez en la barra del celular aunque la app esté cerrada.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./db');
const company = require('../config/company');

const VAPID_FILE = path.join(__dirname, '../data/vapid-keys.json');
let ready = false;
let publicKey = '';

function appOrigin() {
  const raw = process.env.APP_URL || company.website || 'https://www.fandez.cl';
  return String(raw).replace(/\/$/, '');
}

function absoluteIcon(rel) {
  return `${appOrigin()}${rel.startsWith('/') ? rel : `/${rel}`}`;
}

function loadOrCreateVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim()
    };
  }
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      if (parsed.publicKey && parsed.privateKey) return parsed;
    }
  } catch (_) { /* ignore */ }

  const keys = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(path.dirname(VAPID_FILE), { recursive: true });
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  } catch (err) {
    console.warn('[web-push] no se pudo guardar VAPID en disco:', err.message);
  }
  return keys;
}

async function ensureTable() {
  if (!db.isConfigured()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_push_endpoint (endpoint(191)),
      KEY idx_push_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function init() {
  try {
    const keys = loadOrCreateVapid();
    publicKey = keys.publicKey;
    const subject = process.env.VAPID_SUBJECT
      || `mailto:${process.env.SUPPORT_EMAIL || 'soporte@fandez.cl'}`;
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    ready = true;
    ensureTable().catch((err) => {
      console.warn('[web-push] tabla:', err.message);
    });
    console.log('✓ Web Push listo (notificaciones de sistema)');
  } catch (err) {
    ready = false;
    console.warn('[web-push] no inicializado:', err.message);
  }
}

function getPublicKey() {
  return ready ? publicKey : '';
}

function isReady() {
  return ready;
}

function subId(endpoint) {
  return 'push-' + crypto.createHash('sha1').update(String(endpoint)).digest('hex').slice(0, 24);
}

async function saveSubscription(userId, subscription, userAgent = '') {
  if (!ready || !userId || !subscription?.endpoint || !subscription?.keys) {
    throw new Error('Suscripción inválida');
  }
  await ensureTable();
  const id = subId(subscription.endpoint);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.query(
    `INSERT INTO push_subscriptions
      (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      user_agent = VALUES(user_agent),
      updated_at = VALUES(updated_at)`,
    [
      id,
      String(userId),
      String(subscription.endpoint),
      String(subscription.keys.p256dh || ''),
      String(subscription.keys.auth || ''),
      String(userAgent || '').slice(0, 255),
      now,
      now
    ]
  );
  return { id, userId };
}

async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [String(endpoint)]);
}

async function getSubscriptionsForUsers(userIds) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length || !db.isConfigured()) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.query(
    `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    ids
  );
  return (result.rows || []).map((row) => ({
    userId: row.user_id,
    subscription: {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    }
  }));
}

async function sendToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: 'high'
    });
    return true;
  } catch (err) {
    const code = err.statusCode || err.status;
    if (code === 404 || code === 410) {
      await removeSubscription(subscription.endpoint).catch(() => {});
    } else {
      console.warn('[web-push] send fail:', code || err.message);
    }
    return false;
  }
}

function buildPayload({ title, body, url, tag, requireInteraction }) {
  return {
    title: title || 'Fandez',
    body: body || '',
    icon: absoluteIcon('/icons/fandez-v8-notify.png?v=20260906v8'),
    badge: absoluteIcon('/icons/fandez-v8-notify.png?v=20260906v8'),
    url: url || '/',
    tag: tag || 'fandez',
    requireInteraction: !!requireInteraction,
    renotify: true
  };
}

async function notifyUsers(userIds, opts = {}) {
  if (!ready) return { sent: 0 };
  const rows = await getSubscriptionsForUsers(userIds);
  if (!rows.length) return { sent: 0 };
  const payload = buildPayload(opts);
  let sent = 0;
  await Promise.all(rows.map(async (row) => {
    const ok = await sendToSubscription(row.subscription, payload);
    if (ok) sent += 1;
  }));
  return { sent, total: rows.length };
}

module.exports = {
  init,
  isReady,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  notifyUsers,
  absoluteIcon,
  appOrigin
};

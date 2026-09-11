/**
 * Session store MySQL (persistente entre reinicios de Node / Hostinger).
 * Sin esto, express-session usa memoria y al volver de una notificación
 * el usuario cae en /login aunque no haya cerrado sesión.
 */

'use strict';

const session = require('express-session');
const db = require('./db');

const TABLE = 'fandez_sessions';

class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    this._ready = null;
  }

  ensureTable() {
    if (this._ready) return this._ready;
    this._ready = db.raw(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        session_id VARCHAR(128) NOT NULL PRIMARY KEY,
        expires DATETIME NOT NULL,
        data MEDIUMTEXT NOT NULL,
        INDEX idx_fandez_sessions_expires (expires)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch((err) => {
      this._ready = null;
      throw err;
    });
    return this._ready;
  }

  get(sid, callback) {
    this.ensureTable()
      .then(() => db.query(
        `SELECT data, expires FROM ${TABLE} WHERE session_id = ? LIMIT 1`,
        [sid]
      ))
      .then(({ rows }) => {
        const row = rows && rows[0];
        if (!row) return callback(null, null);
        const expires = new Date(row.expires);
        if (Number.isFinite(expires.getTime()) && expires.getTime() <= Date.now()) {
          return this.destroy(sid, () => callback(null, null));
        }
        try {
          const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          return callback(null, data);
        } catch (err) {
          return callback(err);
        }
      })
      .catch((err) => callback(err));
  }

  set(sid, sess, callback) {
    let maxAge = sess?.cookie?.maxAge;
    if (!Number.isFinite(maxAge) || maxAge <= 0) maxAge = 30 * 24 * 60 * 60 * 1000;
    const expires = new Date(Date.now() + maxAge);
    const payload = JSON.stringify(sess);
    this.ensureTable()
      .then(() => db.query(
        `INSERT INTO ${TABLE} (session_id, expires, data)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
        [sid, expires, payload]
      ))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback) {
    this.ensureTable()
      .then(() => db.query(`DELETE FROM ${TABLE} WHERE session_id = ?`, [sid]))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback) {
    let maxAge = sess?.cookie?.maxAge;
    if (!Number.isFinite(maxAge) || maxAge <= 0) maxAge = 30 * 24 * 60 * 60 * 1000;
    const expires = new Date(Date.now() + maxAge);
    this.ensureTable()
      .then(() => db.query(
        `UPDATE ${TABLE} SET expires = ? WHERE session_id = ?`,
        [expires, sid]
      ))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  clear(callback) {
    this.ensureTable()
      .then(() => db.query(`DELETE FROM ${TABLE}`))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  /** Limpia sesiones vencidas (llamar de vez en cuando). */
  reap() {
    return this.ensureTable()
      .then(() => db.query(`DELETE FROM ${TABLE} WHERE expires < NOW()`))
      .catch((err) => {
        console.warn('[session-store] reap:', err.message);
      });
  }
}

function createSessionStore() {
  if (!db.isConfigured()) {
    console.warn('[session-store] Sin MySQL: sesiones en memoria (se pierden al reiniciar).');
    return null;
  }
  const store = new MySQLSessionStore();
  store.ensureTable()
    .then(() => {
      console.log('[session-store] MySQL listo (sesiones persistentes)');
      store.reap();
      setInterval(() => store.reap(), 60 * 60 * 1000).unref?.();
    })
    .catch((err) => {
      console.error('[session-store] No se pudo crear tabla:', err.message);
    });
  return store;
}

module.exports = {
  MySQLSessionStore,
  createSessionStore
};

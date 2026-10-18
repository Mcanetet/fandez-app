/**
 * Persistencia de DTE en MySQL (tabla sii_dtes) + fallback en memoria si no hay DB.
 */
'use strict';

const db = require('../db');
const memory = new Map();

async function ensureTable() {
  if (!db.isConfigured()) return false;
  await db.raw(`
    CREATE TABLE IF NOT EXISTS sii_dtes (
      id VARCHAR(64) PRIMARY KEY,
      request_id VARCHAR(64) NOT NULL,
      provider_id VARCHAR(64) NULL,
      phase VARCHAR(40) NOT NULL DEFAULT 'fandez_margin',
      dte_type SMALLINT NOT NULL DEFAULT 33,
      folio INT NOT NULL,
      emitter_rut VARCHAR(16) NOT NULL,
      receptor_rut VARCHAR(16) NOT NULL,
      receptor_name VARCHAR(200) NOT NULL,
      neto INT NOT NULL DEFAULT 0,
      iva INT NOT NULL DEFAULT 0,
      total INT NOT NULL DEFAULT 0,
      commission_clp INT NOT NULL DEFAULT 0,
      card_fee_clp INT NOT NULL DEFAULT 0,
      sii_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      track_id VARCHAR(64) NULL,
      xml_path TEXT NULL,
      pdf_path TEXT NULL,
      pdf_url VARCHAR(255) NULL,
      idempotency_hash CHAR(64) NOT NULL,
      environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
      error_message TEXT NULL,
      signed_at DATETIME NULL,
      sent_at DATETIME NULL,
      accepted_at DATETIME NULL,
      last_poll_at DATETIME NULL,
      meta JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_sii_dtes_idempotency (idempotency_hash),
      UNIQUE KEY uq_sii_dtes_type_folio_env (dte_type, folio, environment),
      INDEX idx_sii_dtes_request (request_id),
      INDEX idx_sii_dtes_status (sii_status),
      INDEX idx_sii_dtes_track (track_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  return true;
}

function rowToDoc(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    providerId: row.provider_id,
    phase: row.phase,
    dteType: row.dte_type,
    folio: row.folio,
    emitterRut: row.emitter_rut,
    receptorRut: row.receptor_rut,
    receptorName: row.receptor_name,
    neto: row.neto,
    iva: row.iva,
    total: row.total,
    commissionClp: row.commission_clp,
    cardFeeClp: row.card_fee_clp,
    siiStatus: row.sii_status,
    trackId: row.track_id,
    xmlPath: row.xml_path,
    pdfPath: row.pdf_path,
    pdfUrl: row.pdf_url,
    idempotencyHash: row.idempotency_hash,
    environment: row.environment,
    errorMessage: row.error_message,
    signedAt: row.signed_at,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    lastPollAt: row.last_poll_at,
    meta: typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : (row.meta || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findByIdempotencyHash(hash) {
  if (!hash) return null;
  if (!db.isConfigured()) return memory.get(`hash:${hash}`) || null;
  await ensureTable();
  const rows = await db.query('SELECT * FROM sii_dtes WHERE idempotency_hash = ? LIMIT 1', [hash]);
  return rowToDoc(rows?.[0]);
}

async function findById(id) {
  if (!id) return null;
  if (!db.isConfigured()) return memory.get(`id:${id}`) || null;
  await ensureTable();
  const rows = await db.query('SELECT * FROM sii_dtes WHERE id = ? LIMIT 1', [id]);
  return rowToDoc(rows?.[0]);
}

async function listPendingPoll(limit = 20) {
  if (!db.isConfigured()) {
    return [...memory.values()].filter((d) => d && d.siiStatus === 'sent' && d.trackId).slice(0, limit);
  }
  await ensureTable();
  const rows = await db.query(
    `SELECT * FROM sii_dtes
     WHERE sii_status IN ('sent', 'processing') AND track_id IS NOT NULL
     ORDER BY COALESCE(last_poll_at, created_at) ASC
     LIMIT ?`,
    [limit]
  );
  return (rows || []).map(rowToDoc);
}

async function listRecent(limit = 40) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 40));
  if (!db.isConfigured()) {
    return [...memory.values()]
      .filter((d) => d && d.id)
      .sort((a, b) => String(b.signedAt || b.createdAt || '').localeCompare(String(a.signedAt || a.createdAt || '')))
      .slice(0, lim);
  }
  await ensureTable();
  const rows = await db.query(
    `SELECT * FROM sii_dtes
     ORDER BY COALESCE(signed_at, created_at) DESC
     LIMIT ?`,
    [lim]
  );
  return (rows || []).map(rowToDoc);
}

async function save(doc) {
  const record = {
    id: doc.id,
    request_id: doc.requestId,
    provider_id: doc.providerId || null,
    phase: doc.phase || 'fandez_margin',
    dte_type: doc.dteType || 33,
    folio: doc.folio,
    emitter_rut: doc.emitterRut,
    receptor_rut: doc.receptorRut,
    receptor_name: doc.receptorName,
    neto: doc.neto,
    iva: doc.iva,
    total: doc.total,
    commission_clp: doc.commissionClp || 0,
    card_fee_clp: doc.cardFeeClp || 0,
    sii_status: doc.siiStatus || 'pending',
    track_id: doc.trackId || null,
    xml_path: doc.xmlPath || null,
    pdf_path: doc.pdfPath || null,
    pdf_url: doc.pdfUrl || null,
    idempotency_hash: doc.idempotencyHash,
    environment: doc.environment || 'sandbox',
    error_message: doc.errorMessage || null,
    signed_at: doc.signedAt || null,
    sent_at: doc.sentAt || null,
    accepted_at: doc.acceptedAt || null,
    last_poll_at: doc.lastPollAt || null,
    meta: JSON.stringify(doc.meta || {})
  };

  if (!db.isConfigured()) {
    memory.set(`id:${doc.id}`, doc);
    memory.set(`hash:${doc.idempotencyHash}`, doc);
    return doc;
  }

  await ensureTable();
  await db.query(
    `INSERT INTO sii_dtes (
      id, request_id, provider_id, phase, dte_type, folio, emitter_rut, receptor_rut, receptor_name,
      neto, iva, total, commission_clp, card_fee_clp, sii_status, track_id, xml_path, pdf_path, pdf_url,
      idempotency_hash, environment, error_message, signed_at, sent_at, accepted_at, last_poll_at, meta
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      sii_status = VALUES(sii_status),
      track_id = VALUES(track_id),
      xml_path = VALUES(xml_path),
      pdf_path = VALUES(pdf_path),
      pdf_url = VALUES(pdf_url),
      error_message = VALUES(error_message),
      signed_at = VALUES(signed_at),
      sent_at = VALUES(sent_at),
      accepted_at = VALUES(accepted_at),
      last_poll_at = VALUES(last_poll_at),
      meta = VALUES(meta)`,
    [
      record.id, record.request_id, record.provider_id, record.phase, record.dte_type, record.folio,
      record.emitter_rut, record.receptor_rut, record.receptor_name, record.neto, record.iva, record.total,
      record.commission_clp, record.card_fee_clp, record.sii_status, record.track_id, record.xml_path,
      record.pdf_path, record.pdf_url, record.idempotency_hash, record.environment, record.error_message,
      record.signed_at, record.sent_at, record.accepted_at, record.last_poll_at, record.meta
    ]
  );
  return doc;
}

module.exports = {
  ensureTable,
  findByIdempotencyHash,
  findById,
  listPendingPoll,
  listRecent,
  save
};

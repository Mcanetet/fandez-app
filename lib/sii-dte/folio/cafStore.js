'use strict';

const fs = require('fs');
const path = require('path');
const {
  getConfig,
  normalizeRut,
  normalizeCafEnvironment,
  cafPathForEnv,
  cafFileName
} = require('../config');
const { parseCafXml, inspectCaf, loadCafForType } = require('./caf');

const CAF_TYPES = [33, 61, 46, 43];
const MAX_XML_BYTES = 400 * 1024;

function typeLabel(dteType) {
  const t = Number(dteType);
  if (t === 61) return 'NC 61';
  if (t === 46) return 'FC 46';
  if (t === 43) return 'LF 43';
  return 'FV 33';
}

function publicRow(row) {
  if (!row) return row;
  return {
    dteType: row.dteType,
    label: typeLabel(row.dteType),
    missing: Boolean(row.missing),
    error: row.error || null,
    level: row.level || 'ok',
    alerts: row.alerts || [],
    remaining: row.remaining,
    nextFolio: row.nextFolio,
    folioFrom: row.folioFrom,
    folioTo: row.folioTo,
    range: row.range,
    authorizedAt: row.authorizedAt || null,
    expiresAt: row.expiresAt || null,
    daysToExpiry: row.daysToExpiry,
    file: row.file || null
  };
}

function inspectPath(dteType, cafPath) {
  const file = cafPath ? `${normalizeCafEnvironment(path.basename(path.dirname(cafPath)))}/${cafFileName(dteType)}` : null;
  try {
    if (!cafPath || !fs.existsSync(cafPath)) {
      return publicRow({
        dteType,
        missing: true,
        level: 'ok',
        alerts: [],
        remaining: null,
        nextFolio: null,
        file
      });
    }
    const caf = loadCafForType(dteType, cafPath);
    return publicRow({
      ...inspectCaf(caf, `${cafPath}.folio`),
      missing: false,
      file
    });
  } catch (err) {
    return publicRow({
      dteType,
      missing: false,
      error: err.message,
      level: 'critical',
      alerts: [{ level: 'critical', code: 'invalid', message: `CAF tipo ${dteType}: ${err.message}` }],
      file
    });
  }
}

function inspectEnvironment(environment, cfg = getConfig()) {
  const env = normalizeCafEnvironment(environment);
  return CAF_TYPES.map((type) => inspectPath(type, cafPathForEnv(cfg, type, env)));
}

function inspectBothEnvironments(cfg = getConfig()) {
  return {
    sandbox: inspectEnvironment('sandbox', cfg),
    production: inspectEnvironment('production', cfg)
  };
}

function assertCafXml(xml) {
  const raw = String(xml || '');
  if (!raw.trim()) {
    const err = new Error('El archivo está vacío.');
    err.code = 'CAF_EMPTY';
    throw err;
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_XML_BYTES) {
    const err = new Error('El XML supera 400 KB.');
    err.code = 'CAF_TOO_LARGE';
    throw err;
  }
  if (raw.includes('\u0000')) {
    const err = new Error('El archivo no es un XML válido.');
    err.code = 'CAF_BINARY';
    throw err;
  }
  if (!/<AUTORIZACION\b/i.test(raw) && !/<CAF\b/i.test(raw)) {
    const err = new Error('No parece un CAF del SII (falta AUTORIZACION o CAF).');
    err.code = 'CAF_SHAPE';
    throw err;
  }
  return parseCafXml(raw);
}

function saveCafUpload({ xml, environment, expectedType = null, emitterRut = '' }) {
  const env = normalizeCafEnvironment(environment);
  const parsed = assertCafXml(xml);
  const type = Number(parsed.dteType);
  if (!CAF_TYPES.includes(type)) {
    const err = new Error(`Tipo de DTE no soportado (${type}). Usa 33, 61, 46 o 43.`);
    err.code = 'CAF_TYPE';
    throw err;
  }
  if (expectedType && Number(expectedType) !== type) {
    const err = new Error(`El XML es tipo ${type}, no ${expectedType}.`);
    err.code = 'CAF_TYPE_MISMATCH';
    throw err;
  }
  const expectedRut = normalizeRut(emitterRut || getConfig().emitterRut);
  if (expectedRut && normalizeRut(parsed.rut) !== expectedRut) {
    const err = new Error(`El CAF es del RUT ${parsed.rut}, no de Fandez (${expectedRut}).`);
    err.code = 'CAF_RUT';
    throw err;
  }

  const dest = cafPathForEnv(getConfig(), type, env);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  if (fs.existsSync(dest)) {
    fs.copyFileSync(dest, `${dest}.bak`);
  }
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, String(xml), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, dest);
  try { fs.chmodSync(dest, 0o600); } catch (_) { /* windows */ }

  return {
    success: true,
    environment: env,
    dteType: type,
    label: typeLabel(type),
    rut: parsed.rut,
    folioFrom: parsed.folioFrom,
    folioTo: parsed.folioTo,
    authorizedAt: parsed.authorizedAt || null,
    file: `${env}/${cafFileName(type)}`,
    status: inspectPath(type, dest)
  };
}

module.exports = {
  CAF_TYPES,
  MAX_XML_BYTES,
  typeLabel,
  inspectEnvironment,
  inspectBothEnvironments,
  saveCafUpload,
  assertCafXml
};

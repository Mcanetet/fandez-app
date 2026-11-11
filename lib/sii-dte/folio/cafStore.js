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
const { parseCafXml, inspectCaf, loadCafForType, normalizeCafXmlText } = require('./caf');

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
    // Repara .folio corrupto de forma síncrona (folios fuera de rango) antes de inspeccionar.
    repairFolioCounterSync(cafPath, caf.folioFrom, caf.folioTo);
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

/** Quita contadores .folio fuera del rango del CAF (p. ej. 406309 en un CAF 1–30). */
function repairFolioCounterSync(cafPath, folioFrom, folioTo) {
  const counterPath = `${cafPath}.folio`;
  if (!fs.existsSync(counterPath)) return;
  const from = Number(folioFrom) || 1;
  const to = Number(folioTo) || from;
  const cur = parseInt(fs.readFileSync(counterPath, 'utf8'), 10);
  if (!Number.isFinite(cur) || cur < from - 1 || cur > to) {
    try { fs.unlinkSync(counterPath); } catch (_) { /* ignore */ }
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
  const raw = normalizeCafXmlText(xml);
  if (!raw.trim()) {
    const err = new Error('El archivo está vacío.');
    err.code = 'CAF_EMPTY';
    throw err;
  }
  if (Buffer.byteLength(raw, 'latin1') > MAX_XML_BYTES) {
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

async function saveCafUpload({ xml, environment, expectedType = null, emitterRut = '' }) {
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
  // Guardar en ISO-8859-1: es el encoding oficial de los CAF del SII
  const payload = Buffer.from(normalizeCafXmlText(xml), 'latin1');
  fs.writeFileSync(tmp, payload, { mode: 0o600 });
  fs.renameSync(tmp, dest);
  try { fs.chmodSync(dest, 0o600); } catch (_) { /* windows */ }

  // Si el contador .folio se perdió o quedó corrupto (folios dry-run fuera de rango),
  // alinear solo con folios reales del CAF.
  const synced = await syncFolioCounterFromIssued(dest, type, parsed.folioFrom, parsed.folioTo);
  const status = inspectPath(type, dest);

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
    absolutePath: dest,
    nextFolio: status.nextFolio,
    syncedLastFolio: synced.lastFolio,
    status
  };
}

/**
 * Alinea el contador .folio con folios YA emitidos que caen en el rango del CAF.
 * Ignora folios dry-run / mock fuera de folioFrom–folioTo (p. ej. 406309).
 * Si el .folio actual está fuera de rango (corrupto), lo repara.
 */
async function syncFolioCounterFromIssued(cafPath, dteType, folioFrom, folioTo = null) {
  const counterPath = `${cafPath}.folio`;
  const from = Number(folioFrom) || 1;
  const to = Number(folioTo) > 0 ? Number(folioTo) : from + 999999;
  let current = null;
  if (fs.existsSync(counterPath)) {
    current = parseInt(fs.readFileSync(counterPath, 'utf8'), 10);
  }
  const currentOk = Number.isFinite(current) && current >= from - 1 && current <= to;

  let maxUsed = from - 1;
  try {
    const repo = require('../repository');
    const docs = typeof repo.listRecent === 'function' ? await repo.listRecent(500) : [];
    for (const d of docs || []) {
      if (Number(d.dteType) !== Number(dteType)) continue;
      const f = parseInt(d.folio, 10);
      if (!Number.isFinite(f) || f < from || f > to) continue;
      if (f > maxUsed) maxUsed = f;
    }
  } catch (_) { /* sin repo aún */ }

  // Contador sano y >= max emitido en rango: no tocar.
  if (currentOk && current >= maxUsed) {
    return { lastFolio: current, wrote: false, repaired: false };
  }

  if (maxUsed >= from) {
    fs.writeFileSync(counterPath, String(maxUsed), { encoding: 'utf8', mode: 0o600 });
    return { lastFolio: maxUsed, wrote: true, repaired: Boolean(current != null && !currentOk) };
  }

  // Sin folios reales en rango: si el contador estaba corrupto, bórralo para reiniciar en folioFrom.
  if (current != null && !currentOk) {
    try { fs.unlinkSync(counterPath); } catch (_) { /* ignore */ }
    return { lastFolio: null, wrote: true, repaired: true };
  }
  return { lastFolio: currentOk ? current : null, wrote: false, repaired: false };
}

async function listUsedFoliosSummary(limit = 20) {
  try {
    const repo = require('../repository');
    const docs = typeof repo.listRecent === 'function' ? await repo.listRecent(200) : [];
    const byType = new Map();
    for (const d of docs || []) {
      const t = Number(d.dteType) || 33;
      const f = parseInt(d.folio, 10);
      if (!Number.isFinite(f)) continue;
      if (!byType.has(t)) byType.set(t, { dteType: t, label: typeLabel(t), maxFolio: f, count: 0, samples: [] });
      const row = byType.get(t);
      row.count += 1;
      if (f > row.maxFolio) row.maxFolio = f;
      if (row.samples.length < 5) {
        row.samples.push({ folio: f, status: d.siiStatus || '', id: d.id });
      }
    }
    return [...byType.values()].sort((a, b) => a.dteType - b.dteType).slice(0, limit);
  } catch (_) {
    return [];
  }
}

module.exports = {
  CAF_TYPES,
  MAX_XML_BYTES,
  typeLabel,
  inspectEnvironment,
  inspectBothEnvironments,
  saveCafUpload,
  syncFolioCounterFromIssued,
  listUsedFoliosSummary,
  assertCafXml
};

/**
 * CAF (Código de Autorización de Folios) — XML del SII.
 * Contiene rango de folios autorizados y la llave privada RSA para el TED.
 */
'use strict';

const fs = require('fs');
const forge = require('node-forge');
const { assertReadable } = require('../config');

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Los CAF del SII vienen en ISO-8859-1 (p. ej. GESTIÓN).
 * Si se leen como UTF-8, Chrome/Node rompen en la tilde.
 */
function decodeCafXmlBuffer(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (!bytes.length) return '';
  const asUtf8 = bytes.toString('utf8');
  if (!asUtf8.includes('\uFFFD')) {
    // UTF-8 limpio (tests / CAF ya normalizado)
    return asUtf8;
  }
  return bytes.toString('latin1');
}

function normalizeCafXmlText(xml) {
  if (Buffer.isBuffer(xml)) return decodeCafXmlBuffer(xml);
  return String(xml || '');
}

function parseCafXml(xml) {
  xml = normalizeCafXmlText(xml);
  const d = extractTag(xml, 'DA') || xml;
  const rut = extractTag(d, 'RE') || extractTag(xml, 'RE');
  const td = parseInt(extractTag(d, 'TD') || extractTag(xml, 'TD') || '33', 10);
  const rng = extractTag(d, 'RNG') || '';
  const dFrom = parseInt(extractTag(rng, 'D') || extractTag(d, 'D') || '1', 10);
  const dTo = parseInt(extractTag(rng, 'H') || extractTag(d, 'H') || String(dFrom), 10);
  const fa = extractTag(d, 'FA') || extractTag(xml, 'FA');
  const rsask = extractTag(xml, 'RSASK') || extractTag(d, 'RSASK');
  const rsapubk = extractTag(xml, 'RSAPUBK') || extractTag(d, 'RSAPUBK');
  const cafId = extractTag(xml, 'CAF') ? 'embedded' : 'file';

  if (!rut || !rsask) {
    throw new Error('CAF inválido: faltan RE o RSASK');
  }

  return {
    rut: String(rut).toUpperCase(),
    dteType: td,
    folioFrom: dFrom,
    folioTo: dTo,
    authorizedAt: fa,
    privateKeyPem: rsask.includes('BEGIN')
      ? rsask
      : `-----BEGIN RSA PRIVATE KEY-----\n${rsask.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`,
    publicKeyPem: rsapubk
      ? (rsapubk.includes('BEGIN')
        ? rsapubk
        : `-----BEGIN PUBLIC KEY-----\n${rsapubk.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`)
      : null,
    rawXml: xml,
    // Fragmento completo <CAF ...>...</CAF> (incluye DA + FRMA). No re-envolver.
    cafFragment: (xml.match(/<CAF\b[^>]*>[\s\S]*?<\/CAF>/i) || [])[0] || null,
    id: cafId
  };
}

function loadCaf(filePath) {
  assertReadable(filePath, 'CAF');
  const xml = decodeCafXmlBuffer(fs.readFileSync(filePath));
  return parseCafXml(xml);
}

function getPrivateKey(caf) {
  return forge.pki.privateKeyFromPem(caf.privateKeyPem);
}

/** Res. Ex. SII N° 58/2017: CAF de DTE con crédito fiscal vale 6 meses desde FA. */
const CAF_VALIDITY_MONTHS = 6;
const EXPIRY_WARN_DAYS = 30;
const EXPIRY_URGENT_DAYS = 7;

function todayYmd(now = new Date()) {
  try {
    return now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  } catch (_) {
    return new Date(now).toISOString().slice(0, 10);
  }
}

function addMonthsYmd(ymd, months) {
  const parts = String(ymd || '').split('-').map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => !n && n !== 0)) return null;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function daysBetweenYmd(from, to) {
  const a = String(from || '').split('-').map((n) => parseInt(n, 10));
  const b = String(to || '').split('-').map((n) => parseInt(n, 10));
  if (a.length < 3 || b.length < 3) return null;
  const da = Date.UTC(a[0], a[1] - 1, a[2]);
  const db = Date.UTC(b[0], b[1] - 1, b[2]);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

function cafExpiresOn(caf, validityMonths = CAF_VALIDITY_MONTHS) {
  const fa = String(caf?.authorizedAt || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fa)) return null;
  return addMonthsYmd(fa, validityMonths);
}

function remainingThreshold(range, { min = 5, max = 50, percent = 0.2 } = {}) {
  const size = Math.max(0, parseInt(range, 10) || 0);
  return Math.max(min, Math.min(max, Math.ceil(size * percent)));
}

function counterFile(caf, counterPath) {
  return counterPath || `${caf._sourcePath || 'caf'}.folio`;
}

/** Siguiente folio a asignar (no incrementa). */
function peekNextFolio(caf, counterPath) {
  const file = counterFile(caf, counterPath);
  const from = Number(caf.folioFrom) || 1;
  const to = Number(caf.folioTo) || from;
  let next = from;
  try {
    if (fs.existsSync(file)) {
      const last = parseInt(fs.readFileSync(file, 'utf8'), 10);
      // Contador corrupto (p. ej. folio dry-run 406309 en CAF 1–30): ignorar y reiniciar.
      if (!Number.isFinite(last) || last < from - 1 || last > to) {
        try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
        next = from;
      } else {
        next = last + 1;
      }
    }
  } catch (_) { /* primer folio */ }
  if (next < from) next = from;
  return next;
}

/**
 * Estado de un CAF: stock + vigencia (Res. Ex. 58/2017).
 * No consulta al SII: el rango y la FA vienen del XML local.
 */
function inspectCaf(caf, counterPath, now = new Date()) {
  const from = Number(caf.folioFrom) || 0;
  const to = Number(caf.folioTo) || from;
  const range = Math.max(0, to - from + 1);
  const next = peekNextFolio(caf, counterPath);
  const remaining = next > to ? 0 : to - next + 1;
  const used = Math.max(0, range - remaining);
  const authorizedAt = String(caf.authorizedAt || '').trim().slice(0, 10) || null;
  const expiresAt = cafExpiresOn(caf);
  const today = todayYmd(now);
  const daysToExpiry = expiresAt ? daysBetweenYmd(today, expiresAt) : null;
  const threshold = remainingThreshold(range);
  const alerts = [];

  if (remaining <= 0) {
    alerts.push({
      level: 'critical',
      code: 'exhausted',
      message: `CAF tipo ${caf.dteType} agotado (${from}–${to}). Solicita un CAF nuevo en el SII (Timbraje electrónico).`
    });
  } else if (remaining <= threshold) {
    alerts.push({
      level: 'warning',
      code: 'low_stock',
      message: `CAF tipo ${caf.dteType}: quedan ${remaining} folios de ${range} (${from}–${to}). Pide otro CAF en el SII antes de agotar.`
    });
  }

  if (expiresAt && daysToExpiry != null) {
    if (daysToExpiry < 0) {
      alerts.push({
        level: 'critical',
        code: 'expired',
        message: `CAF tipo ${caf.dteType} vencido el ${expiresAt} (Res. Ex. SII N° 58/2017: 6 meses desde ${authorizedAt}). El SII rechaza esos folios; anula los no usados en sii.cl y pide un CAF nuevo.`
      });
    } else if (daysToExpiry <= EXPIRY_URGENT_DAYS) {
      alerts.push({
        level: 'critical',
        code: 'expiring_urgent',
        message: `CAF tipo ${caf.dteType} vence el ${expiresAt} (quedan ${daysToExpiry} día${daysToExpiry === 1 ? '' : 's'}). Res. Ex. SII N° 58/2017.`
      });
    } else if (daysToExpiry <= EXPIRY_WARN_DAYS) {
      alerts.push({
        level: 'warning',
        code: 'expiring',
        message: `CAF tipo ${caf.dteType} vence el ${expiresAt} (quedan ${daysToExpiry} días, vigencia 6 meses). Solicita un CAF nuevo en el SII.`
      });
    }
  }

  const level = alerts.some((a) => a.level === 'critical')
    ? 'critical'
    : (alerts.some((a) => a.level === 'warning') ? 'warning' : 'ok');

  return {
    dteType: Number(caf.dteType) || 33,
    folioFrom: from,
    folioTo: to,
    range,
    nextFolio: next > to ? null : next,
    remaining,
    used,
    threshold,
    authorizedAt,
    expiresAt,
    daysToExpiry,
    expired: Boolean(expiresAt && daysToExpiry != null && daysToExpiry < 0),
    exhausted: remaining <= 0,
    level,
    alerts
  };
}

/**
 * Contador local de folios por CAF (archivo junto al CAF).
 * En producción conviene persistir en DB; este archivo evita colisiones en un solo nodo.
 */
function allocateFolio(caf, counterPath) {
  const status = inspectCaf(caf, counterPath);
  if (status.expired) {
    const err = new Error(status.alerts.find((a) => a.code === 'expired')?.message
      || `CAF vencido. Solicita un CAF nuevo en el SII.`);
    err.code = 'CAF_EXPIRED';
    throw err;
  }
  if (status.exhausted || !status.nextFolio) {
    const err = new Error(status.alerts.find((a) => a.code === 'exhausted')?.message
      || `CAF agotado: folio fuera de ${caf.folioFrom}-${caf.folioTo}. Solicita un CAF nuevo en el SII.`);
    err.code = 'CAF_EXHAUSTED';
    throw err;
  }
  const next = status.nextFolio;
  fs.writeFileSync(counterFile(caf, counterPath), String(next));
  return next;
}

function loadCaf33(cafPath) {
  const caf = loadCaf(cafPath);
  caf._sourcePath = cafPath;
  if (caf.dteType !== 33) {
    throw new Error(`CAF no es tipo 33 (recibido TD=${caf.dteType})`);
  }
  return caf;
}

function loadCaf61(cafPath) {
  const caf = loadCaf(cafPath);
  caf._sourcePath = cafPath;
  if (caf.dteType !== 61) {
    throw new Error(`CAF no es tipo 61 (recibido TD=${caf.dteType})`);
  }
  return caf;
}

function loadCaf46(cafPath) {
  const caf = loadCaf(cafPath);
  caf._sourcePath = cafPath;
  if (caf.dteType !== 46) {
    throw new Error(`CAF no es tipo 46 (recibido TD=${caf.dteType})`);
  }
  return caf;
}

function loadCaf43(cafPath) {
  const caf = loadCaf(cafPath);
  caf._sourcePath = cafPath;
  if (caf.dteType !== 43) {
    throw new Error(`CAF no es tipo 43 (recibido TD=${caf.dteType})`);
  }
  return caf;
}

function loadCafForType(dteType, cafPath) {
  const t = Number(dteType);
  if (t === 61) return loadCaf61(cafPath);
  if (t === 46) return loadCaf46(cafPath);
  if (t === 43) return loadCaf43(cafPath);
  return loadCaf33(cafPath);
}

module.exports = {
  parseCafXml,
  decodeCafXmlBuffer,
  normalizeCafXmlText,
  loadCaf,
  loadCaf33,
  loadCaf43,
  loadCaf46,
  loadCaf61,
  loadCafForType,
  getPrivateKey,
  allocateFolio,
  peekNextFolio,
  inspectCaf,
  cafExpiresOn,
  remainingThreshold,
  todayYmd,
  addMonthsYmd,
  CAF_VALIDITY_MONTHS,
  EXPIRY_WARN_DAYS,
  EXPIRY_URGENT_DAYS
};

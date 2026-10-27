/**
 * Configuración segura SII / DTE.
 *
 * Secretos NUNCA van en git: solo rutas a archivos fuera del repo o en
 * data/secrets/ (gitignored) + variables de entorno.
 *
 * ENVIRONMENT / SII_ENVIRONMENT = sandbox | production
 */
'use strict';

const fs = require('fs');
const path = require('path');
const company = require('../../config/company');

const ROOT = path.join(__dirname, '../..');
const DEFAULT_SECRETS = path.join(ROOT, 'data', 'secrets', 'sii');

function env(name, fallback = '') {
  const v = process.env[name];
  return v == null || v === '' ? fallback : String(v);
}

function resolveEnv() {
  const raw = (env('SII_ENVIRONMENT') || env('ENVIRONMENT') || 'sandbox').toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'sandbox';
}

/** Endpoints oficiales SII (certificación vs producción). */
function getEndpoints(environment = resolveEnv()) {
  if (environment === 'production') {
    return {
      environment: 'production',
      seed: 'https://palena.sii.cl/DTEWS/CrSeed.jws',
      token: 'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
      upload: 'https://palena.sii.cl/cgi_dte/UPL/DTEUpload',
      query: 'https://palena.sii.cl/DTEWS/QueryEstUp.jws',
      queryDte: 'https://palena.sii.cl/DTEWS/QueryEstDte.jws'
    };
  }
  return {
    environment: 'sandbox',
    seed: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
    token: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    upload: 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload',
    query: 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws',
    queryDte: 'https://maullin.sii.cl/DTEWS/QueryEstDte.jws'
  };
}

function secretsDir() {
  return env('SII_SECRETS_DIR', DEFAULT_SECRETS);
}

function getConfig() {
  const environment = resolveEnv();
  const dir = secretsDir();
  return {
    environment,
    endpoints: getEndpoints(environment),
    /** RUT emisor Fandez sin puntos, con guión */
    emitterRut: normalizeRut(env('FANDEZ_RUT', company.rut)),
    emitterName: env('FANDEZ_LEGAL_NAME', company.legalName || company.name),
    emitterGiro: env('FANDEZ_GIRO', 'Intermediación de servicios del hogar'),
    emitterAddress: env('FANDEZ_ADDRESS', company.address || 'Santiago'),
    emitterCommune: env('FANDEZ_COMMUNE', 'Santiago'),
    emitterCity: env('FANDEZ_CITY', 'Santiago'),
    emitterActeco: env('FANDEZ_ACTECO', '749000'),
    /** Correo DTE: recepción de facturas y emisión de documentos tributarios */
    emitterEmail: env('DTE_EMAIL', company.dteEmail || 'dte@fandez.cl'),
    emitterResolutionDate: env('FANDEZ_SII_RESOLUTION_DATE', '2024-01-01'),
    emitterResolutionNumber: env('FANDEZ_SII_RESOLUTION_NUMBER', '0'),
    /** Certificado digital .p12 / .pfx del representante legal / empresa */
    certificatePath: env('SII_CERT_PATH', path.join(dir, 'certificate.p12')),
    certificatePassword: env('SII_CERT_PASSWORD', ''),
    /** CAF vigente para DTE 33 (XML descargado del SII) */
    cafPath33: env('SII_CAF_33_PATH', path.join(dir, 'caf-33.xml')),
    /** CAF vigente para DTE 61 (nota de crédito) */
    cafPath61: env('SII_CAF_61_PATH', path.join(dir, 'caf-61.xml')),
    /** CAF vigente para DTE 46 (factura de compra) */
    cafPath46: env('SII_CAF_46_PATH', path.join(dir, 'caf-46.xml')),
    /** CAF vigente para DTE 43 (liquidación-factura) */
    cafPath43: env('SII_CAF_43_PATH', path.join(dir, 'caf-43.xml')),
    /** Carpeta de XML/PDF generados */
    storageDir: env('SII_DTE_STORAGE', path.join(ROOT, 'data', 'dte', 'sii')),
    /** Si true, no llama al SII: firma local + estado "signed" (útil sin CAF/cert). */
    dryRun: env('SII_DTE_DRY_RUN', environment === 'sandbox' ? 'true' : 'false') === 'true',
    pollIntervalMs: Math.max(15000, parseInt(env('SII_DTE_POLL_MS', '60000'), 10) || 60000),
    pollMaxAttempts: Math.max(3, parseInt(env('SII_DTE_POLL_MAX', '40'), 10) || 40),
    ivaRate: 0.19
  };
}

function normalizeRut(rut) {
  const clean = String(rut || '').replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  if (!clean) return '';
  if (clean.includes('-')) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function assertReadable(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    const err = new Error(`${label} no encontrado: ${filePath || '(sin ruta)'}`);
    err.code = 'SII_SECRET_MISSING';
    throw err;
  }
  return filePath;
}

function getCertificatePaths(cfg = getConfig()) {
  return {
    certificatePath: cfg.certificatePath,
    certificatePassword: cfg.certificatePassword,
    cafPath33: cfg.cafPath33,
    cafPath43: cfg.cafPath43,
    cafPath46: cfg.cafPath46,
    cafPath61: cfg.cafPath61
  };
}

function cafFileName(dteType) {
  const t = [61, 46, 43].includes(Number(dteType)) ? Number(dteType) : 33;
  return `caf-${t}.xml`;
}

function normalizeCafEnvironment(raw) {
  const v = String(raw || '').toLowerCase();
  return (v === 'production' || v === 'prod' || v === 'productivo') ? 'production' : 'sandbox';
}

function cafPathForEnv(cfg, dteType, environment) {
  const envName = normalizeCafEnvironment(environment || (cfg && cfg.environment));
  return path.join(secretsDir(), envName, cafFileName(dteType));
}

function cafPathForType(cfg, dteType) {
  const envPath = cafPathForEnv(cfg, dteType, cfg && cfg.environment);
  if (fs.existsSync(envPath)) return envPath;
  const t = Number(dteType);
  if (t === 61) return cfg.cafPath61;
  if (t === 46) return cfg.cafPath46;
  if (t === 43) return cfg.cafPath43;
  return cfg.cafPath33;
}

function cafLabel(dteType) {
  const t = Number(dteType);
  if (t === 61) return 'CAF DTE 61';
  if (t === 46) return 'CAF DTE 46';
  if (t === 43) return 'CAF DTE 43';
  return 'CAF DTE 33';
}

function isDirectConfigured(cfg = getConfig(), dteType = 33) {
  const type = [61, 46, 43].includes(Number(dteType)) ? Number(dteType) : 33;
  try {
    assertReadable(cfg.certificatePath, 'Certificado PFX/P12');
    assertReadable(cafPathForType(cfg, type), cafLabel(type));
    return Boolean(cfg.certificatePassword);
  } catch (_) {
    return false;
  }
}

module.exports = {
  getConfig,
  getEndpoints,
  getCertificatePaths,
  cafFileName,
  normalizeCafEnvironment,
  cafPathForEnv,
  cafPathForType,
  isDirectConfigured,
  normalizeRut,
  assertReadable,
  resolveEnv,
  secretsDir
};

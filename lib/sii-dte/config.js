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
    emitterResolutionDate: env('FANDEZ_SII_RESOLUTION_DATE', '2024-01-01'),
    emitterResolutionNumber: env('FANDEZ_SII_RESOLUTION_NUMBER', '0'),
    /** Certificado digital .p12 / .pfx del representante legal / empresa */
    certificatePath: env('SII_CERT_PATH', path.join(dir, 'certificate.p12')),
    certificatePassword: env('SII_CERT_PASSWORD', ''),
    /** CAF vigente para DTE 33 (XML descargado del SII) */
    cafPath33: env('SII_CAF_33_PATH', path.join(dir, 'caf-33.xml')),
    /** CAF vigente para DTE 61 (nota de crédito) */
    cafPath61: env('SII_CAF_61_PATH', path.join(dir, 'caf-61.xml')),
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
    cafPath61: cfg.cafPath61
  };
}

function isDirectConfigured(cfg = getConfig(), dteType = 33) {
  const type = Number(dteType) === 61 ? 61 : 33;
  try {
    assertReadable(cfg.certificatePath, 'Certificado PFX/P12');
    assertReadable(
      type === 61 ? cfg.cafPath61 : cfg.cafPath33,
      type === 61 ? 'CAF DTE 61' : 'CAF DTE 33'
    );
    return Boolean(cfg.certificatePassword);
  } catch (_) {
    return false;
  }
}

module.exports = {
  getConfig,
  getEndpoints,
  getCertificatePaths,
  isDirectConfigured,
  normalizeRut,
  assertReadable,
  resolveEnv,
  secretsDir
};

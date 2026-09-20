/**
 * Config Google Play / TWA (Trusted Web Activity).
 * Fingerprints SHA-256 van en env (también el de App Signing de Play Console).
 */
'use strict';

const DEFAULT_PACKAGE_ID = 'cl.fandez.app';

function getAndroidPackageId() {
  return String(process.env.ANDROID_PACKAGE_ID || DEFAULT_PACKAGE_ID).trim() || DEFAULT_PACKAGE_ID;
}

/** @returns {string[]} SHA-256 fingerprints (colon-separated hex) */
function getSha256Fingerprints() {
  const raw = String(process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean);
}

/**
 * Digital Asset Links for TWA fullscreen.
 * @see https://developers.google.com/digital-asset-links/v1/getting-started
 */
function buildAssetLinksJson() {
  const packageName = getAndroidPackageId();
  const fingerprints = getSha256Fingerprints();
  if (!fingerprints.length) {
    return [];
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}

function getPlayStoreUrl() {
  const fromEnv = String(process.env.PLAY_STORE_URL || '').trim();
  if (fromEnv) return fromEnv;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(getAndroidPackageId())}`;
}

/** true when Play listing URL should be preferred over PWA install on Android */
function isPlayStoreListingLive() {
  const flag = String(process.env.PLAY_STORE_LISTING_LIVE || '').toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  // Si hay URL custom distinta del patrón por defecto, asumir publicada
  const url = String(process.env.PLAY_STORE_URL || '').trim();
  return Boolean(url);
}

module.exports = {
  DEFAULT_PACKAGE_ID,
  getAndroidPackageId,
  getSha256Fingerprints,
  buildAssetLinksJson,
  getPlayStoreUrl,
  isPlayStoreListingLive
};

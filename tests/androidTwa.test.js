'use strict';

const {
  buildAssetLinksJson,
  getAndroidPackageId,
  getPlayStoreUrl,
  isPlayStoreListingLive
} = require('../lib/androidTwa');

describe('androidTwa', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test('package id por defecto', () => {
    delete process.env.ANDROID_PACKAGE_ID;
    expect(getAndroidPackageId()).toBe('cl.fandez.app');
  });

  test('assetlinks vacío sin fingerprints', () => {
    delete process.env.ANDROID_SHA256_CERT_FINGERPRINTS;
    expect(buildAssetLinksJson()).toEqual([]);
  });

  test('assetlinks con fingerprint', () => {
    process.env.ANDROID_PACKAGE_ID = 'cl.fandez.app';
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = 'aa:bb:cc:dd';
    const json = buildAssetLinksJson();
    expect(json).toHaveLength(1);
    expect(json[0].target.package_name).toBe('cl.fandez.app');
    expect(json[0].target.sha256_cert_fingerprints).toEqual(['AA:BB:CC:DD']);
  });

  test('play store url y listing flag', () => {
    delete process.env.PLAY_STORE_URL;
    delete process.env.PLAY_STORE_LISTING_LIVE;
    expect(getPlayStoreUrl()).toContain('cl.fandez.app');
    expect(isPlayStoreListingLive()).toBe(false);
    process.env.PLAY_STORE_LISTING_LIVE = 'true';
    expect(isPlayStoreListingLive()).toBe(true);
  });
});

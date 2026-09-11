/**
 * Adjunta fotos semilla a pedidos searching sin imagen (o sin archivo en disco).
 * Las imágenes viven en data/seed-request-photos/ y se copian a data/uploads/requests/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DATA_REQUEST_ROOT,
  stableRequestPhotoUrl,
  resolveRequestPhotoPath,
  toServingUrl
} = require('./uploads');

const SEED_DIR = path.resolve(__dirname, '../data/seed-request-photos');

const SEED_BY_SERVICE = {
  lavadora: {
    problem: 'fandez-demo-lavadora-problema.jpg',
    brand: 'fandez-demo-lavadora-marca.jpg'
  },
  jardineria: {
    problem: 'fandez-demo-jardin-problema.jpg',
    brand: null
  },
  default: {
    problem: 'fandez-demo-hogar-problema.jpg',
    brand: null
  }
};

function seedPath(name) {
  if (!name) return null;
  const full = path.join(SEED_DIR, name);
  return fs.existsSync(full) ? full : null;
}

function fileMissing(url) {
  if (!url) return true;
  const abs = resolveRequestPhotoPath(toServingUrl(url) || url);
  return !abs || !fs.existsSync(abs);
}

function copySeedToRequest(requestId, seedFile, category) {
  const src = seedPath(seedFile);
  if (!src) return null;
  const id = String(requestId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return null;
  const dir = path.join(DATA_REQUEST_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  const destName = `${category}-${Date.now()}.jpg`;
  const dest = path.join(dir, destName);
  fs.copyFileSync(src, dest);
  return `/uploads/requests/${id}/${destName}`;
}

/**
 * @param {object} store
 * @returns {{ patched: number, details: string[] }}
 */
function applySeedRequestPhotos(store) {
  if (!store?.isReady?.() || !Array.isArray(store.requests)) {
    return { patched: 0, details: ['store_not_ready'] };
  }
  const details = [];
  let patched = 0;

  for (const request of store.requests) {
    if (!request || !['searching', 'scheduled', 'assigned', 'in_progress'].includes(request.status)) {
      continue;
    }
    const needsProblem = !request.clientPhotoUrl || fileMissing(request.clientPhotoUrl);
    const needsBrand = !request.brandNotVisible
      && (!request.clientBrandPhotoUrl || fileMissing(request.clientBrandPhotoUrl));

    if (!needsProblem && !needsBrand) continue;

    const pack = SEED_BY_SERVICE[request.serviceId] || SEED_BY_SERVICE.default;
    let changed = false;

    if (needsProblem && pack.problem) {
      const url = copySeedToRequest(request.id, pack.problem, 'cliente');
      if (url) {
        request.clientPhotoUrl = stableRequestPhotoUrl(request.id, 'problem') || url;
        changed = true;
      }
    }

    if (needsBrand && pack.brand) {
      const url = copySeedToRequest(request.id, pack.brand, 'marca');
      if (url) {
        request.clientBrandPhotoUrl = stableRequestPhotoUrl(request.id, 'brand') || url;
        request.brandNotVisible = false;
        changed = true;
      }
    } else if (needsProblem && !pack.brand && request.clientBrandPhotoUrl == null) {
      request.brandNotVisible = true;
    }

    if (changed) {
      patched += 1;
      details.push(`${request.id}:${request.serviceId}`);
      try {
        const repository = require('../models/repository');
        repository.persist(() => repository.saveRequest(request), `seed photos ${request.id}`);
      } catch (err) {
        details.push(`persist_fail:${request.id}:${err.message}`);
      }
    }
  }

  return { patched, details };
}

module.exports = {
  applySeedRequestPhotos,
  SEED_DIR,
  SEED_BY_SERVICE
};

const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('../models/store');
const {
  resolveRequestPhotoPath,
  resolveProviderDocPath,
  mimeFromPath,
  toServingUrl,
  stableRequestPhotoUrl,
  stableTechnicianPhotoUrl,
  resolveTechnicianPhotoPath,
  REQUEST_UPLOAD_ROOT,
  DATA_REQUEST_ROOT
} = require('../lib/uploads');

const router = express.Router();

function findRequestById(requestId) {
  const id = String(requestId || '');
  if (!id) return null;
  if (typeof store.getRequestById === 'function') {
    const found = store.getRequestById(id);
    if (found) return found;
  }
  const list = store.requests;
  if (Array.isArray(list)) return list.find((r) => r && r.id === id) || null;
  return null;
}

function canViewRequestPhoto(user, request) {
  if (!user || !request) return false;
  if (user.role === 'admin') return true;
  if (request.clientId === user.id) return true;
  if (request.providerId === user.id) return true;
  if (request.technicianId === user.id) return true;
  // Pedidos del muro (aún sin socio asignado)
  if (['searching', 'scheduled'].includes(String(request.status || ''))
    && ['provider', 'tecnico'].includes(user.role)) {
    return true;
  }
  return false;
}

function listRequestPhotoFiles(requestId) {
  const id = String(requestId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return [];
  const dirs = [
    path.join(DATA_REQUEST_ROOT, id),
    path.join(REQUEST_UPLOAD_ROOT, id)
  ];
  const found = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
        found.push(path.join(dir, name));
      }
    } catch (_) { /* ignore */ }
  }
  return found;
}

function pickByKind(files, kind) {
  const prefer = kind === 'brand'
    ? [/^marca/i, /brand/i]
    : [/^cliente/i, /^problema/i, /^foto/i, /^client/i];
  for (const re of prefer) {
    const hit = files.find((f) => re.test(path.basename(f)));
    if (hit) return hit;
  }
  return files[0] || null;
}

function resolvePhotoAbs(requestId, file, request, kind) {
  if (file && file !== 'photo' && file !== 'image') {
    const direct = resolveRequestPhotoPath(`/uploads/requests/${requestId}/${file}`);
    if (direct && fs.existsSync(direct)) return direct;
  }

  const field = kind === 'brand' ? request?.clientBrandPhotoUrl : request?.clientPhotoUrl;
  const preferred = toServingUrl(field) || field;
  if (preferred) {
    const abs = resolveRequestPhotoPath(preferred);
    if (abs && fs.existsSync(abs)) return abs;
  }

  const related = [
    request?.clientPhotoUrl,
    request?.clientBrandPhotoUrl,
    request?.siteReport?.photoStart,
    request?.siteReport?.photoEnd
  ]
    .map((u) => toServingUrl(u) || u)
    .filter(Boolean);

  for (const url of related) {
    if (file && file !== 'photo' && !String(url).includes(file)) continue;
    const abs = resolveRequestPhotoPath(url);
    if (abs && fs.existsSync(abs)) return abs;
  }

  // Último recurso: cualquier foto en la carpeta del pedido
  const files = listRequestPhotoFiles(requestId);
  return pickByKind(files, kind || (file && /marca|brand/i.test(file) ? 'brand' : 'problem'));
}

function loadAuthorizedRequest(req) {
  const user = req.session && req.session.user;
  if (!user) return { errorStatus: 401 };

  const requestId = String(req.params.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!requestId) return { errorStatus: 400 };

  const request = findRequestById(requestId)
    || store.getRequestForProvider?.(requestId, user.id)
    || store.getRequestForTechnician?.(requestId, user.id);

  if (!request || !canViewRequestPhoto(user, request)) {
    return { errorStatus: 404 };
  }
  return { user, requestId, request };
}

function sendResolvedPhoto(res, abs) {
  if (!abs || !fs.existsSync(abs)) return res.status(404).end();
  res.setHeader('Content-Type', mimeFromPath(abs));
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.sendFile(path.resolve(abs), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
}

function sendPhoto(req, res) {
  const loaded = loadAuthorizedRequest(req);
  if (loaded.errorStatus) return res.status(loaded.errorStatus).end();

  const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const kind = String(req.query.kind || '').toLowerCase() === 'brand' ? 'brand' : 'problem';
  const abs = resolvePhotoAbs(loaded.requestId, file, loaded.request, kind);
  return sendResolvedPhoto(res, abs);
}

/** Ruta estable por pedido: no depende del nombre de archivo en disco. */
function sendPhotoByKind(req, res) {
  const loaded = loadAuthorizedRequest(req);
  if (loaded.errorStatus) return res.status(loaded.errorStatus).end();

  const kind = String(req.params.kind || req.query.kind || 'problem').toLowerCase() === 'brand'
    ? 'brand'
    : 'problem';
  const abs = resolvePhotoAbs(loaded.requestId, 'photo', loaded.request, kind);
  return sendResolvedPhoto(res, abs);
}

router.get('/media/request/:requestId/kind/:kind', sendPhotoByKind);
router.get('/uploads/requests/:requestId/:file', sendPhoto);
router.get('/media/request/:requestId/:file', sendPhoto);

function canViewTechnicianPhoto(user, technician) {
  if (!user || !technician) return false;
  if (user.role === 'admin') return true;
  if (user.id === technician.id) return true;
  if (user.role === 'provider') {
    const linked = store.getTechnicianForProvider?.(user.id, technician.id);
    if (linked) return true;
  }
  if (user.role === 'client') {
    const list = Array.isArray(store.requests) ? store.requests : [];
    const parentIds = [
      technician.parentId,
      ...(Array.isArray(technician.parentIds) ? technician.parentIds : [])
    ].filter(Boolean);
    return list.some((r) => {
      if (!r || r.clientId !== user.id) return false;
      if (!['assigned', 'in_progress', 'completed'].includes(String(r.status || ''))) return false;
      if (r.technicianId === technician.id) return true;
      if (r.providerId === technician.id) return true;
      if (technician.isSelfOperator && r.providerId && parentIds.includes(r.providerId)) return true;
      return false;
    });
  }
  return false;
}

function sendTechnicianPhoto(req, res) {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).end();
  const technicianId = String(req.params.technicianId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!technicianId) return res.status(400).end();
  const technician = store.getUserById?.(technicianId);
  if (!technician || !['tecnico', 'provider'].includes(technician.role)) {
    return res.status(404).end();
  }
  if (!canViewTechnicianPhoto(user, technician)) return res.status(404).end();

  const dossier = technician.verification || {};
  let abs = resolveTechnicianPhotoPath(dossier.photo || dossier.selfie || null);
  if (!abs && technician.isSelfOperator) {
    const parentId = technician.parentId
      || (Array.isArray(technician.parentIds) ? technician.parentIds[0] : null);
    if (parentId) {
      const provider = store.getUserById(parentId);
      abs = resolveTechnicianPhotoPath(provider?.verification?.selfie || provider?.verification?.photo);
    }
  }
  return sendResolvedPhoto(res, abs);
}

router.get('/media/technician/:technicianId/photo', sendTechnicianPhoto);

function canViewProviderDoc(user, providerId) {
  if (!user || !providerId) return false;
  if (user.role === 'admin') return true;
  if (user.id === providerId) return true;
  return false;
}

function sendProviderDoc(req, res) {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).end();

  const providerId = String(req.params.providerId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!providerId || !file) return res.status(400).end();
  if (!canViewProviderDoc(user, providerId)) return res.status(404).end();

  const provider = store.getUserById?.(providerId);
  if (!provider || provider.role !== 'provider') return res.status(404).end();

  let abs = resolveProviderDocPath(`/uploads/providers/${providerId}/${file}`);
  if (!abs) {
    // Fallback: mapear kind (idFront / idBack / selfie) a URL guardada
    const kind = file.replace(/\.[^.]+$/, '');
    const v = provider.verification || {};
    const byKind = {
      idFront: v.idCardFront,
      idBack: v.idCardBack,
      selfie: v.selfie
    };
    const stored = byKind[kind] || byKind[file];
    if (stored) abs = resolveProviderDocPath(stored);
  }
  return sendResolvedPhoto(res, abs);
}

router.get('/uploads/providers/:providerId/:file', sendProviderDoc);
router.get('/media/provider/:providerId/:file', sendProviderDoc);

function stablePhotoUrl(requestId, kind) {
  return stableRequestPhotoUrl(requestId, kind);
}

function normalizeRequestPhotos(request) {
  if (!request) return request;
  if (request.clientPhotoUrl) {
    request.clientPhotoUrl = stableRequestPhotoUrl(request.id, 'problem')
      || toServingUrl(request.clientPhotoUrl);
  }
  if (request.clientBrandPhotoUrl) {
    request.clientBrandPhotoUrl = stableRequestPhotoUrl(request.id, 'brand')
      || toServingUrl(request.clientBrandPhotoUrl);
  }
  if (request.siteReport?.photoStart) request.siteReport.photoStart = toServingUrl(request.siteReport.photoStart);
  if (request.siteReport?.photoEnd) request.siteReport.photoEnd = toServingUrl(request.siteReport.photoEnd);
  return request;
}

module.exports = {
  router,
  canViewRequestPhoto,
  canViewTechnicianPhoto,
  canViewProviderDoc,
  sendPhoto,
  sendPhotoByKind,
  sendTechnicianPhoto,
  sendProviderDoc,
  normalizeRequestPhotos,
  stablePhotoUrl,
  stableTechnicianPhotoUrl
};

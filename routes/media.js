const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('../models/store');
const {
  resolveRequestPhotoPath,
  mimeFromPath,
  toServingUrl
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

function resolvePhotoAbs(requestId, file, request) {
  const direct = resolveRequestPhotoPath(`/uploads/requests/${requestId}/${file}`);
  if (direct && fs.existsSync(direct)) return direct;

  const related = [request?.clientPhotoUrl, request?.clientBrandPhotoUrl, request?.siteReport?.photoStart, request?.siteReport?.photoEnd]
    .map((u) => toServingUrl(u) || u)
    .filter(Boolean);

  for (const url of related) {
    if (!String(url).includes(file)) continue;
    const abs = resolveRequestPhotoPath(url);
    if (abs && fs.existsSync(abs)) return abs;
  }
  return null;
}

function sendPhoto(req, res) {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).end();

  const requestId = String(req.params.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!requestId || !file) return res.status(400).end();

  const request = findRequestById(requestId)
    || store.getRequestForProvider?.(requestId, user.id)
    || store.getRequestForTechnician?.(requestId, user.id);
  if (!request || !canViewRequestPhoto(user, request)) {
    return res.status(404).end();
  }

  const abs = resolvePhotoAbs(requestId, file, request);
  if (!abs || !fs.existsSync(abs)) return res.status(404).end();

  res.setHeader('Content-Type', mimeFromPath(abs));
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.sendFile(path.resolve(abs), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
}

router.get('/uploads/requests/:requestId/:file', sendPhoto);
router.get('/media/request/:requestId/:file', sendPhoto);

function normalizeRequestPhotos(request) {
  if (!request) return request;
  if (request.clientPhotoUrl) request.clientPhotoUrl = toServingUrl(request.clientPhotoUrl);
  if (request.clientBrandPhotoUrl) request.clientBrandPhotoUrl = toServingUrl(request.clientBrandPhotoUrl);
  if (request.siteReport?.photoStart) request.siteReport.photoStart = toServingUrl(request.siteReport.photoStart);
  if (request.siteReport?.photoEnd) request.siteReport.photoEnd = toServingUrl(request.siteReport.photoEnd);
  return request;
}

module.exports = { router, canViewRequestPhoto, sendPhoto, normalizeRequestPhotos };

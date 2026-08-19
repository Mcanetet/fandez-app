const express = require('express');
const fs = require('fs');
const path = require('path');
const store = require('../models/store');
const {
  resolveRequestPhotoPath,
  mimeFromPath
} = require('../lib/uploads');

const router = express.Router();

function canViewRequestPhoto(user, request) {
  if (!user || !request) return false;
  if (user.role === 'admin') return true;
  if (request.clientId === user.id) return true;
  if (request.providerId === user.id) return true;
  if (request.technicianId === user.id) return true;
  if (request.status === 'searching' && ['provider', 'tecnico'].includes(user.role)) return true;
  return false;
}

function sendPhoto(req, res) {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).end();

  const requestId = String(req.params.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!requestId || !file) return res.status(400).end();

  const request = (store.requests || []).find((r) => r.id === requestId)
    || store.getRequestForProvider?.(requestId, user.id)
    || store.getRequestForTechnician?.(requestId, user.id);
  if (!request || !canViewRequestPhoto(user, request)) {
    return res.status(404).end();
  }

  const stored = `/uploads/requests/${requestId}/${file}`;
  const abs = resolveRequestPhotoPath(stored);
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
  const { toServingUrl } = require('../lib/uploads');
  if (request.clientPhotoUrl) request.clientPhotoUrl = toServingUrl(request.clientPhotoUrl);
  if (request.clientBrandPhotoUrl) request.clientBrandPhotoUrl = toServingUrl(request.clientBrandPhotoUrl);
  if (request.siteReport?.photoStart) request.siteReport.photoStart = toServingUrl(request.siteReport.photoStart);
  if (request.siteReport?.photoEnd) request.siteReport.photoEnd = toServingUrl(request.siteReport.photoEnd);
  return request;
}

module.exports = { router, canViewRequestPhoto, sendPhoto, normalizeRequestPhotos };

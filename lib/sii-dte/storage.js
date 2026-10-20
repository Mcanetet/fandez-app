'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');

function ensureStorage(cfg = getConfig()) {
  if (!fs.existsSync(cfg.storageDir)) {
    fs.mkdirSync(cfg.storageDir, { recursive: true });
  }
  return cfg.storageDir;
}

function writeArtifact(docId, ext, content, cfg = getConfig()) {
  ensureStorage(cfg);
  const filePath = path.join(cfg.storageDir, `${docId}.${ext}`);
  if (Buffer.isBuffer(content)) fs.writeFileSync(filePath, content);
  else fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function publicPdfUrl(docId, exemplar = 'tributario') {
  const base = `/documentos/tributarios/sii/${docId}`;
  if (exemplar === 'cedible') return `${base}?ejemplar=cedible`;
  return base;
}

function publicXmlUrl(docId) {
  return `/documentos/tributarios/sii/${docId}/xml`;
}

module.exports = {
  ensureStorage,
  writeArtifact,
  publicPdfUrl,
  publicXmlUrl
};

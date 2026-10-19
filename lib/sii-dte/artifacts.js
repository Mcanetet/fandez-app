/**
 * Resolución y lectura de artefactos DTE (XML / HTML) con fallback a DB.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { ensureStorage } = require('./storage');

function storageRoot(cfg = getConfig()) {
  return path.resolve(ensureStorage(cfg));
}

function candidatePaths(doc, ext, cfg = getConfig()) {
  const root = storageRoot(cfg);
  const id = String(doc?.id || '').trim();
  const stored = ext === 'xml' ? doc?.xmlPath : doc?.pdfPath;
  const out = [];
  if (id) out.push(path.join(root, `${id}.${ext}`));
  if (stored) {
    const asStored = path.resolve(String(stored));
    out.push(asStored);
    out.push(path.join(root, path.basename(String(stored))));
  }
  return [...new Set(out)];
}

/**
 * @returns {{ path: string|null, content: string|null, source: 'file'|'db'|'none' }}
 */
function resolveArtifact(doc, kind = 'html') {
  const cfg = getConfig();
  const ext = kind === 'xml' ? 'xml' : 'html';
  const dbContent = kind === 'xml' ? doc?.xmlContent : doc?.htmlContent;

  for (const candidate of candidatePaths(doc, ext, cfg)) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { path: candidate, content: null, source: 'file' };
      }
    } catch (_) { /* ignore */ }
  }

  if (dbContent && String(dbContent).trim()) {
    return { path: null, content: String(dbContent), source: 'db' };
  }

  return { path: null, content: null, source: 'none' };
}

module.exports = {
  storageRoot,
  candidatePaths,
  resolveArtifact
};

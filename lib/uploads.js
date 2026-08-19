const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_ROOT = path.resolve(__dirname, '../public');
const UPLOAD_ROOT = path.join(PUBLIC_ROOT, 'uploads/providers');
const REQUEST_UPLOAD_ROOT = path.join(PUBLIC_ROOT, 'uploads/requests');
const DATA_REQUEST_ROOT = path.resolve(__dirname, '../data/uploads/requests');
const PRIVATE_INVOICE_ROOT = path.join(__dirname, '../data/provider-invoices');
const PRIVATE_TECHNICIAN_ROOT = path.join(__dirname, '../data/technician-documents');

const MAX_BYTES = Math.min(
  5 * 1024 * 1024,
  Math.max(100 * 1024, Number(process.env.UPLOAD_MAX_BYTES) || 3 * 1024 * 1024)
);

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function safeFileName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
}

function toPosixUrl(absPath, root, urlPrefix) {
  const resolved = path.resolve(absPath);
  const rootResolved = path.resolve(root);
  const rel = path.relative(rootResolved, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return `${urlPrefix}/${rel.split(path.sep).join('/')}`;
}

function parseRequestPhotoUrl(stored) {
  const url = String(stored || '').trim().replace(/\\/g, '/');
  if (!url || url.startsWith('data:')) return null;
  const match = url.match(/^\/(?:uploads\/requests|media\/request)\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  return { requestId: safeId(match[1]), file: safeFileName(match[2]) };
}

function toServingUrl(stored) {
  if (!stored) return null;
  const value = String(stored).trim();
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  const parsed = parseRequestPhotoUrl(value);
  if (parsed && parsed.requestId && parsed.file) {
    return `/media/request/${parsed.requestId}/${parsed.file}`;
  }
  if (value.startsWith('/uploads/') || value.startsWith('/media/')) return value.replace(/\\/g, '/');
  const asPublic = toPosixUrl(value, PUBLIC_ROOT, '');
  if (asPublic) {
    const mapped = parseRequestPhotoUrl(asPublic.startsWith('/') ? asPublic : `/${asPublic}`);
    if (mapped) return `/media/request/${mapped.requestId}/${mapped.file}`;
    return asPublic.startsWith('/') ? asPublic : `/${asPublic}`;
  }
  const asData = toPosixUrl(value, DATA_REQUEST_ROOT, '/uploads/requests');
  if (asData) {
    const mapped = parseRequestPhotoUrl(asData);
    if (mapped) return `/media/request/${mapped.requestId}/${mapped.file}`;
    return asData;
  }
  return value.replace(/\\/g, '/');
}

function resolveRequestPhotoPath(stored) {
  const parsed = parseRequestPhotoUrl(stored);
  if (!parsed || !parsed.requestId || !parsed.file) {
    if (stored && fs.existsSync(stored)) return path.resolve(stored);
    return null;
  }
  const candidates = [
    path.join(DATA_REQUEST_ROOT, parsed.requestId, parsed.file),
    path.join(REQUEST_UPLOAD_ROOT, parsed.requestId, parsed.file)
  ];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function copyToDataDir(absPublicPath, requestId) {
  try {
    const destDir = path.join(DATA_REQUEST_ROOT, safeId(requestId));
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(absPublicPath));
    if (path.resolve(absPublicPath) !== path.resolve(dest)) {
      fs.copyFileSync(absPublicPath, dest);
    }
  } catch (_) { /* el archivo público ya sirve */ }
}

function saveBase64File(dir, filename, dataUrlOrBase64) {
  const match = String(dataUrlOrBase64 || '').match(/^data:([^;]+);base64,(.+)$/);
  const claimedMime = match ? match[1].toLowerCase() : 'image/jpeg';
  const base64 = match ? match[2] : String(dataUrlOrBase64 || '');
  if (!base64 || base64.length > MAX_BYTES * 1.4) {
    throw new Error('Archivo demasiado grande o vacío');
  }
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_BYTES / 1024)} KB`);
  }
  const sniffed = sniffMime(buf);
  const mime = sniffed || (ALLOWED[claimedMime] ? claimedMime : null);
  if (!mime || !ALLOWED[mime]) {
    throw new Error('Tipo de archivo no permitido (solo JPG, PNG, WEBP o PDF)');
  }
  const ext = ALLOWED[mime];
  const safeName = String(filename || crypto.randomBytes(8).toString('hex'))
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(dir))) {
    throw new Error('Ruta de archivo inválida');
  }
  fs.writeFileSync(resolved, buf);
  return resolved;
}

function saveProviderFile(providerId, category, dataUrlOrBase64) {
  const id = safeId(providerId);
  const dir = path.join(UPLOAD_ROOT, id);
  const filename = `${String(category || 'file').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  const url = toPosixUrl(fullPath, PUBLIC_ROOT, '');
  return url ? (url.startsWith('/') ? url : `/${url}`) : `/uploads/providers/${id}/${path.basename(fullPath)}`;
}

function saveRequestFile(requestId, category, dataUrlOrBase64) {
  const id = safeId(requestId);
  const dir = path.join(REQUEST_UPLOAD_ROOT, id);
  const filename = `${String(category || 'file').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`;
  const fullPath = saveBase64File(dir, filename, dataUrlOrBase64);
  copyToDataDir(fullPath, id);
  return `/uploads/requests/${id}/${path.basename(fullPath)}`;
}

function moveRequestPhoto(storedUrl, requestId, prefix) {
  if (!storedUrl) return null;
  const destId = safeId(requestId);
  const current = resolveRequestPhotoPath(storedUrl);
  if (!current) return toServingUrl(storedUrl);

  const alreadyFinal = current.includes(`${path.sep}${destId}${path.sep}`) && !current.includes(`${path.sep}tmp-`);
  if (alreadyFinal) {
    copyToDataDir(current, destId);
    return `/uploads/requests/${destId}/${path.basename(current)}`;
  }

  const ext = path.extname(current) || '.jpg';
  const newName = `${String(prefix || 'foto').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}${ext}`;
  const publicDir = path.join(REQUEST_UPLOAD_ROOT, destId);
  const dataDir = path.join(DATA_REQUEST_ROOT, destId);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const publicDest = path.join(publicDir, newName);
  fs.copyFileSync(current, publicDest);
  fs.copyFileSync(current, path.join(dataDir, newName));
  try { fs.unlinkSync(current); } catch (_) { /* temp puede no existir */ }
  return `/uploads/requests/${destId}/${newName}`;
}

function saveProviderInvoice(requestId, dataUrlOrBase64) {
  const id = safeId(requestId);
  const dir = path.join(PRIVATE_INVOICE_ROOT, id);
  const fullPath = saveBase64File(dir, `factura-${Date.now()}`, dataUrlOrBase64);
  return {
    filePath: fullPath,
    fileName: path.basename(fullPath),
    mimeType: fullPath.endsWith('.pdf') ? 'application/pdf' : fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  };
}

function saveTechnicianDocumentFile(technicianId, category, dataUrlOrBase64) {
  const id = safeId(technicianId);
  const dir = path.join(PRIVATE_TECHNICIAN_ROOT, id);
  return saveBase64File(dir, `${String(category || 'doc').replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}`, dataUrlOrBase64);
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
}

module.exports = {
  saveProviderFile,
  saveRequestFile,
  saveProviderInvoice,
  saveTechnicianDocumentFile,
  moveRequestPhoto,
  toServingUrl,
  parseRequestPhotoUrl,
  resolveRequestPhotoPath,
  mimeFromPath,
  MAX_BYTES,
  DATA_REQUEST_ROOT,
  REQUEST_UPLOAD_ROOT
};

const fs = require('fs');
const {
  toServingUrl,
  saveRequestFile,
  moveRequestPhoto,
  resolveRequestPhotoPath
} = require('../lib/uploads');

describe('uploads — URLs y persistencia de fotos de pedidos', () => {
  test('toServingUrl convierte rutas de pedido a /media/request', () => {
    expect(toServingUrl('/uploads/requests/abc/cliente.jpg')).toBe('/media/request/abc/cliente.jpg');
    expect(toServingUrl('/media/request/abc/cliente.jpg')).toBe('/media/request/abc/cliente.jpg');
    expect(toServingUrl(null)).toBe(null);
  });

  test('stableRequestPhotoUrl no depende del nombre de archivo', () => {
    const { stableRequestPhotoUrl } = require('../lib/uploads');
    expect(stableRequestPhotoUrl('req-abc', 'problem')).toBe('/media/request/req-abc/kind/problem');
    expect(stableRequestPhotoUrl('req-abc', 'brand')).toBe('/media/request/req-abc/kind/brand');
  });

  test('stableTechnicianPhotoUrl es estable por id de técnico', () => {
    const { stableTechnicianPhotoUrl } = require('../lib/uploads');
    expect(stableTechnicianPhotoUrl('tech-42')).toBe('/media/technician/tech-42/photo');
    expect(stableTechnicianPhotoUrl('')).toBe(null);
  });

  test('toServingUrl convierte docs de socio a /media/provider', () => {
    expect(toServingUrl('/uploads/providers/p1/idFront-1.jpg')).toBe('/media/provider/p1/idFront-1.jpg');
    expect(toServingUrl('/media/provider/p1/idFront-1.jpg')).toBe('/media/provider/p1/idFront-1.jpg');
    expect(toServingUrl('demo')).toBe(null);
  });

  test('guarda y resuelve documento de socio (dual public + data)', () => {
    const { saveProviderFile, resolveProviderDocPath, DATA_PROVIDER_ROOT, UPLOAD_ROOT } = require('../lib/uploads');
    const path = require('path');
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]).toString('base64');
    const pid = 'prov-testuploads';
    const url = saveProviderFile(pid, 'idFront', dataUrl);
    expect(url).toMatch(/^\/uploads\/providers\/prov-testuploads\/idFront-\d+\.jpg$/);
    const abs = resolveProviderDocPath(url);
    expect(abs).toBeTruthy();
    expect(fs.existsSync(abs)).toBe(true);
    const dataCopy = path.join(DATA_PROVIDER_ROOT, pid, path.basename(url));
    const publicCopy = path.join(UPLOAD_ROOT, pid, path.basename(url));
    expect(fs.existsSync(dataCopy)).toBe(true);
    expect(fs.existsSync(publicCopy)).toBe(true);
    // Si se borra public, data sigue sirviendo
    fs.unlinkSync(publicCopy);
    expect(fs.existsSync(resolveProviderDocPath(url))).toBe(true);
  });
});

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

  test('guarda, mueve y resuelve una foto de pedido', () => {
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]).toString('base64');
    const tmpId = 'tmp-testuploads';
    const url = saveRequestFile(tmpId, 'cliente', dataUrl);
    expect(url).toMatch(/^\/uploads\/requests\/tmp-testuploads\/cliente-\d+\.jpg$/);
    expect(resolveRequestPhotoPath(url)).toBeTruthy();
    expect(fs.existsSync(resolveRequestPhotoPath(url))).toBe(true);

    const finalId = 'req-final-test';
    const moved = moveRequestPhoto(url, finalId, 'cliente');
    expect(moved).toMatch(/^\/uploads\/requests\/req-final-test\/cliente-\d+\.jpg$/);
    expect(fs.existsSync(resolveRequestPhotoPath(moved))).toBe(true);
  });
});

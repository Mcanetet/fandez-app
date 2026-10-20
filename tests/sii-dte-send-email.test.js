'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn(async ({ to, subject, attachments }) => ({
    demo: true,
    to,
    subject,
    attachments: attachments?.length || 0
  }))
}));

const mailer = require('../lib/mailer');
const { sendDocumentEmail, isValidEmail } = require('../lib/sii-dte/sendDocumentEmail');

describe('SII DTE · reenvío correo', () => {
  beforeEach(() => {
    mailer.sendMail.mockClear();
  });

  test('valida email', () => {
    expect(isValidEmail('a@b.cl')).toBe(true);
    expect(isValidEmail('malo')).toBe(false);
  });

  test('envía con enlaces y adjunto XML si hay contenido', async () => {
    const result = await sendDocumentEmail({
      id: 'sii-doc-1',
      folio: 100,
      dteType: 33,
      total: 11900,
      xmlContent: '<?xml version="1.0"?><DTE/>',
      meta: {}
    }, { to: 'cliente@ejemplo.cl', exemplar: 'tributario' });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const args = mailer.sendMail.mock.calls[0][0];
    expect(args.to).toBe('cliente@ejemplo.cl');
    expect(args.subject).toMatch(/FACTURA ELECTRÓNICA N° 100/);
    expect(args.text).toMatch(/tributario/);
    expect(args.attachments?.[0]?.filename).toBe('F100T33.xml');
  });

  test('rechaza correo inválido', async () => {
    const result = await sendDocumentEmail({ id: 'x', folio: 1, dteType: 33 }, { to: 'x' });
    expect(result.error).toMatch(/correo/i);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
});

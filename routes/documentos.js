const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const store = require('../models/store');
const { requireRole } = require('../middleware/auth');
const { getVoucherFilePath } = require('../lib/voucher');

const DTE_DIR = path.join(__dirname, '../data/dte');

function canAccessDocument(req, request) {
  if (!request) return false;
  if (req.session.user?.role === 'admin') return true;
  if (req.session.user?.role === 'client' && request.clientId === req.session.user.id) return true;
  if (req.session.user?.role === 'provider' && request.providerId === req.session.user.id) return true;
  if (req.session.user?.role === 'tecnico' && request.technicianId === req.session.user.id) return true;
  return false;
}

router.get('/comprobantes/:voucherId', (req, res) => {
  if (!store.isReady()) {
    return res.status(503).render('error', { title: 'Cargando…', message: 'Espera unos segundos.', code: 503 });
  }

  const voucherId = req.params.voucherId;
  const request = store.getAllRequests().find((r) =>
    Array.isArray(r.vouchers) && r.vouchers.some((v) => v.id === voucherId)
  );
  const doc = request?.vouchers?.find((v) => v.id === voucherId);

  if (!doc || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Comprobante no encontrado',
      message: 'No tienes acceso a este comprobante de pago.',
      code: 404
    });
  }

  const filePath = getVoucherFilePath(voucherId);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).render('error', {
    title: 'Archivo no disponible',
    message: 'El comprobante aún no está generado.',
    code: 404
  });
});

router.get('/factura-socio/:requestId', (req, res) => {
  const request = store.getAllRequests().find((item) => item.id === req.params.requestId);
  const invoice = request?.providerInvoicePlan;
  if (!invoice?.filePath || invoice.status !== 'issued' || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Documento no encontrado',
      message: 'La factura o boleta del socio aún no está disponible.',
      code: 404
    });
  }
  const allowedRoot = path.resolve(path.join(__dirname, '../data/provider-invoices'));
  const filePath = path.resolve(invoice.filePath);
  if (!filePath.startsWith(`${allowedRoot}${path.sep}`) || !fs.existsSync(filePath)) {
    return res.status(404).render('error', {
      title: 'Archivo no disponible',
      message: 'No se encontró el archivo de la factura.',
      code: 404
    });
  }
  res.type(invoice.mimeType || 'application/pdf');
  return res.sendFile(filePath);
});

function canAccessSiiDoc(req, doc) {
  if (!doc) return false;
  if (req.session.user?.role === 'admin') return true;
  const request = store.getAllRequests().find((r) => r.id === doc.requestId);
  if (canAccessDocument(req, request)) return true;
  if (req.session.user?.role === 'provider' && doc.providerId === req.session.user.id) return true;
  return false;
}

/** Representación impresa SII directo (lib/sii-dte → data/dte/sii o DB). */
router.get('/tributarios/sii/:docId', async (req, res) => {
  if (!store.isReady()) {
    return res.status(503).render('error', { title: 'Cargando…', message: 'Espera unos segundos.', code: 503 });
  }
  const siiDte = require('../lib/sii-dte');
  const { resolveArtifact } = require('../lib/sii-dte/artifacts');
  const doc = await siiDte.findById(req.params.docId);
  if (!doc || !canAccessSiiDoc(req, doc)) {
    return res.status(404).render('error', {
      title: 'Documento no encontrado',
      message: 'No encontramos ese DTE o no tienes acceso.',
      code: 404
    });
  }

  // Siempre regenera RIMP con el template vigente (TED solo si hay XML).
  try {
    const { renderCommissionInvoiceHtml } = require('../lib/sii-dte/pdf/render');
    const artXml = resolveArtifact(doc, 'xml');
    let tedXml = null;
    if (artXml.source === 'file' && artXml.path) {
      try { tedXml = fs.readFileSync(artXml.path, 'utf8'); } catch (_) { /* ignore */ }
    } else if (artXml.source === 'db' && artXml.content) {
      tedXml = artXml.content;
    }
    // TED es el nodo <TED>…</TED>, no el EnvioDTE completo
    if (tedXml) {
      const m = String(tedXml).match(/<TED[\s\S]*?<\/TED>/i);
      tedXml = m ? m[0] : null;
    }
    const html = await renderCommissionInvoiceHtml(doc, { tedXml: tedXml || undefined });
    if (html) {
      doc.htmlContent = html;
      try { await require('../lib/sii-dte/repository').save(doc); } catch (_) { /* best effort */ }
      res.type('html');
      return res.send(html);
    }
  } catch (err) {
    console.error('[documentos] regenerate html:', err.message);
  }

  const art = resolveArtifact(doc, 'html');
  if (art.source === 'file' && art.path) {
    res.type('html');
    return res.sendFile(art.path);
  }
  if (art.source === 'db' && art.content) {
    res.type('html');
    return res.send(art.content);
  }

  return res.status(404).render('error', {
    title: 'Archivo no disponible',
    message: 'El documento aún no está generado. Vuelve a emitir o contacta soporte.',
    code: 404
  });
});

/** XML EnvioDTE para set de pruebas / envío SII. */
router.get('/tributarios/sii/:docId/xml', async (req, res) => {
  if (!store.isReady()) {
    return res.status(503).json({ error: 'Cargando…' });
  }
  const siiDte = require('../lib/sii-dte');
  const { resolveArtifact } = require('../lib/sii-dte/artifacts');
  const doc = await siiDte.findById(req.params.docId);
  if (!doc || !canAccessSiiDoc(req, doc)) {
    return res.status(404).render('error', {
      title: 'XML no encontrado',
      message: 'No encontramos el XML de ese DTE o no tienes acceso.',
      code: 404
    });
  }

  const art = resolveArtifact(doc, 'xml');
  const folio = doc.folio || '0';
  const dteType = doc.dteType || 33;
  res.setHeader('Content-Type', 'application/xml; charset=ISO-8859-1');
  res.setHeader('Content-Disposition', `attachment; filename="F${folio}T${dteType}.xml"`);

  if (art.source === 'file' && art.path) {
    return res.sendFile(art.path);
  }
  if (art.source === 'db' && art.content) {
    return res.send(art.content);
  }

  return res.status(404).render('error', {
    title: 'XML no disponible',
    message: 'Este documento se emitió antes de guardar el XML en base de datos. Emite de nuevo para descargarlo, o revisa el respaldo en el servidor.',
    code: 404
  });
});

router.get('/tributarios/:docId', (req, res) => {
  if (!store.isReady()) {
    return res.status(503).render('error', { title: 'Cargando…', message: 'Espera unos segundos.', code: 503 });
  }

  const docId = req.params.docId;
  const request = store.getAllRequests().find((r) =>
    Array.isArray(r.dteDocuments) && r.dteDocuments.some((d) => d.id === docId)
  );
  const doc = request?.dteDocuments?.find((d) => d.id === docId);

  if (!doc || !canAccessDocument(req, request)) {
    return res.status(404).render('error', {
      title: 'Documento no encontrado',
      message: 'No tienes acceso a este documento tributario.',
      code: 404
    });
  }

  const filePath = path.join(DTE_DIR, `${docId}.html`);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.status(404).render('error', {
    title: 'Archivo no disponible',
    message: 'El documento aún no está generado o expiró.',
    code: 404
  });
});

router.get('/solicitud/:requestId', requireRole('client', 'admin'), (req, res) => {
  const request = store.getAllRequests().find((r) => r.id === req.params.requestId);
  if (!request || (req.session.user.role === 'client' && request.clientId !== req.session.user.id)) {
    return res.status(404).render('error', { title: 'No encontrado', message: 'Solicitud no encontrada.', code: 404 });
  }

  res.json({
    documents: request.dteDocuments || []
  });
});

module.exports = router;

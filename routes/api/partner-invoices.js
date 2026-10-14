/**
 * API trigger: cuando el socio registra su factura al cliente,
 * Fandez emite (idempotente) la Factura Electrónica 33 por comisión + pasarela.
 *
 * POST /api/partner-invoices/process
 * Body: { requestId, idempotencyKey? }
 */
'use strict';

const express = require('express');
const store = require('../../models/store');
const { requireRole } = require('../../middleware/auth');
const siiDte = require('../../lib/sii-dte');

const router = express.Router();

router.post('/process', requireRole('provider', 'admin'), async (req, res) => {
  try {
    const requestId = String(req.body.requestId || req.body.request_id || '').trim();
    if (!requestId) {
      return res.status(400).json({ success: false, error: 'requestId es obligatorio' });
    }

    const request = store.getAllRequests().find((r) => r.id === requestId);
    if (!request) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });

    const isAdmin = req.session.user.role === 'admin';
    if (!isAdmin && request.providerId !== req.session.user.id) {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }

    if (request.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'El servicio aún no está completado' });
    }
    if (request.providerInvoicePlan?.status !== 'issued') {
      return res.status(400).json({
        success: false,
        error: 'Primero registra la boleta/factura del socio al cliente'
      });
    }

    const partner = store.getUserById(request.providerId);
    const { computeRequestFinancials } = require('../../lib/pricing');
    const fin = request.financials
      || computeRequestFinancials(request, store.getPricingConfig());

    const result = await siiDte.generateCommissionInvoice({
      requestId: request.id,
      partner,
      providerId: request.providerId,
      commissionClp: fin.laborCommission,
      cardFeeClp: fin.cardFee,
      appTotal: fin.appTotal,
      phase: 'fandez_margin'
    });

    if (result.error) {
      return res.status(422).json({ success: false, error: result.error, document: result.document || null });
    }

    // Adjunta referencia en la solicitud (auditoría)
    if (!request.dteDocuments) request.dteDocuments = [];
    const already = request.dteDocuments.some((d) => d.id === result.document.id);
    if (!already) {
      request.dteDocuments.push({
        id: result.document.id,
        phase: 'fandez_margin',
        dteType: 33,
        folio: result.document.folio,
        amount: result.document.total,
        status: 'issued',
        provider: 'sii_direct',
        siiStatus: result.document.siiStatus,
        trackId: result.document.trackId,
        pdfUrl: result.document.pdfUrl,
        issuedAt: result.document.signedAt,
        dryRun: Boolean(result.dryRun || result.document.meta?.dryRun)
      });
      store.repository.persist(() => store.repository.saveRequest(request), `dte sii ${request.id}`);
    }

    return res.json({
      success: true,
      idempotent: Boolean(result.idempotent),
      dryRun: Boolean(result.dryRun),
      document: result.document,
      sii: siiDte.getStatus()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Error emitiendo DTE' });
  }
});

router.get('/:id', requireRole('provider', 'admin'), async (req, res) => {
  const doc = await siiDte.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, error: 'DTE no encontrado' });
  if (req.session.user.role !== 'admin' && doc.providerId !== req.session.user.id) {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }
  return res.json({ success: true, document: doc });
});

module.exports = router;

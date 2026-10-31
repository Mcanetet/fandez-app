const express = require('express');
const router = express.Router();
const company = require('../config/company');
const store = require('../models/store');
const { requireAuth } = require('../middleware/auth');
const { CONSENT_DEFINITIONS, POLICY_VERSION } = require('../lib/consent-policy');
const { buildPageMeta } = require('../lib/seo');

const CONSENT_LABELS = {
  terminos: 'Términos y Condiciones',
  privacidad: 'Política de Privacidad',
  tratamiento_cuenta: 'Tratamiento de datos de cuenta',
  marketing: 'Comunicaciones comerciales',
  cookies_analiticas: 'Cookies analíticas',
  geolocalizacion: 'Geolocalización en servicios',
  datos_sensibles_kyc: 'Verificación de identidad (KYC)',
  contrato_socio: 'Contrato de socio'
};

const MANAGEABLE_TYPES = ['marketing', 'cookies_analiticas', 'geolocalizacion', 'datos_sensibles_kyc'];

function buildConsentDashboard(userId) {
  const status = store.getUserConsentStatus(userId);
  const byType = Object.fromEntries(status.map((c) => [c.type, c]));

  const types = [
    'terminos', 'privacidad', 'tratamiento_cuenta',
    ...MANAGEABLE_TYPES
  ];

  if (byType.contrato_socio) types.push('contrato_socio');

  return types.map((type) => {
    const def = CONSENT_DEFINITIONS[type] || {};
    const row = byType[type];
    return {
      type,
      label: CONSENT_LABELS[type] || type,
      purpose: def.purpose || '',
      legalBasis: def.legalBasis || '—',
      revocable: Boolean(def.revocable),
      granted: Boolean(row?.granted),
      updatedAt: row?.createdAt || null
    };
  });
}

router.get('/privacidad', (req, res) => {
  res.render('legal/privacidad', {
    title: 'Política de Privacidad — Fandez',
    seo: buildPageMeta('privacy', req),
    company,
    lastUpdated: '19 de septiembre de 2026',
    policyVersion: POLICY_VERSION
  });
});

router.get('/terminos', (req, res) => {
  res.render('legal/terminos', {
    title: 'Términos y Condiciones — Fandez',
    seo: buildPageMeta('terms', req),
    company,
    lastUpdated: '19 de septiembre de 2026'
  });
});

router.get('/convivencia', (req, res) => {
  res.render('legal/convivencia', {
    title: 'Política de convivencia — Fandez',
    seo: buildPageMeta('conduct', req),
    company
  });
});

router.get('/cookies', (req, res) => {
  res.render('legal/cookies', {
    title: 'Política de Cookies — Fandez',
    seo: buildPageMeta('cookies', req),
    company,
    lastUpdated: '11 de julio de 2026'
  });
});

/** Contrato que firman los socios (HTML imprimible / guardar como PDF). */
router.get('/contrato-socio', (req, res) => {
  const { buildPartnerContractDocument, TEMPLATE_VERSION } = require('../lib/contracts');
  const doc = buildPartnerContractDocument({
    companyName: company.legalName || company.name,
    companyRut: company.rut,
    companyAddress: company.address,
    version: TEMPLATE_VERSION
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="Contrato-Socio-Fandez-v${TEMPLATE_VERSION}.html"`
  );
  res.send(doc.html);
});

router.get('/contrato-socio.txt', (req, res) => {
  const { buildPartnerContractDocument, TEMPLATE_VERSION } = require('../lib/contracts');
  const doc = buildPartnerContractDocument({
    companyName: company.legalName || company.name,
    companyRut: company.rut,
    companyAddress: company.address,
    version: TEMPLATE_VERSION
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Contrato-Socio-Fandez-v${TEMPLATE_VERSION}.txt"`
  );
  res.send(doc.text);
});

/** Plantilla genérica del acuerdo de comisión (valores por defecto / referencia). */
router.get('/contrato-comision', (req, res) => {
  const {
    buildCommissionAgreementDocument,
    COMMISSION_AGREEMENT_VERSION,
    DEFAULT_LABOR_COMMISSION_RATE
  } = require('../lib/contracts');
  const store = require('../models/store');
  const pricing = store.getPricingConfig();
  const percent = parseFloat(req.query.percent);
  const labor = Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? percent / 100
    : DEFAULT_LABOR_COMMISSION_RATE;
  const doc = buildCommissionAgreementDocument({
    companyName: company.legalName || company.name,
    companyRut: company.rut,
    companyAddress: company.address,
    laborCommissionRate: labor,
    merchantCardFeePercent: pricing.merchantCardFeePercent || 0,
    version: COMMISSION_AGREEMENT_VERSION
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="Acuerdo-Comision-Fandez-v${COMMISSION_AGREEMENT_VERSION}.html"`
  );
  res.send(doc.html);
});

function renderMisDatos(req, res, extra = {}) {
  const user = req.session.user || null;
  let consents = [];
  if (user && user.role !== 'admin') {
    try {
      consents = buildConsentDashboard(user.id);
    } catch (_) {
      consents = [];
    }
  }
  res.render('legal/mis-datos', {
    title: 'Eliminar cuenta y datos — Fandez',
    seo: buildPageMeta('data_deletion', req),
    company,
    user,
    consents,
    policyVersion: POLICY_VERSION,
    deleted: req.query.eliminada === '1',
    deleteError: null,
    ...extra
  });
}

router.get('/mis-datos', (req, res) => {
  renderMisDatos(req, res);
});

router.post('/mis-datos/eliminar', requireAuth, async (req, res) => {
  const confirm = String(req.body?.confirm || '').trim().toUpperCase();
  if (confirm !== 'ELIMINAR') {
    return renderMisDatos(req, res, {
      deleteError: 'Escribe ELIMINAR (en mayúsculas) para confirmar.'
    });
  }
  if (req.session.user.role === 'admin') {
    return renderMisDatos(req, res, {
      deleteError: 'Las cuentas de administración no se eliminan aquí.'
    });
  }
  const result = await store.anonymizeUserAccount(
    req.session.user.id,
    {
      reason: 'solicitud del titular en /legal/mis-datos',
      actorEmail: req.session.user.email,
      actorId: req.session.user.id
    },
    req
  );
  if (result.error) {
    return renderMisDatos(req, res, { deleteError: result.error });
  }
  return req.session.destroy(() => {
    res.redirect('/legal/mis-datos?eliminada=1');
  });
});

router.post('/mis-datos/consent', requireAuth, (req, res) => {
  const { type, granted } = req.body;
  const def = CONSENT_DEFINITIONS[type];
  if (!def || !MANAGEABLE_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: 'Consentimiento no gestionable desde aquí.' });
  }

  if (granted === true || granted === 'true') {
    store.recordConsent({
      userId: req.session.user.id,
      ip: req.ip,
      type,
      granted: true,
      version: POLICY_VERSION,
      userAgent: req.get('user-agent'),
      purpose: def.purpose,
      legalBasis: def.legalBasis,
      source: 'mis_datos'
    });
    return res.json({ success: true, type, granted: true });
  }

  const result = store.revokeUserConsent(req.session.user.id, type, req);
  if (result.error) return res.status(400).json({ success: false, error: result.error });

  if (type === 'geolocalizacion' && req.session.user.role === 'provider') {
    store.setLocationConsent(req.session.user.id, false);
  }

  return res.json({ success: true, type, granted: false });
});

router.post('/consent', (req, res) => {
  const { type, granted, version } = req.body;
  const def = CONSENT_DEFINITIONS[type] || {};
  const record = store.recordConsent({
    userId: req.session.user?.id || null,
    ip: req.ip,
    type: type || 'cookies',
    granted: granted === true || granted === 'true',
    version: version || POLICY_VERSION,
    userAgent: req.get('user-agent'),
    purpose: def.purpose,
    legalBasis: def.legalBasis,
    source: 'banner'
  });
  if (req.session.user) {
    req.session.consentGranted = granted === true || granted === 'true';
  }
  res.json({ success: true, record });
});

router.get('/consent/status', (req, res) => {
  res.json({
    cookies: store.getConsentsSummary(),
    userConsent: req.session.consentGranted || false,
    policyVersion: POLICY_VERSION
  });
});

module.exports = router;

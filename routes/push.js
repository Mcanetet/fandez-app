/**
 * Rutas Web Push — suscripción a notificaciones del sistema.
 */

'use strict';

const express = require('express');
const router = express.Router();
const webPush = require('../lib/webPush');
const { requireAuth } = require('../middleware/auth');

router.get('/vapid-public-key', (req, res) => {
  if (!webPush.isReady()) {
    return res.status(503).json({ success: false, error: 'Web Push no disponible' });
  }
  res.json({ success: true, publicKey: webPush.getPublicKey() });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
    const subscription = req.body?.subscription || req.body;
    await webPush.saveSubscription(userId, subscription, req.get('user-agent') || '');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'No se pudo guardar la suscripción' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
    await webPush.removeSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Error' });
  }
});

module.exports = router;

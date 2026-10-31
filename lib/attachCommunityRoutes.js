'use strict';

const store = require('../models/store');

function attachCommunityRoutes(router, requireRole, role) {
  router.post('/comunidad/bloquear', requireRole(role), (req, res) => {
    const result = store.blockCommunityUser(req.session.user.id, req.body?.targetUserId, {
      reasonId: req.body?.reasonId,
      requestId: req.body?.requestId
    });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    return res.json(result);
  });

  router.post('/comunidad/reportar', requireRole(role), (req, res) => {
    const result = store.reportCommunityContent({
      reporterId: req.session.user.id,
      reporterRole: role,
      targetUserId: req.body?.targetUserId,
      requestId: req.body?.requestId,
      messageId: req.body?.messageId,
      reasonId: req.body?.reasonId,
      notes: req.body?.notes || '',
      alsoBlock: req.body?.alsoBlock !== false
    });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    return res.json(result);
  });
}

module.exports = { attachCommunityRoutes };

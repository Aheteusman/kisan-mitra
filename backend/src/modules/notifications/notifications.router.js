const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { getNotifications, markRead, markAllRead } = require('./notifications.service');

const router = Router();

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await getNotifications(req.user.id, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      unreadOnly: unreadOnly === 'true',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/read-all  — MUST be before /:id/read to avoid route conflict
router.put('/read-all', authenticate, async (req, res, next) => {
  try {
    const result = await markAllRead(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const notification = await markRead(req.params.id, req.user.id);
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
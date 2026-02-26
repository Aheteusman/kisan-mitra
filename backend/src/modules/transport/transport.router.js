const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { getDscRoutes, bookTransport } = require('./transport.service');

// GET /api/transport/dsc-routes?region=X — public
router.get('/dsc-routes', async (req, res, next) => {
  try {
    const { region } = req.query;
    const routes = await getDscRoutes(region);
    res.json({ success: true, data: routes });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/book-transport — authenticated FARMER or TRADER
// Note: mounted under /api/transport but proxied from orders path in app.js
router.post('/orders/:id/book-transport', authenticate, requireRole('FARMER', 'TRADER'), async (req, res, next) => {
  try {
    const trip = await bookTransport(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
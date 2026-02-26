const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./orders.controller');

// All routes require authentication
router.use(authenticate);

// POST /api/orders — place a new order (BUYER or TRADER)
router.post('/', authorize(['BUYER', 'TRADER']), ctrl.placeOrder);

// GET /api/orders — list orders for current user
router.get('/', ctrl.getOrdersForUser);

// GET /api/orders/:id — get single order detail
router.get('/:id', ctrl.getOrderById);

// POST /api/orders/:id/accept — seller accepts
router.post('/:id/accept', authorize(['FARMER', 'TRADER']), ctrl.acceptOrder);

// POST /api/orders/:id/decline — seller declines
router.post('/:id/decline', authorize(['FARMER', 'TRADER']), ctrl.declineOrder);

// POST /api/orders/:id/confirm-delivery — buyer confirms delivery
router.post('/:id/confirm-delivery', authorize(['BUYER', 'TRADER']), ctrl.confirmDelivery);

// POST /api/orders/:id/rate — buyer rates order
router.post('/:id/rate', authorize(['BUYER', 'TRADER']), ctrl.rateOrder);

module.exports = router;
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const {
  getFarmerAnalytics,
  getBuyerAnalytics,
  getDriverAnalytics,
  getMarketPrices,
  getTraderCombinedAnalytics,
} = require('./analytics.service');

const router = Router();

// GET /api/analytics/farmer
router.get('/farmer', authenticate, requireRole('FARMER', 'TRADER'), async (req, res, next) => {
  try {
    const result = await getFarmerAnalytics(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/buyer
router.get('/buyer', authenticate, requireRole('BUYER', 'TRADER'), async (req, res, next) => {
  try {
    const result = await getBuyerAnalytics(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/driver
router.get('/driver', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const result = await getDriverAnalytics(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/trader
// Returns combined selling + buying view in ONE request for the trader dashboard.
router.get('/trader', authenticate, requireRole('TRADER'), async (req, res, next) => {
  try {
    const result = await getTraderCombinedAnalytics(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/market-prices?region=Belagavi
router.get('/market-prices', authenticate, async (req, res, next) => {
  try {
    const { region = 'Karnataka' } = req.query;
    const result = await getMarketPrices(region);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
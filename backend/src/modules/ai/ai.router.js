const express = require('express');
const { authenticate } = require('../../middleware/auth');
const {
  priceAdviceController,
  marketOverviewController,
  validateImagesController,
} = require('./ai.controller');

const router = express.Router();

router.post('/price-advice',    authenticate, priceAdviceController);
router.get('/market-overview',  authenticate, marketOverviewController);
router.post('/validate-images', authenticate, validateImagesController);

module.exports = router;
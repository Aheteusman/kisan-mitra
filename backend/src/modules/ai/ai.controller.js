const { getPriceAdvice, getMarketOverview, validateImages } = require('../../utils/aiClient');

async function priceAdviceController(req, res, next) {
  try {
    const result = await getPriceAdvice(req.body);
    if (result === null) {
      return res.json({ success: true, data: null, meta: { aiUnavailable: true } });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function marketOverviewController(req, res, next) {
  try {
    const result = await getMarketOverview(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function validateImagesController(req, res, next) {
  try {
    const result = await validateImages(req.body);
    if (result === null) {
      return res.json({ success: true, data: null, meta: { aiUnavailable: true } });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { priceAdviceController, marketOverviewController, validateImagesController };
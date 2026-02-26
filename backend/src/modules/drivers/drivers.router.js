const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { uploadToCloudinary } = require('../../utils/cloudinary');
const {
  getTripFeed,
  getTripDetail,
  acceptTrip,
  markGoodsLoaded,
  markShortage,
  markDelivered,
  updateDriverLocation,
  getDriverEarnings,
} = require('./drivers.service');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/drivers/trips — list available trips
router.get('/trips', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { mode, page } = req.query;
    const result = await getTripFeed(req.user.id, { mode, page: parseInt(page) || 1 });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/drivers/earnings
router.get('/earnings', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const result = await getDriverEarnings(req.user.id, { period: req.query.period });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/drivers/trips/:id — trip detail
router.get('/trips/:id', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const trip = await getTripDetail(req.params.id);
    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

// POST /api/drivers/trips/:id/accept
router.post('/trips/:id/accept', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const trip = await acceptTrip(req.params.id, req.user.id);
    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

// POST /api/drivers/trips/:id/loaded — upload goods photo
router.post('/trips/:id/loaded', authenticate, requireRole('DRIVER'), upload.single('photo'), async (req, res, next) => {
  try {
    let photoUrl = req.body.photoUrl; // allow pre-uploaded URL
    if (req.file) {
      const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await uploadToCloudinary(b64, { folder: 'trip-photos' });
      photoUrl = result.secure_url;
    }
    if (!photoUrl) {
      return res.status(400).json({ success: false, error: { message: 'Photo is required', code: 'PHOTO_REQUIRED' } });
    }
    const trip = await markGoodsLoaded(req.params.id, req.user.id, photoUrl);
    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

// POST /api/drivers/trips/:id/shortage — report goods shortage
router.post('/trips/:id/shortage', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { actualKg } = req.body;
    if (actualKg === undefined || actualKg === null) {
      return res.status(400).json({ success: false, error: { message: 'actualKg is required', code: 'VALIDATION_ERROR' } });
    }
    const result = await markShortage(req.params.id, req.user.id, Number(actualKg));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/drivers/trips/:id/delivered — mark trip delivered (driver done, order → IN_TRANSIT)
router.post('/trips/:id/delivered', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const trip = await markDelivered(req.params.id, req.user.id);
    res.json({ success: true, data: trip });
  } catch (err) {
    next(err);
  }
});

// POST /api/drivers/location — update live location (Firestore only)
router.post('/location', authenticate, requireRole('DRIVER'), async (req, res, next) => {
  try {
    const { tripId, lat, lng } = req.body;
    const result = await updateDriverLocation(tripId, req.user.id, { lat, lng });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
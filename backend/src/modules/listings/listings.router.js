const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const {
  createListingSchema,
  updateListingSchema,
  filterSchema,
} = require('./listings.schema');
const {
  createListingController,
  uploadImagesController,
  getListingsController,
  getMyListingsController,
  getListingByIdController,
  updateListingController,
  cancelListingController,
} = require('./listings.controller');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only images allowed'));
    } else {
      cb(null, true);
    }
  },
});

// POST /api/listings — create listing
router.post(
  '/',
  authenticate,
  requireRole('FARMER', 'TRADER'),
  validate(createListingSchema),
  createListingController
);

// POST /api/listings/:id/images — upload images
router.post(
  '/:id/images',
  authenticate,
  upload.array('images', 4),
  uploadImagesController
);

// ── FIX: /mine must come BEFORE /:id to avoid being matched as an ID ──
// GET /api/listings/mine — authenticated, returns seller's own listings (all statuses)
router.get('/mine', authenticate, getMyListingsController);

// GET /api/listings — public browse (no auth)
router.get('/', validate(filterSchema, 'query'), getListingsController);

// GET /api/listings/:id — public detail (no auth)
router.get('/:id', getListingByIdController);

// PUT /api/listings/:id — update (owner only)
router.put(
  '/:id',
  authenticate,
  requireRole('FARMER', 'TRADER'),
  validate(updateListingSchema),
  updateListingController
);

// DELETE /api/listings/:id — cancel (owner only)
router.delete(
  '/:id',
  authenticate,
  requireRole('FARMER', 'TRADER'),
  cancelListingController
);

module.exports = router;

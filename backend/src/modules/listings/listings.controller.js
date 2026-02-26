const {
  createListing,
  uploadImages,
  getListings,
  getListingById,
  updateListing,
  cancelListing,
} = require('./listings.service');

async function createListingController(req, res, next) {
  try {
    const listing = await createListing(req.user.id, req.user.role, req.body);
    res.status(201).json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
}

async function uploadImagesController(req, res, next) {
  try {
    const listing = await uploadImages(req.params.id, req.user.id, req.files);
    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
}

async function getListingsController(req, res, next) {
  try {
    const result = await getListings(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getListingByIdController(req, res, next) {
  try {
    const listing = await getListingById(req.params.id);
    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
}

async function updateListingController(req, res, next) {
  try {
    const listing = await updateListing(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
}

async function cancelListingController(req, res, next) {
  try {
    await cancelListing(req.params.id, req.user.id);
    res.json({ success: true, message: 'Listing cancelled' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createListingController,
  uploadImagesController,
  getListingsController,
  getListingByIdController,
  updateListingController,
  cancelListingController,
};
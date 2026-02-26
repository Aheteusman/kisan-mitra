const { prisma } = require('../../config/prisma');
const { uploadListingImage } = require('../../utils/cloudinary');
const { getPriceAdvice, validateImages } = require('../../utils/aiClient');

/**
 * Create a new listing.
 */
async function createListing(userId, userRole, data) {
  if (!['FARMER', 'TRADER'].includes(userRole)) {
    const err = new Error('Only farmers and traders can create listings');
    err.statusCode = 403;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (user.isSuspended) {
    const err = new Error('Account suspended');
    err.statusCode = 403;
    throw err;
  }

  const isTrader = userRole === 'TRADER';

  let aiPriceData = null;
  try {
    aiPriceData = await getPriceAdvice({
      crop_type: data.cropType,
      quantity_kg: data.quantityKg,
      location: user.location || '',
    });
  } catch {
    aiPriceData = null;
  }

  const listing = await prisma.listing.create({
    data: {
      sellerId: userId,
      cropType: data.cropType,
      quantityKg: data.quantityKg,
      remainingKg: data.quantityKg,            // starts equal to quantityKg
      harvestDate: new Date(data.harvestDate),
      qualityGrade: data.qualityGrade,
      askingPrice: data.askingPrice,
      isTrader,
      aiPredictedPrice: aiPriceData?.ai_predicted_price ?? null,
      mandiRefPrice: aiPriceData?.mandi_reference_price ?? null,  // ← schema field name
    },
  });

  return listing;
}

/**
 * Upload images for a listing, validate with AI.
 */
async function uploadImages(listingId, sellerId, files) {
  if (!files || files.length < 2) {
    const err = new Error('At least 2 images are required');
    err.statusCode = 400;
    throw err;
  }
  if (files.length > 4) {
    const err = new Error('Maximum 4 images allowed');
    err.statusCode = 400;
    throw err;
  }

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const err = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }
  if (listing.sellerId !== sellerId) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  // Upload each image to Cloudinary
  const uploadResults = await Promise.all(
    files.map((file) => uploadListingImage(file.buffer, listingId))
  );

  // Create ListingImage records
  await prisma.listingImage.createMany({
    data: uploadResults.map((r, i) => ({
      listingId,
      cloudinaryId: r.public_id,   // ← schema field name
      url: r.secure_url,
      order: i,
    })),
  });

  // AI image validation
  const imageUrls = uploadResults.map((r) => r.secure_url);
  let aiValidation = null;
  try {
    aiValidation = await validateImages({
      image_urls: imageUrls,
      declared_grade: listing.qualityGrade,
    });
  } catch {
    aiValidation = null;
  }

  const updateData = {};
  if (aiValidation) {
    if (aiValidation.mismatch) {
      updateData.aiGradeMismatch = true;
      updateData.aiGradePredicted = aiValidation.predicted_grade;
    }
    if (aiValidation.valid === false) {
      updateData.aiImagesValid = false;
    }
  }

  const updatedListing = await prisma.listing.update({
    where: { id: listingId },
    data: updateData,
    include: { images: true },
  });

  return updatedListing;
}

/**
 * Get paginated listings with optional filters.
 */
async function getListings(filters) {
  const { crop, region, minPrice, maxPrice, grade, page = 1, limit = 20 } = filters;

  const where = { status: 'ACTIVE' };

  if (crop) {
    where.cropType = { contains: crop, mode: 'insensitive' };
  }
  if (region) {
    where.seller = { location: { contains: region, mode: 'insensitive' } };
  }
  if (grade) {
    where.qualityGrade = grade;
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.askingPrice = {};
    if (minPrice !== undefined) where.askingPrice.gte = Number(minPrice);
    if (maxPrice !== undefined) where.askingPrice.lte = Number(maxPrice);
  }

  const skip = (page - 1) * limit;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, location: true, isTrader: false } },
        images: true,
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.listing.count({ where }),
  ]);

  return {
    listings,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

/**
 * Get a single listing by ID with full detail.
 */
async function getListingById(id) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, location: true } },
      images: true,
      _count: { select: { orders: true } },
    },
  });

  if (!listing) {
    const err = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }

  return listing;
}

/**
 * Update a listing (owner only).
 */
async function updateListing(listingId, sellerId, data) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const err = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }
  if (listing.sellerId !== sellerId) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const updateData = {};
  if (data.cropType !== undefined)    updateData.cropType    = data.cropType;
  if (data.quantityKg !== undefined)  updateData.quantityKg  = data.quantityKg;
  if (data.harvestDate !== undefined) updateData.harvestDate = new Date(data.harvestDate);
  if (data.qualityGrade !== undefined) updateData.qualityGrade = data.qualityGrade;
  if (data.askingPrice !== undefined) updateData.askingPrice  = data.askingPrice;

  return prisma.listing.update({
    where: { id: listingId },
    data: updateData,
  });
}

/**
 * Cancel a listing (owner only).
 */
async function cancelListing(listingId, sellerId) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const err = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }
  if (listing.sellerId !== sellerId) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: 'CANCELLED' },
  });
}

module.exports = {
  createListing,
  uploadImages,
  getListings,
  getListingById,
  updateListing,
  cancelListing,
};
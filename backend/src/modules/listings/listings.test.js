// backend/src/modules/listings/listings.test.js

// ─── Manual mock for Prisma ────────────────────────────────────────────────
// jest.mock('path') alone can't auto-create nested objects like
// prisma.user.findUnique — we must supply the shape ourselves.
jest.mock('../../config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
  },
  listing: {
    create:     jest.fn(),
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    update:     jest.fn(),
    count:      jest.fn(),
  },
  listingImage: {
    createMany: jest.fn(),
  },
}));

jest.mock('../../utils/cloudinary');
jest.mock('../../utils/aiClient');

const prisma            = require('../../config/prisma');
const { uploadListingImage } = require('../../utils/cloudinary');
const { getPriceAdvice, validateImages } = require('../../utils/aiClient');
const { createListing, uploadImages, getListings } = require('./listings.service');

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    location: 'Punjab',
    isSuspended: false,
    ...overrides,
  };
}

function makeListing(overrides = {}) {
  return {
    id: 'listing-1',
    sellerId: 'user-1',
    cropType: 'Wheat',
    quantityKg: 500,
    remainingKg: 500,
    harvestDate: new Date(),
    qualityGrade: 'GRADE_A',
    askingPrice: 2500,
    isTrader: false,
    status: 'ACTIVE',
    aiPredictedPrice: null,
    mandiReferencePrice: null,
    aiGradeMismatch: false,
    aiImagesValid: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── createListing ─────────────────────────────────────────────────────────

describe('createListing', () => {
  const listingData = {
    cropType: 'Wheat',
    quantityKg: 500,
    harvestDate: '2025-04-01',
    qualityGrade: 'GRADE_A',
    askingPrice: 2500,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates listing with isTrader=false for FARMER role', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    const created = makeListing({ isTrader: false });
    prisma.listing.create.mockResolvedValue(created);
    getPriceAdvice.mockResolvedValue({ ai_predicted_price: 2600, mandi_reference_price: 2400 });

    const result = await createListing('user-1', 'FARMER', listingData);

    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isTrader: false, remainingKg: 500 }),
      })
    );
    expect(result.isTrader).toBe(false);
  });

  test('creates listing with isTrader=true for TRADER role', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    const created = makeListing({ isTrader: true });
    prisma.listing.create.mockResolvedValue(created);
    getPriceAdvice.mockResolvedValue(null);

    const result = await createListing('user-1', 'TRADER', listingData);

    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isTrader: true }),
      })
    );
    expect(result.isTrader).toBe(true);
  });

  test('still succeeds when AI service is down (getPriceAdvice returns null)', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.listing.create.mockResolvedValue(makeListing());
    getPriceAdvice.mockResolvedValue(null);

    const result = await createListing('user-1', 'FARMER', listingData);

    expect(result).toBeDefined();
    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiPredictedPrice: null,
          mandiReferencePrice: null,
        }),
      })
    );
  });

  test('throws 403 when account is suspended', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ isSuspended: true }));

    await expect(createListing('user-1', 'FARMER', listingData)).rejects.toMatchObject({
      message: 'Account suspended',
      statusCode: 403,
    });
  });

  test('sets remainingKg equal to quantityKg on create', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.listing.create.mockResolvedValue(makeListing({ quantityKg: 300, remainingKg: 300 }));
    getPriceAdvice.mockResolvedValue(null);

    await createListing('user-1', 'FARMER', { ...listingData, quantityKg: 300 });

    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantityKg: 300, remainingKg: 300 }),
      })
    );
  });
});

// ─── getListings ───────────────────────────────────────────────────────────

describe('getListings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated results with default page=1 and limit=20', async () => {
    const listings = [makeListing(), makeListing({ id: 'listing-2' })];
    prisma.listing.findMany.mockResolvedValue(listings);
    prisma.listing.count.mockResolvedValue(2);

    const result = await getListings({});

    expect(result).toEqual({ listings, total: 2, page: 1, pages: 1 });
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  test('applies crop filter (case-insensitive contains)', async () => {
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await getListings({ crop: 'wheat' });

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cropType: { contains: 'wheat', mode: 'insensitive' },
        }),
      })
    );
  });

  test('only returns ACTIVE listings', async () => {
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await getListings({});

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      })
    );
  });

  test('handles pagination correctly for page 2', async () => {
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(45);

    const result = await getListings({ page: 2, limit: 20 });

    expect(result.page).toBe(2);
    expect(result.pages).toBe(3);
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 })
    );
  });
});

// ─── uploadImages ──────────────────────────────────────────────────────────

describe('uploadImages', () => {
  const mockFiles = (n) =>
    Array.from({ length: n }, (_, i) => ({
      buffer: Buffer.from(`image-${i}`),
      mimetype: 'image/jpeg',
      originalname: `photo${i}.jpg`,
    }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects when fewer than 2 files provided', async () => {
    await expect(uploadImages('listing-1', 'user-1', mockFiles(1))).rejects.toMatchObject({
      message: 'At least 2 images are required',
      statusCode: 400,
    });
  });

  test('rejects when 0 files provided', async () => {
    await expect(uploadImages('listing-1', 'user-1', [])).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('rejects when more than 4 files provided', async () => {
    await expect(uploadImages('listing-1', 'user-1', mockFiles(5))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('uploads images and creates ListingImage records', async () => {
    prisma.listing.findUnique.mockResolvedValue(makeListing());
    uploadListingImage.mockResolvedValue({
      public_id: 'kisan-mitra/listings/listing-1/abc',
      secure_url: 'https://res.cloudinary.com/test/image/upload/abc.jpg',
    });
    prisma.listingImage.createMany.mockResolvedValue({ count: 2 });
    validateImages.mockResolvedValue({ valid: true, predicted_grade: 'GRADE_A', mismatch: false });
    prisma.listing.update.mockResolvedValue({ ...makeListing(), images: [] });

    const result = await uploadImages('listing-1', 'user-1', mockFiles(2));

    expect(uploadListingImage).toHaveBeenCalledTimes(2);
    expect(prisma.listingImage.createMany).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('sets aiGradeMismatch=true when AI detects grade mismatch', async () => {
    prisma.listing.findUnique.mockResolvedValue(makeListing());
    uploadListingImage.mockResolvedValue({
      public_id: 'kisan-mitra/listings/listing-1/abc',
      secure_url: 'https://res.cloudinary.com/test/image/upload/abc.jpg',
    });
    prisma.listingImage.createMany.mockResolvedValue({ count: 2 });
    validateImages.mockResolvedValue({ valid: true, predicted_grade: 'GRADE_B', mismatch: true });
    prisma.listing.update.mockResolvedValue({ ...makeListing(), aiGradeMismatch: true, images: [] });

    await uploadImages('listing-1', 'user-1', mockFiles(2));

    expect(prisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiGradeMismatch: true, aiGradePredicted: 'GRADE_B' }),
      })
    );
  });

  test('succeeds even when AI validation service is down', async () => {
    prisma.listing.findUnique.mockResolvedValue(makeListing());
    uploadListingImage.mockResolvedValue({
      public_id: 'abc',
      secure_url: 'https://example.com/img.jpg',
    });
    prisma.listingImage.createMany.mockResolvedValue({ count: 2 });
    validateImages.mockResolvedValue(null);
    prisma.listing.update.mockResolvedValue({ ...makeListing(), images: [] });

    const result = await uploadImages('listing-1', 'user-1', mockFiles(2));
    expect(result).toBeDefined();
  });

  test('throws 403 when listing does not belong to seller', async () => {
    prisma.listing.findUnique.mockResolvedValue(makeListing({ sellerId: 'other-user' }));

    await expect(uploadImages('listing-1', 'user-1', mockFiles(2))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
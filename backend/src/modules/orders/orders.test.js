/**
 * orders.test.js
 * Unit tests for orders.service.js using Jest manual mocks for Prisma.
 */

// ── Mock PrismaClient ─────────────────────────────────────────────────────────
const mockPrisma = {
  listing: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  order: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  notification: {
    create: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// ── Mock notifications ────────────────────────────────────────────────────────
jest.mock('../notifications/notifications.service', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

const ordersService = require('./orders.service');

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeListing = (overrides = {}) => ({
  id: 'listing-1',
  sellerId: 'seller-1',
  status: 'ACTIVE',
  askingPrice: 100,
  remainingKg: 50,
  quantityKg: 50,
  ...overrides,
});

const makeOrder = (overrides = {}) => ({
  id: 'order-1',
  listingId: 'listing-1',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  quantityKg: 10,
  status: 'PENDING',
  buyerPaymentStatus: 'STAGE1_PAID',
  sellerPaymentStatus: 'WAITING',
  driverPaymentStatus: 'PENDING',
  listing: makeListing(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── placeOrder ────────────────────────────────────────────────────────────────

describe('placeOrder', () => {
  const input = {
    listingId: 'listing-1',
    quantityKg: 10,
    deliveryDate: '2025-12-01',
    deliveryAddress: '123 Main Street, Mumbai',
  };

  test('creates order with correct produceTotal and platformFee', async () => {
    const listing = makeListing({ askingPrice: 100, remainingKg: 50 });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);
    mockPrisma.order.count.mockResolvedValue(0);

    const createdOrder = {
      id: 'order-1',
      produceTotal: 1000,
      platformFee: 60,
    };
    mockPrisma.$transaction.mockImplementation(async (ops) => {
      // ops is an array of promises from prisma.order.create and prisma.listing.update
      return [createdOrder, {}];
    });

    const result = await ordersService.placeOrder('buyer-1', input);

    // Verify $transaction was called
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // The transaction array should contain an order.create call
    const txArgs = mockPrisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArgs)).toBe(true);

    expect(result.produceTotal).toBe(1000);
    expect(result.platformFee).toBe(60);
  });

  test('platformFee = produceTotal * 0.06 arithmetic', async () => {
    // 3 kg at 33.33/kg = 99.99 total, fee = 5.9994 → rounded to 6.00
    const listing = makeListing({ askingPrice: 33.33, remainingKg: 10 });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);
    mockPrisma.order.count.mockResolvedValue(0);

    let capturedData;
    mockPrisma.$transaction.mockImplementation(async (ops) => {
      // Capture what order.create was called with by spying on prisma.order.create mock
      return [{ id: 'o1', ...capturedData }, {}];
    });

    // We need to capture the create call — mock order.create to record args
    mockPrisma.order.create.mockImplementation(({ data }) => {
      capturedData = data;
      return Promise.resolve({ id: 'o1', ...data });
    });

    // For $transaction with array of promises, we need a different approach:
    // Re-mock $transaction to actually execute the array
    mockPrisma.$transaction.mockImplementation(async (ops) => {
      return Promise.all(ops);
    });

    const result = await ordersService.placeOrder('buyer-1', {
      ...input,
      quantityKg: 3,
      listingId: 'listing-1',
    });

    const expectedProduceTotal = 33.33 * 3; // 99.99
    const expectedPlatformFee = parseFloat((expectedProduceTotal * 0.06).toFixed(2)); // 6.00

    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          produceTotal: expectedProduceTotal,
          platformFee: expectedPlatformFee,
        }),
      })
    );
  });

  test('decrements listing.remainingKg by quantityKg', async () => {
    const listing = makeListing({ remainingKg: 50 });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
    mockPrisma.order.create.mockResolvedValue(makeOrder());
    mockPrisma.listing.update.mockResolvedValue({});

    await ordersService.placeOrder('buyer-1', { ...input, quantityKg: 10 });

    expect(mockPrisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ remainingKg: 40 }),
      })
    );
  });

  test('sets listing.status=FULFILLED when remainingKg reaches 0', async () => {
    const listing = makeListing({ remainingKg: 10 });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
    mockPrisma.order.create.mockResolvedValue(makeOrder());
    mockPrisma.listing.update.mockResolvedValue({});

    await ordersService.placeOrder('buyer-1', { ...input, quantityKg: 10 });

    expect(mockPrisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FULFILLED', remainingKg: 0 }),
      })
    );
  });

  test('rejects if buyer is the seller', async () => {
    const listing = makeListing({ sellerId: 'buyer-1' });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);

    await expect(ordersService.placeOrder('buyer-1', input)).rejects.toMatchObject({
      message: expect.stringMatching(/buyer cannot be the seller/i),
      status: 400,
    });
  });

  test('rejects if quantityKg > listing.remainingKg', async () => {
    const listing = makeListing({ remainingKg: 5 });
    mockPrisma.listing.findUnique.mockResolvedValue(listing);

    await expect(ordersService.placeOrder('buyer-1', { ...input, quantityKg: 10 })).rejects.toMatchObject({
      message: expect.stringMatching(/insufficient stock/i),
      status: 400,
    });
  });
});

// ── acceptOrder ───────────────────────────────────────────────────────────────

describe('acceptOrder', () => {
  test('transitions status from PENDING to ACCEPTED', async () => {
    const order = makeOrder({ status: 'PENDING' });
    mockPrisma.order.findUnique.mockResolvedValue(order);
    mockPrisma.order.update.mockResolvedValue({ ...order, status: 'ACCEPTED' });

    const result = await ordersService.acceptOrder('order-1', 'seller-1');

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } })
    );
    expect(result.status).toBe('ACCEPTED');
  });

  test('rejects invalid state transition (DELIVERED → ACCEPTED)', async () => {
    const order = makeOrder({ status: 'DELIVERED' });
    mockPrisma.order.findUnique.mockResolvedValue(order);

    await expect(ordersService.acceptOrder('order-1', 'seller-1')).rejects.toMatchObject({
      status: 400,
    });
  });
});

// ── confirmDelivery ───────────────────────────────────────────────────────────

describe('confirmDelivery', () => {
  test('sets sellerPaymentStatus=FULLY_SETTLED AND driverPaymentStatus=PAID', async () => {
    const order = makeOrder({ status: 'IN_TRANSIT', buyerId: 'buyer-1' });
    mockPrisma.order.findUnique.mockResolvedValue(order);
    const updatedOrder = {
      ...order,
      status: 'DELIVERED',
      sellerPaymentStatus: 'FULLY_SETTLED',
      driverPaymentStatus: 'PAID',
    };
    mockPrisma.order.update.mockResolvedValue(updatedOrder);
    mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));

    const result = await ordersService.confirmDelivery('order-1', 'buyer-1');

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DELIVERED',
          sellerPaymentStatus: 'FULLY_SETTLED',
          driverPaymentStatus: 'PAID',
        }),
      })
    );
  });
});

// ── declineOrder ──────────────────────────────────────────────────────────────

describe('declineOrder', () => {
  test('adds quantityKg back to listing.remainingKg', async () => {
    const listing = makeListing({ remainingKg: 40, status: 'ACCEPTED' });
    const order = makeOrder({ status: 'PENDING', quantityKg: 10, listing });
    mockPrisma.order.findUnique.mockResolvedValue(order);
    mockPrisma.order.count.mockResolvedValue(0); // no other active orders
    mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
    mockPrisma.order.update.mockResolvedValue({ ...order, status: 'CANCELLED' });
    mockPrisma.listing.update.mockResolvedValue({});

    await ordersService.declineOrder('order-1', 'seller-1');

    expect(mockPrisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ remainingKg: 50 }),
      })
    );
  });
});
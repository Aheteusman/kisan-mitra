/**
 * drivers.test.js — Phase 4 unit tests for drivers.service.js
 * Mocks: @prisma/client, ../../config/firebase, ../notifications/notifications.service
 */

jest.mock('@prisma/client', () => {
  const mPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    trip: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    order: { update: jest.fn() },
    listing: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mPrisma) };
});

jest.mock('../../config/firebase', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue({}),
      })),
    })),
  },
}));

jest.mock('../notifications/notifications.service', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Re-require the service AFTER mocks are set up
let service;
beforeAll(() => {
  service = require('./drivers.service');
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── getTripFeed ───────────────────────────────────────────────────────────────

describe('getTripFeed', () => {
  it('returns only AVAILABLE trips with no driver assigned', async () => {
    const mockDriver = { id: 'driver1', workMode: 'ON_DEMAND' };
    const mockTrips = [
      { id: 'trip1', status: 'AVAILABLE', driverId: null, earnings: 500, order: { quantityKg: 100, deliveryAddress: 'Pune', listing: { cropType: 'Tomato' } } },
    ];

    prisma.user.findUnique.mockResolvedValue(mockDriver);
    prisma.$transaction.mockResolvedValue([mockTrips, 1]);

    const result = await service.getTripFeed('driver1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0].earningsNote).toContain('100%');
  });
});

// ── acceptTrip ────────────────────────────────────────────────────────────────

describe('acceptTrip', () => {
  it('sets driverId and status=ACCEPTED', async () => {
    const mockTrip = {
      id: 'trip1',
      status: 'AVAILABLE',
      driverId: null,
      orderId: 'order1',
      order: { sellerId: 'seller1', buyerId: 'buyer1' },
    };
    const updatedTrip = { ...mockTrip, driverId: 'driver1', status: 'ACCEPTED', acceptedAt: new Date() };

    prisma.trip.findUnique.mockResolvedValue(mockTrip);
    prisma.trip.update.mockResolvedValue(updatedTrip);

    const result = await service.acceptTrip('trip1', 'driver1');

    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip1' },
      data: expect.objectContaining({ driverId: 'driver1', status: 'ACCEPTED' }),
    });
    expect(result.status).toBe('ACCEPTED');
    expect(result.driverId).toBe('driver1');
  });
});

// ── markGoodsLoaded ───────────────────────────────────────────────────────────

describe('markGoodsLoaded', () => {
  const mockTrip = {
    id: 'trip1',
    status: 'ACCEPTED',
    driverId: 'driver1',
    orderId: 'order1',
    order: { id: 'order1', sellerId: 'seller1', buyerId: 'buyer1' },
  };

  it('sets STAGE2_PAID and STAGE1_RELEASED in the same atomic transaction', async () => {
    prisma.trip.findUnique.mockResolvedValue(mockTrip);

    const updatedTrip = { ...mockTrip, status: 'LOADED' };
    prisma.$transaction.mockImplementation(async (ops) => {
      // Simulate running the ops
      return [updatedTrip, {}];
    });

    const result = await service.markGoodsLoaded('trip1', 'driver1', 'https://cdn.example.com/photo.jpg');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify the transaction was called with both update operations
    const transactionCalls = prisma.$transaction.mock.calls[0][0];
    expect(transactionCalls).toHaveLength(2);
  });

  it('updates buyerPaymentStatus=STAGE2_PAID and sellerPaymentStatus=STAGE1_RELEASED', async () => {
    prisma.trip.findUnique.mockResolvedValue(mockTrip);

    let capturedOrderUpdate;
    prisma.$transaction.mockImplementation(async (ops) => {
      // Capture what would be passed to order.update by intercepting the call
      return [{ ...mockTrip, status: 'LOADED' }, {}];
    });

    // Test by checking that order.update is called with correct data
    prisma.order.update.mockResolvedValue({ id: 'order1', buyerPaymentStatus: 'STAGE2_PAID', sellerPaymentStatus: 'STAGE1_RELEASED' });
    prisma.trip.update.mockResolvedValue({ ...mockTrip, status: 'LOADED' });

    // Use real transaction behavior
    prisma.$transaction.mockImplementation(async (operations) => {
      const results = await Promise.all(operations);
      return results;
    });

    await service.markGoodsLoaded('trip1', 'driver1', 'https://cdn.example.com/photo.jpg');

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerPaymentStatus: 'STAGE2_PAID',
          sellerPaymentStatus: 'STAGE1_RELEASED',
        }),
      })
    );
  });

  it('throws if no photo URL provided', async () => {
    prisma.trip.findUnique.mockResolvedValue(mockTrip);
    await expect(service.markGoodsLoaded('trip1', 'driver1', null)).rejects.toMatchObject({ message: 'Photo URL is required' });
  });
});

// ── markShortage ──────────────────────────────────────────────────────────────

describe('markShortage', () => {
  const baseTrip = {
    id: 'trip1',
    status: 'ACCEPTED',
    driverId: 'driver1',
    orderId: 'order1',
    order: {
      id: 'order1',
      sellerId: 'seller1',
      buyerId: 'buyer1',
      quantityKg: 100,
      pricePerKg: 50,
      seller: { id: 'seller1', violationCount: 0 },
    },
  };

  it('increments seller violationCount', async () => {
    prisma.trip.findUnique.mockResolvedValue(baseTrip);
    prisma.order.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({ violationCount: 1 });

    await service.markShortage('trip1', 'driver1', 80);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'seller1' },
      data: { violationCount: { increment: 1 } },
    });
  });

  it('recalculates produceTotal based on actualKg', async () => {
    prisma.trip.findUnique.mockResolvedValue(baseTrip);
    prisma.user.update.mockResolvedValue({ violationCount: 1 });

    let capturedOrderUpdate;
    prisma.order.update.mockImplementation(({ data }) => {
      capturedOrderUpdate = data;
      return Promise.resolve({});
    });

    await service.markShortage('trip1', 'driver1', 80);

    // 80kg * 50/kg = 4000
    expect(capturedOrderUpdate.produceTotal).toBe(4000);
    expect(capturedOrderUpdate.platformFee).toBe(240); // 4000 * 0.06
    expect(capturedOrderUpdate.quantityActualKg).toBe(80);
    expect(capturedOrderUpdate.penaltyApplied).toBe(true);
  });

  it('suspends seller and listings at 3 violations', async () => {
    prisma.trip.findUnique.mockResolvedValue(baseTrip);
    prisma.order.update.mockResolvedValue({});
    prisma.user.update
      .mockResolvedValueOnce({ violationCount: 3 }) // increment
      .mockResolvedValueOnce({ isSuspended: true }); // suspend
    prisma.listing.updateMany.mockResolvedValue({ count: 2 });

    await service.markShortage('trip1', 'driver1', 50);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'seller1' },
      data: { isSuspended: true },
    });
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { sellerId: 'seller1', status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    });
  });
});

// ── markDelivered ─────────────────────────────────────────────────────────────

describe('markDelivered', () => {
  it('sets trip=DELIVERED and order=IN_TRANSIT (NOT order=DELIVERED)', async () => {
    const mockTrip = {
      id: 'trip1',
      status: 'LOADED',
      driverId: 'driver1',
      orderId: 'order1',
      order: { id: 'order1', buyerId: 'buyer1', sellerId: 'seller1' },
    };

    prisma.trip.findUnique.mockResolvedValue(mockTrip);

    const updatedTrip = { ...mockTrip, status: 'DELIVERED' };
    prisma.trip.update.mockResolvedValue(updatedTrip);
    prisma.order.update.mockResolvedValue({ status: 'IN_TRANSIT' });

    prisma.$transaction.mockImplementation(async (operations) => {
      const results = await Promise.all(operations);
      return results;
    });

    const result = await service.markDelivered('trip1', 'driver1');

    // trip must be DELIVERED (driver done)
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' }),
      })
    );

    // order must be IN_TRANSIT (NOT DELIVERED — buyer hasn't confirmed yet)
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_TRANSIT' }),
      })
    );

    // Verify order is NOT set to DELIVERED
    const orderUpdateCall = prisma.order.update.mock.calls[0][0];
    expect(orderUpdateCall.data.status).not.toBe('DELIVERED');
  });
});
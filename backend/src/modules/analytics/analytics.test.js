/**
 * Tests for analytics.service.js
 *
 * Mocks: Prisma, aiClient
 */

jest.mock('@prisma/client');
jest.mock('../../utils/aiClient');

const { PrismaClient } = require('@prisma/client');
const aiClient = require('../../utils/aiClient');

// ─── Prisma mock setup ────────────────────────────────────────────────────────

const mockFindMany  = jest.fn();
const mockGroupBy   = jest.fn();
const mockCount     = jest.fn();

PrismaClient.mockImplementation(() => ({
  order: {
    findMany: mockFindMany,
    count:    mockCount,
  },
  trip: {
    findMany: mockFindMany,
  },
  listing: {
    groupBy: mockGroupBy,
  },
}));

const {
  getFarmerAnalytics,
  getBuyerAnalytics,
  getDriverAnalytics,
  getMarketPrices,
  getTraderCombinedAnalytics,
} = require('./analytics.service');
// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  const now = new Date();
  return {
    id:                 'order_1',
    sellerId:           'seller_1',
    buyerId:            'buyer_1',
    quantityKg:         100,
    pricePerKg:         20,
    produceTotal:       2000,
    platformFee:        120,      // 6% of 2000
    transportFee:       50,
    status:             'DELIVERED',
    sellerPaymentStatus:'FULLY_SETTLED',
    buyerPaymentStatus: 'SETTLED',
    createdAt:          now,
    updatedAt:          now,
    listing:            { cropType: 'Tomato' },
    ...overrides,
  };
}

// ─── getFarmerAnalytics ───────────────────────────────────────────────────────

describe('getFarmerAnalytics', () => {
  beforeEach(() => jest.clearAllMocks());

  test('platformFeeTotal equals sum of platformFee across all settled orders', async () => {
    const orders = [
      makeOrder({ produceTotal: 2000, platformFee: 120 }),
      makeOrder({ id: 'order_2', produceTotal: 1000, platformFee: 60, sellerPaymentStatus: 'STAGE1_RELEASED' }),
    ];
    mockFindMany.mockResolvedValue(orders);

    const result = await getFarmerAnalytics('seller_1');

    expect(result.platformFeeTotal).toBe(180);   // 120 + 60
  });

  test('allTime earnings = sum of (produceTotal - platformFee)', async () => {
    const orders = [
      makeOrder({ produceTotal: 2000, platformFee: 120 }),
      makeOrder({ id: 'order_2', produceTotal: 3000, platformFee: 180 }),
    ];
    mockFindMany.mockResolvedValue(orders);

    const result = await getFarmerAnalytics('seller_1');

    // (2000-120) + (3000-180) = 1880 + 2820 = 4700
    expect(result.allTime).toBe(4700);
  });

  test('pendingPayments contains only STAGE1_RELEASED orders', async () => {
    const orders = [
      makeOrder({ sellerPaymentStatus: 'FULLY_SETTLED' }),
      makeOrder({ id: 'order_2', sellerPaymentStatus: 'STAGE1_RELEASED' }),
    ];
    mockFindMany.mockResolvedValue(orders);

    const result = await getFarmerAnalytics('seller_1');

    expect(result.pendingPayments).toHaveLength(1);
    expect(result.pendingPayments[0].orderId).toBe('order_2');
  });

  test('byCrop groups earnings correctly', async () => {
    const orders = [
      makeOrder({ listing: { cropType: 'Tomato' }, produceTotal: 2000, platformFee: 120 }),
      makeOrder({ id: 'order_2', listing: { cropType: 'Onion' }, produceTotal: 1000, platformFee: 60 }),
      makeOrder({ id: 'order_3', listing: { cropType: 'Tomato' }, produceTotal: 500, platformFee: 30 }),
    ];
    mockFindMany.mockResolvedValue(orders);

    const result = await getFarmerAnalytics('seller_1');
    const tomatoEntry = result.byCrop.find(c => c.crop === 'Tomato');

    // (2000-120) + (500-30) = 1880 + 470 = 2350
    expect(tomatoEntry).toBeDefined();
    expect(tomatoEntry.totalEarnings).toBe(2350);
    expect(tomatoEntry.orderCount).toBe(2);
  });

  test('returns zeroes when no settled orders', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getFarmerAnalytics('seller_1');

    expect(result.allTime).toBe(0);
    expect(result.thisMonth).toBe(0);
    expect(result.platformFeeTotal).toBe(0);
    expect(result.byCrop).toHaveLength(0);
    expect(result.pendingPayments).toHaveLength(0);
  });
});

// ─── getMarketPrices ──────────────────────────────────────────────────────────

describe('getMarketPrices', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns AI data when aiClient succeeds', async () => {
    const mockPrices = [
      { crop: 'Tomato', ai_price: 25, mandi_price: 22, trend_pct: 5, demand_level: 'HIGH' },
    ];
    aiClient.getMarketOverview = jest.fn().mockResolvedValue(mockPrices);

    const result = await getMarketPrices('Belagavi');

    expect(result.region).toBe('Belagavi');
    expect(result.prices).toEqual(mockPrices);
    expect(result.dataSource).toBeUndefined();   // real data, no fallback flag
  });

  test('returns placeholder data when AI service is down', async () => {
    aiClient.getMarketOverview = jest.fn().mockRejectedValue(new Error('AI timeout'));
    mockGroupBy.mockResolvedValue([
      { cropType: 'Tomato', _count: { cropType: 5 } },
      { cropType: 'Onion',  _count: { cropType: 3 } },
    ]);

    const result = await getMarketPrices('Belagavi');

    expect(result.region).toBe('Belagavi');
    expect(result.dataSource).toBe('fallback');
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].crop).toBe('Tomato');
    expect(result.prices[0].ai_price).toBeNull();
    expect(result.prices[0].demand_level).toBe('UNKNOWN');
  });

  test('returns empty prices array when AI down and no active listings', async () => {
    aiClient.getMarketOverview = jest.fn().mockRejectedValue(new Error('AI down'));
    mockGroupBy.mockResolvedValue([]);

    const result = await getMarketPrices('UnknownRegion');

    expect(result.prices).toHaveLength(0);
    expect(result.dataSource).toBe('fallback');
  });
});

// ─── getBuyerAnalytics ────────────────────────────────────────────────────────

describe('getBuyerAnalytics', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allTime includes produceTotal + platformFee + transportFee', async () => {
    const orders = [
      makeOrder({ produceTotal: 2000, platformFee: 120, transportFee: 50 }),
    ];
    mockFindMany.mockResolvedValue(orders);

    const result = await getBuyerAnalytics('buyer_1');

    expect(result.allTime).toBe(2170);  // 2000 + 120 + 50
  });
});

// ─── getTraderCombinedAnalytics ───────────────────────────────────────────────

describe('getTraderCombinedAnalytics', () => {
  beforeEach(() => jest.clearAllMocks());

  test('combines selling and buying data in one response', async () => {
    // Both getFarmerAnalytics and getBuyerAnalytics call order.findMany
    mockFindMany
      .mockResolvedValueOnce([makeOrder({ produceTotal: 3000, platformFee: 180 })])  // selling
      .mockResolvedValueOnce([makeOrder({ produceTotal: 1000, platformFee: 60, transportFee: 0 })]);  // buying

    const result = await getTraderCombinedAnalytics('trader_1');

    expect(result).toHaveProperty('selling');
    expect(result).toHaveProperty('buying');
    expect(result).toHaveProperty('netThisMonth');
    expect(result.selling.platformFeeTotal).toBe(180);
  });

  test('netThisMonth = selling.thisMonth - buying.thisMonth', async () => {
    const now = new Date();
    // Selling order this month
    mockFindMany
      .mockResolvedValueOnce([makeOrder({ produceTotal: 5000, platformFee: 300, updatedAt: now })])
      .mockResolvedValueOnce([makeOrder({ produceTotal: 2000, platformFee: 120, transportFee: 100, createdAt: now })]);

    const result = await getTraderCombinedAnalytics('trader_1');

    // selling thisMonth = 5000-300 = 4700
    // buying thisMonth = 2000+120+100 = 2220
    expect(result.netThisMonth).toBe(result.selling.thisMonth - result.buying.thisMonth);
  });
});
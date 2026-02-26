const { PrismaClient } = require('@prisma/client');
const aiClient = require('../../utils/aiClient');

const prisma = new PrismaClient();

// ── Date helpers ──────────────────────────────────────────────────────────────

function getPeriodBounds() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return { startOfDay, startOfWeek, startOfMonth };
}

function sumField(arr, field) {
  return arr.reduce((acc, item) => acc + (item[field] || 0), 0);
}

// ── getFarmerAnalytics ────────────────────────────────────────────────────────

async function getFarmerAnalytics(sellerId) {
  const { startOfDay, startOfWeek, startOfMonth } = getPeriodBounds();

  // All settled orders (either stage)
  const settledOrders = await prisma.order.findMany({
    where: {
      sellerId,
      sellerPaymentStatus: { in: ['STAGE1_RELEASED', 'FULLY_SETTLED'] },
    },
    include: {
      listing: { select: { cropType: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Pending: stage1 released but not yet fully settled
  const pendingPayments = settledOrders.filter(
    o => o.sellerPaymentStatus === 'STAGE1_RELEASED'
  );

  // Earnings = produceTotal - platformFee (what seller actually gets)
  const earnings = (order) => order.produceTotal - order.platformFee;

  const todayOrders   = settledOrders.filter(o => o.updatedAt >= startOfDay);
  const weekOrders    = settledOrders.filter(o => o.updatedAt >= startOfWeek);
  const monthOrders   = settledOrders.filter(o => o.updatedAt >= startOfMonth);

  // Per-crop breakdown (allTime)
  const byCropMap = {};
  for (const order of settledOrders) {
    const crop = order.listing?.cropType || 'Unknown';
    if (!byCropMap[crop]) byCropMap[crop] = { crop, totalEarnings: 0, orderCount: 0 };
    byCropMap[crop].totalEarnings += earnings(order);
    byCropMap[crop].orderCount += 1;
  }

  const platformFeeTotal = settledOrders.reduce((acc, o) => acc + (o.platformFee || 0), 0);

  return {
    today:      todayOrders.reduce((acc, o) => acc + earnings(o), 0),
    thisWeek:   weekOrders.reduce((acc, o) => acc + earnings(o), 0),
    thisMonth:  monthOrders.reduce((acc, o) => acc + earnings(o), 0),
    allTime:    settledOrders.reduce((acc, o) => acc + earnings(o), 0),
    byCrop:     Object.values(byCropMap).sort((a, b) => b.totalEarnings - a.totalEarnings),
    pendingPayments: pendingPayments.map(o => ({
      orderId: o.id,
      amount: earnings(o),
      crop: o.listing?.cropType,
      updatedAt: o.updatedAt,
    })),
    platformFeeTotal: parseFloat(platformFeeTotal.toFixed(2)),
  };
}

// ── getBuyerAnalytics ─────────────────────────────────────────────────────────

async function getBuyerAnalytics(buyerId) {
  const { startOfMonth } = getPeriodBounds();

  const orders = await prisma.order.findMany({
    where: {
      buyerId,
      status: { not: 'CANCELLED' },
    },
    include: {
      listing: { select: { cropType: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalSpend = (order) => order.produceTotal + order.platformFee + order.transportFee;

  const monthOrders = orders.filter(o => o.createdAt >= startOfMonth);

  // Per-crop breakdown
  const byCropMap = {};
  for (const order of orders) {
    const crop = order.listing?.cropType || 'Unknown';
    if (!byCropMap[crop]) byCropMap[crop] = { crop, totalSpend: 0, orderCount: 0 };
    byCropMap[crop].totalSpend += totalSpend(order);
    byCropMap[crop].orderCount += 1;
  }

  return {
    thisMonth: monthOrders.reduce((acc, o) => acc + totalSpend(o), 0),
    allTime:   orders.reduce((acc, o) => acc + totalSpend(o), 0),
    byCrop:    Object.values(byCropMap).sort((a, b) => b.totalSpend - a.totalSpend),
    recentOrders: orders.slice(0, 10).map(o => ({
      orderId:  o.id,
      crop:     o.listing?.cropType,
      quantity: o.quantityKg,
      spend:    totalSpend(o),
      status:   o.status,
      createdAt: o.createdAt,
    })),
  };
}

// ── getDriverAnalytics ────────────────────────────────────────────────────────

async function getDriverAnalytics(driverId) {
  const { startOfDay, startOfWeek, startOfMonth } = getPeriodBounds();

  const trips = await prisma.trip.findMany({
    where: { driverId, status: 'DELIVERED' },
    orderBy: { deliveredAt: 'desc' },
  });

  const todayTrips  = trips.filter(t => t.deliveredAt >= startOfDay);
  const weekTrips   = trips.filter(t => t.deliveredAt >= startOfWeek);
  const monthTrips  = trips.filter(t => t.deliveredAt >= startOfMonth);

  return {
    today:     sumField(todayTrips, 'earnings'),
    thisWeek:  sumField(weekTrips, 'earnings'),
    thisMonth: sumField(monthTrips, 'earnings'),
    allTime:   sumField(trips, 'earnings'),
    recentTrips: trips.slice(0, 10).map(t => ({
      id:          t.id,
      orderId:     t.orderId,
      earnings:    t.earnings,
      deliveredAt: t.deliveredAt,
    })),
    message: '100% transport fee — zero deductions',
  };
}

// ── getMarketPrices ───────────────────────────────────────────────────────────

async function getMarketPrices(region) {
  try {
    const prices = await aiClient.getMarketOverview({ region });
    return {
      region,
      prices,
      lastUpdated: new Date(),
    };
  } catch (e) {
    console.warn('AI market overview unavailable, using fallback:', e.message);

    // Fallback: most common crop types from active listings
    const topCrops = await prisma.listing.groupBy({
      by: ['cropType'],
      _count: { cropType: true },
      where: { status: 'ACTIVE' },
      orderBy: { _count: { cropType: 'desc' } },
      take: 10,
    });

    const placeholderPrices = topCrops.map(({ cropType }) => ({
      crop:         cropType,
      ai_price:     null,
      mandi_price:  null,
      trend_pct:    null,
      demand_level: 'UNKNOWN',
      note:         'Market data temporarily unavailable',
    }));

    return {
      region,
      prices: placeholderPrices,
      lastUpdated: new Date(),
      dataSource: 'fallback',
    };
  }
}

// ── getTraderCombinedAnalytics ────────────────────────────────────────────────
// Single call for trader dashboard — avoids race conditions on frontend.

async function getTraderCombinedAnalytics(traderId) {
  const [selling, buying] = await Promise.all([
    getFarmerAnalytics(traderId),
    getBuyerAnalytics(traderId),
  ]);

  return {
    selling: {
      today:          selling.today,
      thisWeek:       selling.thisWeek,
      thisMonth:      selling.thisMonth,
      allTime:        selling.allTime,
      byCrop:         selling.byCrop,
      pendingPayments: selling.pendingPayments,
      platformFeeTotal: selling.platformFeeTotal,
    },
    buying: {
      thisMonth:    buying.thisMonth,
      allTime:      buying.allTime,
      byCrop:       buying.byCrop,
      recentOrders: buying.recentOrders,
    },
    netThisMonth: selling.thisMonth - buying.thisMonth,
  };
}

module.exports = {
  getFarmerAnalytics,
  getBuyerAnalytics,
  getDriverAnalytics,
  getMarketPrices,
  getTraderCombinedAnalytics,
};
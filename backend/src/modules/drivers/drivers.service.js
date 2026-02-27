const { prisma } = require('../../config/prisma');     // ← shared singleton (FIXED)
const { createNotification } = require('../notifications/notifications.service');

function getFirestore() {
  try {
    return require('../../config/firebase').firestore;
  } catch {
    return null;
  }
}

async function safeFirestoreSet(docPath, data) {
  try {
    const firestore = getFirestore();
    if (firestore) {
      const [collection, docId] = docPath.split('/');
      await firestore.collection(collection).doc(docId).set(data, { merge: true });
    }
  } catch {
    // Firestore down — PG update still committed
  }
}

// ── getTripFeed ───────────────────────────────────────────────────────────────

async function getTripFeed(driverId, { mode, page = 1, limit = 20 } = {}) {
  const driver = await prisma.user.findUnique({ where: { id: driverId } });
  if (!driver) throw Object.assign(new Error('Driver not found'), { status: 404 });

  const where = { status: 'AVAILABLE', driverId: null };
  if (mode) where.transportMode = mode;

  const [trips, total] = await prisma.$transaction([
    prisma.trip.findMany({
      where,
      include: {
        order: {
          select: {
            quantityKg: true,
            deliveryAddress: true,
            listing: { select: { cropType: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.trip.count({ where }),
  ]);

  return {
    trips: trips.map(t => ({
      ...t,
      earningsNote: '100% of transport fee — no deductions',
    })),
    total,
    page,
    limit,
    driverWorkMode: driver.workMode,
  };
}

// ── getTripDetail ─────────────────────────────────────────────────────────────

async function getTripDetail(tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      order: {
        include: {
          listing: {
            include: {
              seller: { select: { id: true, name: true, location: true, phone: true } },
            },
          },
          buyer: { select: { id: true, name: true, deliveryAddress: true } },
        },
      },
    },
  });

  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  return { ...trip, earningsNote: '100% of transport fee — no deductions' };
}

// ── acceptTrip ────────────────────────────────────────────────────────────────

async function acceptTrip(tripId, driverId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { order: true },
  });

  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.status !== 'AVAILABLE') {
    throw Object.assign(new Error(`Trip is not available (status: ${trip.status})`), { status: 400 });
  }
  if (trip.driverId !== null) {
    throw Object.assign(new Error('Trip already taken'), { status: 409 });
  }

  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: { driverId, status: 'ACCEPTED', acceptedAt: new Date() },
  });

  await safeFirestoreSet(`trips/${tripId}`, { status: 'ACCEPTED', driverId });

  createNotification(
    trip.order.sellerId,
    'TRIP_ACCEPTED',
    'Driver Accepted Your Trip',
    'A driver has accepted to transport your goods',
    { tripId, orderId: trip.orderId }
  ).catch(() => {});

  return updated;
}

// ── markGoodsLoaded ───────────────────────────────────────────────────────────

async function markGoodsLoaded(tripId, driverId, photoUrl) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { order: true },
  });

  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.driverId !== driverId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (trip.status !== 'ACCEPTED') {
    throw Object.assign(new Error(`Cannot mark loaded for trip in status ${trip.status}`), { status: 400 });
  }
  if (!photoUrl) throw Object.assign(new Error('Photo URL is required'), { status: 400 });

  const [updatedTrip] = await prisma.$transaction([
    prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'LOADED',
        loadedPhotoUrl: photoUrl,
        loadedAt: new Date(),
      },
    }),
    prisma.order.update({
      where: { id: trip.orderId },
      data: {
        status: 'LOADED',
        buyerPaymentStatus: 'STAGE2_PAID',
        sellerPaymentStatus: 'STAGE1_RELEASED',
      },
    }),
  ]);

  await safeFirestoreSet(`trips/${tripId}`, { status: 'LOADED', loadedAt: new Date() });

  createNotification(
    trip.order.sellerId,
    'PAYMENT_STAGE1',
    'Payment Released',
    '50% payment released to you — goods loaded by driver',
    { tripId, orderId: trip.orderId }
  ).catch(() => {});

  createNotification(
    trip.order.buyerId,
    'PAYMENT_STAGE2',
    'Remaining Payment Charged',
    'Remaining payment charged — driver has your goods and is en route',
    { tripId, orderId: trip.orderId }
  ).catch(() => {});

  return updatedTrip;
}

// ── markShortage ──────────────────────────────────────────────────────────────

async function markShortage(tripId, driverId, actualKg) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { order: { include: { seller: true } } },
  });

  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.driverId !== driverId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (trip.status !== 'ACCEPTED') {
    throw Object.assign(new Error(`Cannot report shortage for trip in status ${trip.status}`), { status: 400 });
  }
  if (actualKg >= trip.order.quantityKg) {
    throw Object.assign(new Error('actualKg must be less than ordered quantity'), { status: 400 });
  }

  const { order } = trip;
  const newProduceTotal = order.pricePerKg * actualKg;
  const newPlatformFee = parseFloat((newProduceTotal * 0.06).toFixed(2));

  await prisma.order.update({
    where: { id: order.id },
    data: {
      quantityActualKg: actualKg,
      penaltyApplied: true,
      produceTotal: newProduceTotal,
      platformFee: newPlatformFee,
    },
  });

  const updatedSeller = await prisma.user.update({
    where: { id: order.sellerId },
    data: { violationCount: { increment: 1 } },
  });

  if (updatedSeller.violationCount >= 3) {
    await prisma.user.update({
      where: { id: order.sellerId },
      data: { isSuspended: true },
    });
    await prisma.listing.updateMany({
      where: { sellerId: order.sellerId, status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    });
    createNotification(
      order.sellerId,
      'ACCOUNT_SUSPENDED',
      'Account Suspended',
      '3 violations recorded. Account and listings suspended.',
      { tripId, orderId: order.id }
    ).catch(() => {});
  } else {
    createNotification(
      order.sellerId,
      'VIOLATION_WARNING',
      'Shortage Violation Warning',
      `Shortage reported. Violation #${updatedSeller.violationCount} recorded.`,
      { tripId, orderId: order.id }
    ).catch(() => {});
  }

  createNotification(
    order.buyerId,
    'SHORTAGE_REPORTED',
    'Shortage Reported',
    `Driver reported a shortage. Order adjusted to ${actualKg}kg.`,
    { tripId, orderId: order.id }
  ).catch(() => {});

  return { success: true, actualKg, newProduceTotal, newPlatformFee, violationCount: updatedSeller.violationCount };
}

// ── markDelivered ─────────────────────────────────────────────────────────────

async function markDelivered(tripId, driverId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { order: true },
  });

  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.driverId !== driverId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (!['LOADED', 'EN_ROUTE_BUYER'].includes(trip.status)) {
    throw Object.assign(new Error(`Cannot mark delivered for trip in status ${trip.status}`), { status: 400 });
  }

  const [updatedTrip] = await prisma.$transaction([
    prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    }),
    prisma.order.update({
      where: { id: trip.orderId },
      data: {
        status: 'IN_TRANSIT',
      },
    }),
  ]);

  await safeFirestoreSet(`trips/${tripId}`, { status: 'DELIVERED', deliveredAt: new Date() });

  createNotification(
    trip.order.buyerId,
    'ORDER_DELIVERED',
    'Goods Arrived',
    'Please confirm delivery to release final payment to the farmer',
    { tripId, orderId: trip.orderId }
  ).catch(() => {});

  return updatedTrip;
}

// ── updateDriverLocation ──────────────────────────────────────────────────────

async function updateDriverLocation(tripId, driverId, { lat, lng }) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error('Trip not found'), { status: 404 });
  if (trip.driverId !== driverId) throw Object.assign(new Error('Forbidden'), { status: 403 });

  await safeFirestoreSet(`trips/${tripId}`, { lat, lng, updatedAt: new Date() });

  return { success: true };
}

// ── getDriverEarnings ─────────────────────────────────────────────────────────

async function getDriverEarnings(driverId, { period } = {}) {
  const trips = await prisma.trip.findMany({
    where: { driverId, status: 'DELIVERED' },
    orderBy: { deliveredAt: 'desc' },
  });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sum = arr => arr.reduce((acc, t) => acc + (t.earnings || 0), 0);

  const todayTrips  = trips.filter(t => t.deliveredAt >= startOfDay);
  const weekTrips   = trips.filter(t => t.deliveredAt >= startOfWeek);
  const monthTrips  = trips.filter(t => t.deliveredAt >= startOfMonth);

  return {
    today:     sum(todayTrips),
    thisWeek:  sum(weekTrips),
    thisMonth: sum(monthTrips),
    allTime:   sum(trips),
    recentTrips: trips.slice(0, 10).map(t => ({
      id:          t.id,
      orderId:     t.orderId,
      earnings:    t.earnings,
      deliveredAt: t.deliveredAt,
    })),
    earningsNote: '100% of transport fee — no deductions',
  };
}

module.exports = {
  getTripFeed,
  getTripDetail,
  acceptTrip,
  markGoodsLoaded,
  markShortage,
  markDelivered,
  updateDriverLocation,
  getDriverEarnings,
};

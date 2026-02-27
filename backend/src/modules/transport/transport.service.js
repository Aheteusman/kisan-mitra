const { prisma } = require('../../config/prisma');     // ← shared singleton (FIXED)
const axios = require('axios');
const { env } = require('../../config/env');

function getFirestore() {
  try {
    return require('../../config/firebase').firestore;
  } catch {
    return null;
  }
}

// ── getDscRoutes ──────────────────────────────────────────────────────────────

async function getDscRoutes(region) {
  const where = { isActive: true };
  if (region) where.region = region;
  return prisma.dscRoute.findMany({ where, orderBy: { name: 'asc' } });
}

// ── bookTransport ─────────────────────────────────────────────────────────────

async function bookTransport(orderId, sellerId, { transportMode, vehicleType, transportFee, routeId, scheduledTime }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: { include: { seller: true } },
    },
  });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.sellerId !== sellerId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (order.status !== 'ACCEPTED') {
    throw Object.assign(new Error(`Cannot book transport for order in status ${order.status}`), { status: 400 });
  }

  const pickupAddress = order.listing.seller.location || '';
  const deliveryAddress = order.deliveryAddress;

  // Optional: calculate route distance via ORS
  let distance = null;
  if (env.ORS_API_KEY && pickupAddress && deliveryAddress) {
    try {
      const [pickupLat, pickupLng] = pickupAddress.split(',').map(Number);
      const [deliveryLat, deliveryLng] = deliveryAddress.split(',').map(Number);

      if (!isNaN(pickupLat) && !isNaN(pickupLng) && !isNaN(deliveryLat) && !isNaN(deliveryLng)) {
        const orsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?start=${pickupLng},${pickupLat}&end=${deliveryLng},${deliveryLat}`;
        const orsRes = await axios.get(orsUrl, {
          headers: { Authorization: env.ORS_API_KEY },
          timeout: 5000,
        });
        const summary = orsRes.data?.features?.[0]?.properties?.summary;
        if (summary) distance = summary.distance;
      }
    } catch {
      distance = null;
    }
  }

  const tripData = {
    orderId,
    transportMode,
    vehicleType,
    pickupAddress,
    deliveryAddress,
    earnings: transportFee,
    status: 'AVAILABLE',
    ...(routeId && { routeId }),
    ...(scheduledTime && { scheduledTime: new Date(scheduledTime) }),
    ...(distance !== null && !routeId && { routeId: distance.toString() }),
  };

  const [trip] = await prisma.$transaction([
    prisma.trip.create({ data: tripData }),
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'TRANSPORT_BOOKED', transportFee },
    }),
  ]);

  try {
    const firestore = getFirestore();
    if (firestore) {
      await firestore.collection('trips').doc(trip.id).set({
        status: 'AVAILABLE',
        orderId,
        createdAt: new Date(),
      });
    }
  } catch {
    // Firestore down — PG already committed
  }

  return trip;
}

module.exports = { getDscRoutes, bookTransport };

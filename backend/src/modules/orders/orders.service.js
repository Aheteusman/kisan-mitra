const { PrismaClient } = require('@prisma/client');
const { createNotification } = require('../notifications/notifications.service');

const prisma = new PrismaClient();

const ORDER_INCLUDE_LIST = {
  listing: { select: { cropType: true, quantityKg: true, remainingKg: true } },
  buyer: { select: { id: true, name: true } },
  trip: { select: { status: true } },
};

const ORDER_INCLUDE_DETAIL = {
  listing: { include: { images: true } },
  buyer: { select: { id: true, name: true, phone: true } },
  seller: { select: { id: true, name: true, phone: true } },
  trip: true,
};

// ── placeOrder ────────────────────────────────────────────────────────────────

async function placeOrder(buyerId, { listingId, quantityKg, deliveryDate, deliveryAddress }) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });

  if (!listing) throw Object.assign(new Error('Listing not found'), { status: 404 });
  if (listing.status !== 'ACTIVE') throw Object.assign(new Error('Listing is not active'), { status: 400 });
  if (listing.remainingKg < quantityKg) throw Object.assign(new Error('Insufficient stock'), { status: 400 });
  if (listing.sellerId === buyerId) throw Object.assign(new Error('Buyer cannot be the seller'), { status: 400 });

  const produceTotal = listing.askingPrice * quantityKg;
  const platformFee = parseFloat((produceTotal * 0.06).toFixed(2));

  const newRemainingKg = listing.remainingKg - quantityKg;

  // Determine new listing status
  let newListingStatus;
  if (newRemainingKg <= 0) {
    newListingStatus = 'FULFILLED';
  } else {
    // Check if this is the first order on this listing
    const existingOrderCount = await prisma.order.count({
      where: { listingId, status: { notIn: ['CANCELLED'] } },
    });
    newListingStatus = existingOrderCount === 0 ? 'ACCEPTED' : listing.status;
  }

  const [order] = await prisma.$transaction([
    prisma.order.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        quantityKg,
        pricePerKg: listing.askingPrice,
        deliveryDate: new Date(deliveryDate),
        deliveryAddress,
        produceTotal,
        platformFee,
        status: 'PENDING',
        buyerPaymentStatus: 'STAGE1_PAID',
        sellerPaymentStatus: 'WAITING',
      },
    }),
    prisma.listing.update({
      where: { id: listingId },
      data: {
        remainingKg: newRemainingKg,
        ...(newListingStatus !== listing.status && { status: newListingStatus }),
      },
    }),
  ]);

  // Fire-and-forget notification
  createNotification(
    listing.sellerId,
    'ORDER_PLACED',
    'New Order Received',
    `You have a new order for ${quantityKg}kg`,
    { orderId: order.id }
  ).catch(() => {});

  return order;
}

// ── getOrdersForUser ──────────────────────────────────────────────────────────

async function getOrdersForUser(userId, role, { page = 1, limit = 20 } = {}) {
  if (role === 'DRIVER') return [];

  const where = role === 'BUYER' ? { buyerId: userId } : { sellerId: userId };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE_LIST,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, limit };
}

// ── getOrderById ──────────────────────────────────────────────────────────────

async function getOrderById(orderId, userId, role) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE_DETAIL,
  });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  const canAccess =
    order.buyerId === userId ||
    order.sellerId === userId ||
    role === 'ADMIN';

  if (!canAccess) throw Object.assign(new Error('Forbidden'), { status: 403 });

  return order;
}

// ── acceptOrder ───────────────────────────────────────────────────────────────

async function acceptOrder(orderId, sellerId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.sellerId !== sellerId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (order.status !== 'PENDING') {
    throw Object.assign(new Error(`Cannot accept order in status ${order.status}`), { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'ACCEPTED' },
  });

  createNotification(
    order.buyerId,
    'ORDER_ACCEPTED',
    'Order Accepted',
    'Your order has been accepted by the seller',
    { orderId }
  ).catch(() => {});

  return updated;
}

// ── declineOrder ──────────────────────────────────────────────────────────────

async function declineOrder(orderId, sellerId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { listing: true },
  });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.sellerId !== sellerId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (order.status !== 'PENDING') {
    throw Object.assign(new Error(`Cannot decline order in status ${order.status}`), { status: 400 });
  }

  const restoredRemainingKg = order.listing.remainingKg + order.quantityKg;

  // Determine restored listing status
  let restoredListingStatus = order.listing.status;
  if (order.listing.status === 'FULFILLED') {
    restoredListingStatus = 'ACCEPTED'; // still has other orders
  } else {
    const otherActiveOrders = await prisma.order.count({
      where: {
        listingId: order.listingId,
        id: { not: orderId },
        status: { in: ['PENDING', 'ACCEPTED', 'TRANSPORT_BOOKED', 'LOADED', 'IN_TRANSIT'] },
      },
    });
    if (otherActiveOrders === 0) restoredListingStatus = 'ACTIVE';
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', buyerPaymentStatus: 'REFUNDED' },
    }),
    prisma.listing.update({
      where: { id: order.listingId },
      data: {
        remainingKg: restoredRemainingKg,
        status: restoredListingStatus,
      },
    }),
  ]);

  createNotification(
    order.buyerId,
    'ORDER_DECLINED',
    'Order Declined',
    'Your order has been declined by the seller',
    { orderId }
  ).catch(() => {});

  return { success: true };
}

// ── confirmDelivery ───────────────────────────────────────────────────────────

async function confirmDelivery(orderId, buyerId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.buyerId !== buyerId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (order.status !== 'IN_TRANSIT') {
    throw Object.assign(new Error(`Cannot confirm delivery for order in status ${order.status}`), { status: 400 });
  }

  const [updated] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        sellerPaymentStatus: 'FULLY_SETTLED',
        driverPaymentStatus: 'PAID',
      },
    }),
  ]);

  createNotification(
    order.sellerId,
    'PAYMENT_FINAL',
    'Payment Released',
    'Delivery confirmed. Your 44% final payment has been released.',
    { orderId }
  ).catch(() => {});

  return updated;
}

// ── rateOrder ─────────────────────────────────────────────────────────────────

async function rateOrder(orderId, buyerId, { qualityRating, packagingRating, deliveryRating, comment }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.buyerId !== buyerId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (order.status !== 'DELIVERED') {
    throw Object.assign(new Error('Can only rate delivered orders'), { status: 400 });
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { qualityRating, packagingRating, deliveryRating, ratingComment: comment },
  });
}

module.exports = {
  placeOrder,
  getOrdersForUser,
  getOrderById,
  acceptOrder,
  declineOrder,
  confirmDelivery,
  rateOrder,
};
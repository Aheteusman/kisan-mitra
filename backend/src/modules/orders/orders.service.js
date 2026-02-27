const { prisma } = require('../../config/prisma');       // ← shared singleton
const { createNotification } = require('../notifications/notifications.service');

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

  // ── FIX: Listing stays ACTIVE while stock remains.
  // Only transition to FULFILLED when completely out of stock.
  // This prevents listings from "disappearing" from the farmer's view.
  const newListingStatus = newRemainingKg <= 0 ? 'FULFILLED' : 'ACTIVE';

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
        status: newListingStatus,
      },
    }),
  ]);

  // Fire-and-forget notification
  createNotification(
    listing.sellerId,
    'ORDER_PLACED',
    'New Order Received',
    `You have a new order for ${quantityKg}kg of ${listing.cropType}`,
    { orderId: order.id }
  ).catch(() => {});

  return order;
}

// ── getOrdersForUser ──────────────────────────────────────────────────────────

async function getOrdersForUser(userId, role, { page = 1, limit = 20 } = {}) {
  if (role === 'DRIVER') return { orders: [], total: 0, page, limit };

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

  // Restore listing status to ACTIVE when a pending order is declined
  const restoredListingStatus = order.listing.status === 'FULFILLED' ? 'ACTIVE' : order.listing.status;

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
    'Delivery confirmed. Your final payment has been released.',
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

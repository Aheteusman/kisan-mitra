const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── createNotification ────────────────────────────────────────────────────────
// Saves to DB first (guaranteed), then attempts FCM (best-effort, never throws).

async function createNotification(userId, type, title, body, data = {}) {
  // 1. Save to DB — source of truth
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, data, read: false },
  });

  // 2. Attempt FCM push — non-critical path
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (user?.fcmToken) {
      const { getMessaging } = require('firebase-admin/messaging');

      // FCM data values must be strings
      const stringData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      );

      await getMessaging().send({
        token: user.fcmToken,
        notification: { title, body },
        data: stringData,
      });
    }
  } catch (e) {
    console.warn('FCM failed (non-critical):', e.message);
  }

  return notification;
}

// ── getNotifications ──────────────────────────────────────────────────────────

async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const where = {
    userId,
    ...(unreadOnly && { read: false }),
  };

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { notifications, total, page, limit, unreadCount };
}

// ── markRead ──────────────────────────────────────────────────────────────────

async function markRead(notificationId, userId) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw Object.assign(new Error('Notification not found'), { status: 404 });
  }
  if (notification.userId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

// ── markAllRead ───────────────────────────────────────────────────────────────

async function markAllRead(userId) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return { success: true, updated: count };
}

module.exports = { createNotification, getNotifications, markRead, markAllRead };
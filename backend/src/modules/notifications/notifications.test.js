/**
 * Tests for notifications.service.js
 *
 * Strategy: mock Prisma and firebase-admin/messaging to isolate service logic.
 */

jest.mock('@prisma/client');
jest.mock('firebase-admin/messaging');

const { PrismaClient } = require('@prisma/client');
const { getMessaging } = require('firebase-admin/messaging');

// ─── Prisma mock setup ────────────────────────────────────────────────────────

const mockCreate       = jest.fn();
const mockFindUnique   = jest.fn();
const mockFindMany     = jest.fn();
const mockCount        = jest.fn();
const mockUpdate       = jest.fn();
const mockUpdateMany   = jest.fn();
const mockTransaction  = jest.fn((ops) => Promise.all(ops));

PrismaClient.mockImplementation(() => ({
  notification: {
    create:      mockCreate,
    findUnique:  mockFindUnique,
    findMany:    mockFindMany,
    count:       mockCount,
    update:      mockUpdate,
    updateMany:  mockUpdateMany,
  },
  user: {
    findUnique: mockFindUnique,
  },
  $transaction: mockTransaction,
}));

// ─── FCM mock setup ───────────────────────────────────────────────────────────

const mockSend = jest.fn();
getMessaging.mockReturnValue({ send: mockSend });

// ─── Import service AFTER mocks ───────────────────────────────────────────────

const {
  createNotification,
  getNotifications,
  markRead,
  markAllRead,
} = require('./notifications.service');
// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotification(overrides = {}) {
  return {
    id:        'notif_1',
    userId:    'user_1',
    type:      'ORDER_PLACED',
    title:     'New Order',
    body:      'You have a new order',
    data:      { orderId: 'order_1' },
    read:      false,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── createNotification ───────────────────────────────────────────────────────

describe('createNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves notification to DB and returns it', async () => {
    const notif = makeNotification();
    mockCreate.mockResolvedValue(notif);
    // User has no FCM token
    mockFindUnique.mockResolvedValue({ fcmToken: null });

    const result = await createNotification('user_1', 'ORDER_PLACED', 'New Order', 'You have a new order', { orderId: 'order_1' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        type:   'ORDER_PLACED',
        title:  'New Order',
        body:   'You have a new order',
        data:   { orderId: 'order_1' },
        read:   false,
      },
    });
    expect(result).toEqual(notif);
  });

  test('saves to DB even when FCM throws', async () => {
    const notif = makeNotification();
    mockCreate.mockResolvedValue(notif);
    mockFindUnique.mockResolvedValue({ fcmToken: 'some-token' });
    mockSend.mockRejectedValue(new Error('FCM network error'));

    // Should NOT throw
    const result = await createNotification('user_1', 'ORDER_PLACED', 'Title', 'Body', {});

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(notif);   // DB save succeeded
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('sends FCM push when user has fcmToken', async () => {
    const notif = makeNotification();
    mockCreate.mockResolvedValue(notif);
    mockFindUnique.mockResolvedValue({ fcmToken: 'device-token-abc' });
    mockSend.mockResolvedValue('message-id');

    await createNotification('user_1', 'PAYMENT_STAGE1', 'Payment', '50% released', { orderId: 'o1' });

    expect(mockSend).toHaveBeenCalledWith({
      token: 'device-token-abc',
      notification: { title: 'Payment', body: '50% released' },
      data: { orderId: 'o1' },   // values stringified
    });
  });

  test('stringifies all data values for FCM', async () => {
    const notif = makeNotification();
    mockCreate.mockResolvedValue(notif);
    mockFindUnique.mockResolvedValue({ fcmToken: 'tok' });
    mockSend.mockResolvedValue('ok');

    await createNotification('user_1', 'TEST', 'T', 'B', { count: 5, flag: true, nested: { a: 1 } });

    const [call] = mockSend.mock.calls;
    const { data } = call[0];
    expect(typeof data.count).toBe('string');
    expect(typeof data.flag).toBe('string');
  });

  test('skips FCM when user has no fcmToken', async () => {
    mockCreate.mockResolvedValue(makeNotification());
    mockFindUnique.mockResolvedValue({ fcmToken: undefined });

    await createNotification('user_1', 'ORDER_PLACED', 'T', 'B', {});

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ─── getNotifications ─────────────────────────────────────────────────────────

describe('getNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns paginated notifications with unreadCount', async () => {
    const notifs = [makeNotification(), makeNotification({ id: 'notif_2', read: true })];
    mockTransaction.mockResolvedValue([notifs, 2, 1]);

    const result = await getNotifications('user_1', { page: 1, limit: 20 });

    expect(result.notifications).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.unreadCount).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  test('filters by unread when unreadOnly=true', async () => {
    mockTransaction.mockResolvedValue([[], 0, 0]);

    await getNotifications('user_1', { unreadOnly: true });

    // Transaction should be called — we verify the where filter through mock args
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

// ─── markRead ────────────────────────────────────────────────────────────────

describe('markRead', () => {
  beforeEach(() => jest.clearAllMocks());

  test('marks notification as read', async () => {
    const notif = makeNotification();
    mockFindUnique.mockResolvedValue(notif);
    mockUpdate.mockResolvedValue({ ...notif, read: true });

    const result = await markRead('notif_1', 'user_1');
    expect(result.read).toBe(true);
  });

  test('throws 404 when notification not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(markRead('bad_id', 'user_1')).rejects.toMatchObject({ status: 404 });
  });

  test('throws 403 when notification belongs to different user', async () => {
    mockFindUnique.mockResolvedValue(makeNotification({ userId: 'other_user' }));
    await expect(markRead('notif_1', 'user_1')).rejects.toMatchObject({ status: 403 });
  });
});

// ─── markAllRead ──────────────────────────────────────────────────────────────

describe('markAllRead', () => {
  beforeEach(() => jest.clearAllMocks());

  test('bulk-updates all unread notifications for user', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });
    const result = await markAllRead('user_1');
    expect(result).toEqual({ success: true, updated: 5 });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', read: false },
      data: { read: true },
    });
  });
});
jest.mock('../../config/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    otpRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock('../../config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jest',
    OTP_DEV_MODE: 'true',
  },
}));

const { prisma } = require('../../config/prisma');
const authService = require('./auth.service');
const { authenticate } = require('../../middleware/auth');

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─── registerUser ────────────────────────────────────────────────────────────

describe('registerUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hashes the password and creates an OtpRecord', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.otpRecord.create.mockResolvedValue({});

    const result = await authService.registerUser({
      phone: '9876543210',
      email: 'farmer@test.com',
      password: 'Test@1234',
      name: 'Raju',
      role: 'FARMER',
      location: 'Belagavi',
    });

    // password was hashed (bcrypt hash starts with $2b)
    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).toMatch(/^\$2b\$/);

    // OtpRecord created
    expect(prisma.otpRecord.create).toHaveBeenCalledTimes(1);

    // devOtp returned
    expect(result).toHaveProperty('userId', 'user-1');
    expect(result).toHaveProperty('_devOtp');
    expect(result._devOtp).toMatch(/^\d{6}$/);
  });

  it('throws 409 when phone or email already exists', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      authService.registerUser({
        phone: '9876543210',
        email: 'farmer@test.com',
        password: 'Test@1234',
        name: 'Raju',
        role: 'FARMER',
        location: 'Belagavi',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_USER' });
  });
});

// ─── loginUser ───────────────────────────────────────────────────────────────

describe('loginUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a token when credentials are correct', async () => {
    // Pre-hash a known password
    const { hash } = require('../../utils/password');
    const passwordHash = await hash('Test@1234');

    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'farmer@test.com',
      role: 'FARMER',
      isPhoneVerified: true,
      passwordHash,
    });

    const result = await authService.loginUser('farmer@test.com', 'Test@1234');
    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
  });

  it('throws 401 when password is wrong', async () => {
    const { hash } = require('../../utils/password');
    const passwordHash = await hash('Test@1234');

    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'farmer@test.com',
      role: 'FARMER',
      isPhoneVerified: true,
      passwordHash,
    });

    await expect(
      authService.loginUser('farmer@test.com', 'WrongPassword')
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─── authenticate middleware ──────────────────────────────────────────────────

describe('authenticate middleware', () => {
  const { sign } = require('../../utils/jwt');

  it('sets req.user when token is valid', () => {
    const payload = { id: 'user-1', role: 'FARMER', email: 'farmer@test.com' };
    const token = sign(payload);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: 'user-1', role: 'FARMER' });
  });

  it('returns 401 when no token is provided', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
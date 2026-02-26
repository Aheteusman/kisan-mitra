const { prisma } = require('../../config/prisma');
const { hash, compare } = require('../../utils/password');
const { sign } = require('../../utils/jwt');
const { env } = require('../../config/env');

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function registerUser(data) {
  const { phone, email, password, name, role, language, location, businessName, businessType, vehicleType, vehicleReg } = data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  });
  if (existing) {
    throw makeError('User with this phone or email already exists', 409, 'DUPLICATE_USER');
  }

  const passwordHash = await hash(password);

  const user = await prisma.user.create({
    data: {
      phone,
      email,
      passwordHash,
      name,
      role,
      language: language || 'EN',
      location: location || null,
      businessName: businessName || null,
      businessType: businessType || null,
      vehicleType: vehicleType || null,
      vehicleReg: vehicleReg || null,
    },
  });

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpRecord.create({
    data: {
      userId: user.id,
      otp,
      expiresAt,
      used: false,
    },
  });

  const result = { userId: user.id };
  if (env.OTP_DEV_MODE === 'true' || env.OTP_DEV_MODE === true) {
    result._devOtp = otp;
  }
  return result;
}

async function verifyOtp(userId, otp) {
  const record = await prisma.otpRecord.findFirst({
    where: {
      userId,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: 'desc' },
  });

  if (!record || record.otp !== otp) {
    throw makeError('Invalid or expired OTP', 400, 'INVALID_OTP');
  }

  await prisma.otpRecord.update({
    where: { id: record.id },
    data: { used: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isPhoneVerified: true },
  });

  const token = sign({ id: user.id, role: user.role, email: user.email });
  return { token };
}

async function loginUser(emailOrPhone, password) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    },
  });

  if (!user) {
    throw makeError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isPhoneVerified) {
    throw makeError('Phone not verified', 403, 'PHONE_NOT_VERIFIED');
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    throw makeError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const token = sign({ id: user.id, role: user.role, email: user.email });
  return { token };
}

module.exports = { registerUser, verifyOtp, loginUser };
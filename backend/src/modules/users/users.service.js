const { z } = require('zod');
const { prisma } = require('../../config/prisma');

const ALLOWED_UPDATE_FIELDS = ['language', 'fcmToken', 'location', 'deliveryAddress', 'name', 'isOnline', 'vehicleType', 'vehicleCapacity', 'vehicleReg', 'licenseUrl', 'workMode'];

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    const err = Object.assign(new Error('User not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
    throw err;
  }
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

async function updateMe(userId, data) {
  const filtered = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (data[key] !== undefined) {
      filtered[key] = data[key];
    }
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: filtered,
  });
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

const updateMeSchema = z.object({
  language: z.enum(['EN', 'KN', 'HI', 'MR']).optional(),
  fcmToken: z.string().optional(),
  location: z.string().optional(),
  deliveryAddress: z.string().optional(),
  name: z.string().min(1).optional(),
  isOnline: z.boolean().optional(),
  vehicleType: z.string().optional(),
  vehicleCapacity: z.number().optional(),
  vehicleReg: z.string().optional(),
  licenseUrl: z.string().optional(),
  workMode: z.string().optional(),
});

module.exports = { getMe, updateMe, updateMeSchema };
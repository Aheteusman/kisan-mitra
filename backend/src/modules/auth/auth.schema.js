const { z } = require('zod');

const baseRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['FARMER', 'BUYER', 'DRIVER', 'TRADER']),
  language: z.enum(['EN', 'KN', 'HI', 'MR']).optional(),
  location: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  vehicleType: z.string().optional(),
  vehicleReg: z.string().optional(),
});

const registerSchema = baseRegisterSchema.superRefine((data, ctx) => {
  if (data.role === 'FARMER' || data.role === 'TRADER') {
    if (!data.location) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location'], message: 'location is required for FARMER/TRADER' });
    }
  }
  if (data.role === 'BUYER') {
    if (!data.businessName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: 'businessName is required for BUYER' });
    }
    if (!data.businessType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessType'], message: 'businessType is required for BUYER' });
    }
  }
  if (data.role === 'DRIVER') {
    if (!data.vehicleType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleType'], message: 'vehicleType is required for DRIVER' });
    }
    if (!data.vehicleReg) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleReg'], message: 'vehicleReg is required for DRIVER' });
    }
  }
});

const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit string'),
});

const loginSchema = z.object({
  emailOrPhone: z.string().min(1),
  password: z.string().min(1),
});

module.exports = { registerSchema, verifyOtpSchema, loginSchema };
const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development','production','test']).default('development'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  AI_SERVICE_URL: z.string().url().optional(),
  ORS_API_KEY: z.string().optional(),
  OTP_DEV_MODE: z.string().default('false'),
  FRONTEND_URL: z.string().default('http://localhost:8081'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);  // FAIL FAST — do not start with missing env vars
}

module.exports = { env: parsed.data };

const { z } = require('zod');

const QUALITY_GRADES = ['GRADE_A', 'GRADE_B', 'MIXED'];

const createListingSchema = z.object({
  cropType: z.string().min(1, 'cropType is required'),
  quantityKg: z.number({ coerce: true }).positive('quantityKg must be > 0'),
  harvestDate: z.string().min(1, 'harvestDate is required'),
  qualityGrade: z.enum(QUALITY_GRADES, {
    errorMap: () => ({ message: `qualityGrade must be one of ${QUALITY_GRADES.join(', ')}` }),
  }),
  askingPrice: z.number({ coerce: true }).positive('askingPrice must be > 0'),
});

const updateListingSchema = createListingSchema.partial();

const filterSchema = z.object({
  crop: z.string().optional(),
  region: z.string().optional(),
  minPrice: z.number({ coerce: true }).optional(),
  maxPrice: z.number({ coerce: true }).optional(),
  grade: z.enum(QUALITY_GRADES).optional(),
  page: z.number({ coerce: true }).int().positive().default(1),
  limit: z.number({ coerce: true }).int().positive().max(100).default(20),
});

module.exports = { createListingSchema, updateListingSchema, filterSchema };
const Joi = require('joi');

const placeOrderSchema = Joi.object({
  listingId: Joi.string().required(),
  quantityKg: Joi.number().positive().required(),
  deliveryDate: Joi.date().iso().required(),
  deliveryAddress: Joi.string().min(5).required(),
});

const rateOrderSchema = Joi.object({
  qualityRating: Joi.number().integer().min(1).max(5).required(),
  packagingRating: Joi.number().integer().min(1).max(5).required(),
  deliveryRating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional(),
});

module.exports = { placeOrderSchema, rateOrderSchema };
const ordersService = require('./orders.service');
const { placeOrderSchema, rateOrderSchema } = require('./orders.schema');

async function placeOrder(req, res, next) {
  try {
    const { error, value } = placeOrderSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const order = await ordersService.placeOrder(req.user.id, value);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function getOrdersForUser(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await ordersService.getOrdersForUser(req.user.id, req.user.role, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getOrderById(req, res, next) {
  try {
    const order = await ordersService.getOrderById(req.params.id, req.user.id, req.user.role);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function acceptOrder(req, res, next) {
  try {
    const order = await ordersService.acceptOrder(req.params.id, req.user.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function declineOrder(req, res, next) {
  try {
    const result = await ordersService.declineOrder(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function confirmDelivery(req, res, next) {
  try {
    const order = await ordersService.confirmDelivery(req.params.id, req.user.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function rateOrder(req, res, next) {
  try {
    const { error, value } = rateOrderSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const order = await ordersService.rateOrder(req.params.id, req.user.id, value);
    res.json(order);
  } catch (err) {
    next(err);
  }
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
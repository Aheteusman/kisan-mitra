const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { env } = require('./config/env');

const app = express();

// Security and logging middleware
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check — always works, even if DB is down
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), env: env.NODE_ENV });
});

// Phase 1 — Auth & Users
app.use('/api/auth',  require('./modules/auth/auth.router'));
app.use('/api/users', require('./modules/users/users.router'));

// Phase 2 — Listings + AI Integration
app.use('/api/listings', require('./modules/listings/listings.router'));
app.use('/api/ai',       require('./modules/ai/ai.router'));

// Phase 3 — Orders & Payment
app.use('/api/orders', require('./modules/orders/orders.router'));

// Phase 4 — Transport System & Driver Operations
app.use('/api/transport', require('./modules/transport/transport.router'));
app.use('/api/drivers',   require('./modules/drivers/drivers.router'));

// book-transport endpoint lives under transport router but is accessed via /api/orders/:id/book-transport
// Re-mount transport router at /api to handle the /orders/:id/book-transport path
app.use('/api', require('./modules/transport/transport.router'));

// Phase 5 — Notifications + Analytics + Market Prices
app.use('/api/notifications', require('./modules/notifications/notifications.router'));
app.use('/api/analytics',     require('./modules/analytics/analytics.router'));

// Must be last
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
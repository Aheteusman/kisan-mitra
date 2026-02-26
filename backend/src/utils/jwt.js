const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function sign(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
}

function verify(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { sign, verify };
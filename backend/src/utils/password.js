const bcrypt = require('bcrypt');

const ROUNDS = 12;

function hash(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

function compare(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

module.exports = { hash, compare };
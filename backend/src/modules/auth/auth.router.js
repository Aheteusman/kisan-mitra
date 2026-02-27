const express = require('express');
const { validate } = require('../../middleware/validate');
const { registerSchema, loginSchema } = require('./auth.schema');
const { register, login } = require('./auth.controller');

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);

module.exports = router;
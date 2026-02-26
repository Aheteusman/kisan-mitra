const express = require('express');
const { validate } = require('../../middleware/validate');
const { registerSchema, verifyOtpSchema, loginSchema } = require('./auth.schema');
const { register, verifyOtp, login } = require('./auth.controller');

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);
router.post('/login', validate(loginSchema), login);

module.exports = router;
const authService = require('./auth.service');

async function register(req, res, next) {
  try {
    const data = await authService.registerUser(req.body);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { userId, otp } = req.body;
    const data = await authService.verifyOtp(userId, otp);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { emailOrPhone, password } = req.body;
    const data = await authService.loginUser(emailOrPhone, password);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, verifyOtp, login };
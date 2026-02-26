function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden: insufficient role', code: 'FORBIDDEN' },
      });
    }
    next();
  };
}

module.exports = { requireRole };
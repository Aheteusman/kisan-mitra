const { verify } = require('../utils/jwt');

function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { message: 'No token provided', code: 'NO_TOKEN' },
      });
    }
    const token = authHeader.slice(7);
    const decoded = verify(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
    });
  }
}

// roles: array of allowed roles e.g. ['BUYER', 'TRADER']
function authorize(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Access denied. Required roles: ${roles.join(', ')}`,
          code: 'FORBIDDEN',
        },
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
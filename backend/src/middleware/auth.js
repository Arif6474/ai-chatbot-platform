const env = require('../config/env');
const AdminUser = require('../models/AdminUser');
const { verifyAdminToken } = require('../services/tokenService');

/**
 * Middleware: Require Administrator Authentication
 * Accepts token from HTTP-only cookie or Authorization: Bearer <token>
 */
async function requireAdminAuth(req, res, next) {
  try {
    let token = null;

    // 1. Check HTTP-only cookie first
    if (req.cookies && req.cookies[env.ADMIN_COOKIE_NAME]) {
      token = req.cookies[env.ADMIN_COOKIE_NAME];
    }

    // 2. Check Authorization header (Bearer token)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. No session or token provided.',
          code: 'UNAUTHORIZED',
        },
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAdminToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired authentication session.',
          code: 'INVALID_TOKEN',
        },
      });
    }

    // Validate admin exists and is active in database
    const admin = await AdminUser.findById(decoded.sub);
    if (!admin || admin.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Admin account not found or deactivated.',
          code: 'ACCOUNT_INACTIVE',
        },
      });
    }

    // Attach verified admin to request (never trust client-supplied admin ID)
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireAdminAuth,
};

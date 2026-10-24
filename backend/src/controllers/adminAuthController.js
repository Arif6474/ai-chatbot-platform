const env = require('../config/env');
const AdminUser = require('../models/AdminUser');
const { signAdminToken, getAuthCookieOptions } = require('../services/tokenService');

/**
 * Authenticate administrator and issue HTTP-only session cookie
 * POST /api/v1/admin/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    // Validate inputs
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find admin user
    const admin = await AdminUser.findOne({ email: normalizedEmail });
    if (!admin) {
      // Use generic error message to prevent account enumeration
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      });
    }

    if (admin.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Admin account has been deactivated. Please contact support.',
          code: 'ACCOUNT_DEACTIVATED',
        },
      });
    }

    // Verify password securely with bcrypt
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
      });
    }

    // Update last login timestamp
    admin.lastLoginAt = new Date();
    await admin.save();

    // Sign JWT and set HTTP-only cookie
    const token = signAdminToken(admin);
    const cookieOptions = getAuthCookieOptions();
    res.cookie(env.ADMIN_COOKIE_NAME, token, cookieOptions);

    return res.status(200).json({
      success: true,
      data: {
        admin: admin.toJSON(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Clear administrator session cookie
 * POST /api/v1/admin/auth/logout
 */
function logout(req, res) {
  const isStrictCSRF = env.isProduction || process.env.ENFORCE_STRICT_CSRF === 'true';

  if (isStrictCSRF) {
    const requestOrigin = req.headers.origin;
    const hasCookie = !!(req.cookies && req.cookies[env.ADMIN_COOKIE_NAME]);

    if (hasCookie || requestOrigin) {
      if (!requestOrigin || !env.ALLOWED_ORIGINS.includes(requestOrigin)) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Request origin not permitted.',
            code: 'FORBIDDEN',
          },
        });
      }
    }
  }

  const cookieOptions = getAuthCookieOptions();
  res.clearCookie(env.ADMIN_COOKIE_NAME, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

/**
 * Get currently authenticated administrator profile
 * GET /api/v1/admin/auth/me
 */
function getMe(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      admin: req.admin.toJSON(),
    },
  });
}

module.exports = {
  login,
  logout,
  getMe,
};

const express = require('express');
const env = require('../config/env');
const AdminUser = require('../models/AdminUser');
const { signAdminToken, getAuthCookieOptions } = require('../services/tokenService');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/v1/admin/auth/login
 * @desc    Authenticate administrator and issue HTTP-only session cookie
 * @access  Public (Rate-limited)
 */
router.post('/login', loginRateLimiter, async (req, res, next) => {
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
        // Token is delivered only via HttpOnly cookie (not in response body)
        // to eliminate XSS-accessible token exposure
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/admin/auth/logout
 * @desc    Clear administrator session cookie
 * @access  Public (Origin-validated to prevent logout CSRF)
 */
router.post('/logout', (req, res) => {
  // CSRF defense: validate Origin header when present.
  // SameSite=Lax alone does not block cross-site POST in all scenarios.
  const requestOrigin = req.headers.origin;
  const allowedOrigins = [
    env.FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  if (requestOrigin && !allowedOrigins.includes(requestOrigin) && env.isProduction) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Request origin not permitted.',
        code: 'FORBIDDEN',
      },
    });
  }

  res.clearCookie(env.ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @route   GET /api/v1/admin/auth/me
 * @desc    Get currently authenticated administrator profile
 * @access  Admin Private
 */
router.get('/me', requireAdminAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      admin: req.admin.toJSON(),
    },
  });
});

module.exports = router;

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
        token, // Included for non-browser/test clients
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/admin/auth/logout
 * @desc    Clear administrator session cookie
 * @access  Public
 */
router.post('/logout', (req, res) => {
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

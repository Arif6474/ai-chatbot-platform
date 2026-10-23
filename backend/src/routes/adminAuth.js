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
 * @access  Public (Origin-validated in production to prevent logout CSRF)
 *
 * CSRF defense rationale:
 * - SameSite=Lax alone does not block all cross-site POST scenarios (e.g.
 *   form submissions, 307 redirects in older browsers).
 * - Real browsers ALWAYS send an Origin header on cross-origin POST requests.
 * - A missing Origin header in a browser context is therefore suspicious;
 *   however, non-browser clients (curl, API tools) legitimately omit it and
 *   cannot carry HttpOnly cookies, so they are harmless.
 * - In production: requests with a disallowed or missing Origin header are
 *   rejected with 403, unless they arrive without a cookie (non-browser clients).
 * - In development/test: the check is skipped to preserve test ergonomics.
 *
 * Logout does NOT revoke the JWT server-side. A copied JWT remains valid
 * until its 24-hour expiration. Cookie clearing makes the browser re-present
 * the token impossible; server-side revocation would require a token blocklist
 * (planned for a future hardening step).
 */
router.post('/logout', (req, res) => {
  if (env.isProduction) {
    const requestOrigin = req.headers.origin;
    const hasCookie = !!(req.cookies && req.cookies[env.ADMIN_COOKIE_NAME]);

    // In production, block any POST that:
    //  (a) carries an auth cookie (i.e., is a browser request), AND
    //  (b) has no Origin header OR has a disallowed Origin header.
    // Non-browser clients with no cookie are let through (they cannot be
    // CSRF-attacked since they have no cookie to be stolen).
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

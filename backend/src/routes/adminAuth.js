const express = require('express');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { requireAdminAuth } = require('../middleware/auth');
const adminAuthController = require('../controllers/adminAuthController');

const router = express.Router();

/**
 * @route   POST /api/v1/admin/auth/login
 * @desc    Authenticate administrator and issue HTTP-only session cookie
 * @access  Public (Rate-limited)
 */
router.post('/login', loginRateLimiter, adminAuthController.login);

/**
 * @route   POST /api/v1/admin/auth/logout
 * @desc    Clear administrator session cookie
 * @access  Public (Origin-validated in production to prevent logout CSRF)
 */
router.post('/logout', adminAuthController.logout);

/**
 * @route   GET /api/v1/admin/auth/me
 * @desc    Get currently authenticated administrator profile
 * @access  Admin Private
 */
router.get('/me', requireAdminAuth, adminAuthController.getMe);

module.exports = router;

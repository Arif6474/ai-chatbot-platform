const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * Login Rate Limiter: Max 5 failed attempts per 15 minutes window per IP
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isTest ? 100 : 5, // Lenient in test mode, strict in dev/production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  skipSuccessfulRequests: false,
});

module.exports = {
  loginRateLimiter,
};

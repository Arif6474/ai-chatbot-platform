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

/**
 * Public Chat Rate Limiter: Max 30 messages per 1 minute window per IP
 */
const publicChatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: env.isTest ? 1000 : 30, // Lenient in test mode, strict in production/development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many chat messages from this IP. Please wait a moment before sending another message.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  skipSuccessfulRequests: false,
});

/**
 * Public Lead Rate Limiter: Max 10 lead submissions per 15 minutes window per IP
 */
const publicLeadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isTest ? 1000 : 10, // Lenient in test mode, strict in production/development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many lead submissions from this IP. Please wait before submitting another enquiry.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  skipSuccessfulRequests: false,
});

module.exports = {
  loginRateLimiter,
  publicChatRateLimiter,
  publicLeadRateLimiter,
};

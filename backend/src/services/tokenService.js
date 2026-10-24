const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Generate signed JWT token for administrator
 * @param {Object} admin
 * @returns {string}
 */
function signAdminToken(admin) {
  const payload = {
    sub: admin.id || admin._id.toString(),
    role: admin.role || 'admin',
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode JWT token
 * @param {string} token
 * @returns {Object} decoded payload
 */
function verifyAdminToken(token) {
  // Pin to HS256 — prevents algorithm confusion attacks (none, RS256 downgrade)
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

/**
 * Standard cookie configuration for authentication token
 * @returns {Object}
 */
function getAuthCookieOptions() {
  const sameSiteVal = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  const isSameSiteNone = sameSiteVal === 'none';
  const cookieOptions = {
    httpOnly: true,
    secure: env.isProduction || isSameSiteNone,
    sameSite: isSameSiteNone ? 'none' : sameSiteVal,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  };
  if (process.env.COOKIE_DOMAIN) {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  }
  return cookieOptions;
}

module.exports = {
  signAdminToken,
  verifyAdminToken,
  getAuthCookieOptions,
};

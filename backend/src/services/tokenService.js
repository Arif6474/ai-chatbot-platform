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
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode JWT token
 * @param {string} token
 * @returns {Object} decoded payload
 */
function verifyAdminToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/**
 * Standard cookie configuration for authentication token
 * @returns {Object}
 */
function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  };
}

module.exports = {
  signAdminToken,
  verifyAdminToken,
  getAuthCookieOptions,
};

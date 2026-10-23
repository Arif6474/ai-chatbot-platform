const env = require('../config/env');

/**
 * Reusable CSRF Origin Validation Middleware for state-changing endpoints (POST, PUT, PATCH, DELETE)
 *
 * Security rationale:
 * 1. SameSite=Lax cookies provide baseline defense in modern browsers, but do not protect
 *    against all cross-site mutation scenarios (e.g. top-level navigations with POST,
 *    older browser quirks, or complex redirects).
 * 2. Real browsers ALWAYS send an Origin header on cross-origin fetch/XHR and form submissions.
 * 3. In production (or strict CSRF mode), any state-changing request carrying an ambient session
 *    cookie MUST have a valid Origin matching env.ALLOWED_ORIGINS.
 * 4. Token-based API clients (using Authorization: Bearer without session cookies) are not
 *    susceptible to CSRF and are permitted without an Origin header.
 */
function csrfProtection(req, res, next) {
  // Safe HTTP methods do not mutate state
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isMutation) {
    return next();
  }

  const isStrictCSRF = env.isProduction || process.env.ENFORCE_STRICT_CSRF === 'true';
  if (!isStrictCSRF) {
    return next();
  }

  const requestOrigin = req.headers.origin;
  const hasCookie = !!(req.cookies && req.cookies[env.ADMIN_COOKIE_NAME]);

  // 1. If Origin header is present, enforce ALLOWED_ORIGINS
  if (requestOrigin) {
    if (!env.ALLOWED_ORIGINS.includes(requestOrigin)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Cross-origin request forbidden by CSRF protection policy.',
          code: 'FORBIDDEN',
        },
      });
    }
    return next();
  }

  // 2. If Origin is missing, check Referer as a secondary fallback
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!env.ALLOWED_ORIGINS.includes(refererOrigin)) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Request referer not permitted by CSRF policy.',
            code: 'FORBIDDEN',
          },
        });
      }
      return next();
    } catch (err) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Malformed referer header rejected by CSRF policy.',
          code: 'FORBIDDEN',
        },
      });
    }
  }

  // 3. Both Origin and Referer are missing
  if (hasCookie) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Missing Origin header on cookie-authenticated request.',
        code: 'FORBIDDEN',
      },
    });
  }

  // Permitted for non-cookie API clients (e.g. Bearer token clients)
  return next();
}

module.exports = {
  csrfProtection,
};

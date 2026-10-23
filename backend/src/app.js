const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const healthRoutes = require('./routes/health');
const adminAuthRoutes = require('./routes/adminAuth');
const adminTenantRoutes = require('./routes/adminTenants');
const adminContentRoutes = require('./routes/adminContent');
const adminChatbotConfigurationRoutes = require('./routes/adminChatbotConfigurations');
const publicChatRoutes = require('./routes/publicChat');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

/**
 * CORS — two policies applied per-route (never globally):
 *
 * publicCors  — origin: '*', credentials: false
 *   Applied to: /health, /api/v1/health, /api/v1/public/chat/*, /widget.js
 *   Health is an unauthenticated monitoring endpoint; public chat is consumed
 *   by widgets embedded on arbitrary customer domains.  No cookies on any of
 *   these routes.
 *
 * adminCors   — origin allowlist, credentials: true
 *   Applied to: /api/v1/admin/* routes only.
 *   In production only the configured FRONTEND_URL (and any extras in
 *   ALLOWED_ORIGINS) are accepted.  Cookie auth requires credentials: true.
 *
 * IMPORTANT: Neither policy is applied globally.  A global cors() that rejects
 * an origin calls next(err), which short-circuits every subsequent middleware
 * including any per-route cors applied later.  Per-route application isolates
 * each policy to exactly the routes that need it.
 */
const publicCors = cors({ origin: '*', credentials: false });

const adminCors = cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (e.g. curl, server-to-server) in development/test.
    // In production, only requests from the configured frontend origin are accepted.
    if (!origin) return callback(null, true);
    if (env.ALLOWED_ORIGINS.indexOf(origin) !== -1 || !env.isProduction) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Not allowed by origin policy'));
  },
  credentials: true,
});

// Cookie parser for reading session cookies
app.use(cookieParser());

// Body parsing with safe size limit
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Health endpoints — public, no credentials needed.
// Mounted at exact paths so the prefix does not match /api/v1/admin/* or
// /api/v1/public/* (which would incorrectly invoke the wrong CORS policy).
app.use('/health', publicCors, healthRoutes);
app.use('/api/v1/health', publicCors, healthRoutes);

// Admin Authentication routes
app.use('/api/v1/admin/auth', adminCors, adminAuthRoutes);

// Admin Tenant Management routes
app.use('/api/v1/admin/tenants', adminCors, adminTenantRoutes);

// Admin Content Management routes (tenant-scoped)
app.use('/api/v1/admin/tenants/:tenantId/content', adminCors, adminContentRoutes);

// Admin Chatbot Configuration routes (tenant-scoped)
app.use('/api/v1/admin/tenants/:tenantId/chatbot-configuration', adminCors, adminChatbotConfigurationRoutes);

// Public chat and session routes.
// publicCors allows any origin (no credentials) so embedded widgets on
// arbitrary customer domains can reach the public API without CORS rejection.
app.use('/api/v1/public/chat', publicCors, publicChatRoutes);

// Serve embeddable widget bundle statically (open to any origin)
app.get('/widget.js', publicCors, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../widget/dist/widget.js'));
});

// Catch-all 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

module.exports = app;

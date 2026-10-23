const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const healthRoutes = require('./routes/health');
const adminAuthRoutes = require('./routes/adminAuth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

app.use(cors({
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
}));

// Cookie parser for reading session cookies
app.use(cookieParser());

// Body parsing with safe size limit
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Mount health routes (both /health and /api/v1/health for flexibility)
app.use('/', healthRoutes);
app.use('/api/v1', healthRoutes);

// Mount Admin Authentication routes
app.use('/api/v1/admin/auth', adminAuthRoutes);

// Catch-all 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

module.exports = app;

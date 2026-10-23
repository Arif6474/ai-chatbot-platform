const env = require('../config/env');

/**
 * 404 Not Found Middleware
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
}

/**
 * Global Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';

  if (err.name === 'ValidationError' || (statusCode === 400 && errorCode === 'INTERNAL_ERROR')) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  }

  // Safe error response object
  const response = {
    success: false,
    error: {
      message: statusCode === 500 && env.isProduction 
        ? 'Internal Server Error' 
        : err.message || 'An unexpected error occurred',
      code: errorCode,
    },
  };

  // Only include stack trace in non-production environments
  if (!env.isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  // Log 500 errors to server console without exposing sensitive request contents
  if (statusCode >= 500) {
    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

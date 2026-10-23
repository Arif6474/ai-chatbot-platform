const env = require('../config/env');
const { getDatabaseStatus } = require('../config/database');

/**
 * Health and operational readiness status
 * GET /health and GET /api/v1/health
 */
function getHealth(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'ai-chatbot-backend',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    database: getDatabaseStatus(),
  });
}

module.exports = {
  getHealth,
};

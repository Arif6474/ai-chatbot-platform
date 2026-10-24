const env = require('../config/env');
const database = require('../config/database');

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
    database: database.getDatabaseStatus(),
  });
}

/**
 * Operational readiness check for load balancers / orchestrators (K8s, ECS, Render)
 * GET /health/ready and GET /api/v1/health/ready
 */
function getReadiness(req, res) {
  const dbStatus = database.getDatabaseStatus();
  const isReady = dbStatus === 'connected';
  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    service: 'ai-chatbot-backend',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
}

module.exports = {
  getHealth,
  getReadiness,
};

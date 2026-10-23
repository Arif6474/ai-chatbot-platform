const express = require('express');
const env = require('../config/env');
const { getDatabaseStatus } = require('../config/database');

const router = express.Router();

/**
 * @route   GET /health
 * @desc    API health and operational readiness status
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'ai-chatbot-backend',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    database: getDatabaseStatus(),
  });
});

module.exports = router;

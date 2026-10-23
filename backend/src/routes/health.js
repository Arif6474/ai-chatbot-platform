const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

/**
 * @route   GET /health
 * @desc    API health and operational readiness status
 * @access  Public
 */
router.get('/health', healthController.getHealth);

module.exports = router;

const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const adminAnalyticsController = require('../controllers/adminAnalyticsController');

const router = express.Router();

// Require admin authentication for all analytics routes
router.use(requireAdminAuth);

/**
 * @route   GET /api/v1/admin/analytics/usage
 * @desc    Get aggregated platform usage metrics, trends, and tenant breakdowns
 * @access  Admin only
 */
router.get('/usage', adminAnalyticsController.getPlatformUsage);

module.exports = router;

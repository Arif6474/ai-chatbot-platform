const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const adminAnalyticsController = require('../controllers/adminAnalyticsController');

const router = express.Router({ mergeParams: true });

// Require admin authentication for tenant-scoped usage routes
router.use(requireAdminAuth);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/usage
 * @desc    Get tenant-scoped usage metrics, fallback counts, and daily trends
 * @access  Admin only
 */
router.get('/', adminAnalyticsController.getTenantUsage);

module.exports = router;

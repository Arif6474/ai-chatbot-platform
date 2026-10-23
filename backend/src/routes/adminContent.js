const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const adminContentController = require('../controllers/adminContentController');

const router = express.Router({ mergeParams: true });

// Apply admin authentication to all content routes
router.use(requireAdminAuth);

// Apply CSRF origin validation to all state-changing endpoints
router.use(csrfProtection);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/content
 * @desc    List content records for a specific tenant
 * @access  Admin only
 */
router.get('/', adminContentController.listTenantContent);

/**
 * @route   POST /api/v1/admin/tenants/:tenantId/content
 * @desc    Create a content record for a specific tenant
 * @access  Admin only
 */
router.post('/', adminContentController.createTenantContent);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/content/:id
 * @desc    Retrieve a single content record for a specific tenant
 * @access  Admin only
 */
router.get('/:id', adminContentController.getTenantContentById);

/**
 * @route   PATCH /api/v1/admin/tenants/:tenantId/content/:id
 * @desc    Update a content record for a specific tenant
 * @access  Admin only
 */
router.patch('/:id', adminContentController.updateTenantContent);

/**
 * @route   PATCH /api/v1/admin/tenants/:tenantId/content/:id/status
 * @desc    Publish or unpublish a content record for a specific tenant
 * @access  Admin only
 */
router.patch('/:id/status', adminContentController.updateTenantContentStatus);

module.exports = router;

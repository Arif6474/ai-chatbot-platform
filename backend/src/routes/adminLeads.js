const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const adminLeadController = require('../controllers/adminLeadController');

const router = express.Router({ mergeParams: true });

// Apply admin authentication to all lead routes
router.use(requireAdminAuth);

// Apply CSRF origin validation to all state-changing mutation endpoints
router.use(csrfProtection);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/leads
 * @desc    List lead records for a specific tenant with pagination and filters
 * @access  Admin only
 */
router.get('/', adminLeadController.listTenantLeads);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/leads/:id
 * @desc    Retrieve a single lead record for a specific tenant
 * @access  Admin only
 */
router.get('/:id', adminLeadController.getTenantLeadById);

/**
 * @route   PATCH /api/v1/admin/tenants/:tenantId/leads/:id
 * @desc    Update allowed fields (status, notes, etc.) of a tenant's lead
 * @access  Admin only
 */
router.patch('/:id', adminLeadController.updateTenantLead);

/**
 * @route   PATCH /api/v1/admin/tenants/:tenantId/leads/:id/status
 * @desc    Update lead qualification/contact status
 * @access  Admin only
 */
router.patch('/:id/status', adminLeadController.updateTenantLeadStatus);

module.exports = router;

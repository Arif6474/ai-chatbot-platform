const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const adminTenantController = require('../controllers/adminTenantController');

const router = express.Router();

// Apply admin authentication to all tenant management endpoints
router.use(requireAdminAuth);

// Apply CSRF origin validation to all mutation endpoints
router.use(csrfProtection);

/**
 * @route   GET /api/v1/admin/tenants
 * @desc    List tenants with pagination, search, and status filtering
 * @access  Admin only
 */
router.get('/', adminTenantController.listTenants);

/**
 * @route   POST /api/v1/admin/tenants
 * @desc    Create a new business tenant
 * @access  Admin only
 */
router.post('/', adminTenantController.createTenant);

/**
 * @route   GET /api/v1/admin/tenants/:id
 * @desc    Retrieve tenant details by ID
 * @access  Admin only
 */
router.get('/:id', adminTenantController.getTenantById);

/**
 * @route   PATCH /api/v1/admin/tenants/:id
 * @desc    Update permitted tenant fields
 * @access  Admin only
 */
router.patch('/:id', adminTenantController.updateTenant);

/**
 * @route   PATCH /api/v1/admin/tenants/:id/status
 * @desc    Activate or deactivate a business tenant (auditable)
 * @access  Admin only
 */
router.patch('/:id/status', adminTenantController.updateTenantStatus);

module.exports = router;

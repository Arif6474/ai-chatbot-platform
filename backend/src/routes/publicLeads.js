const express = require('express');
const { publicLeadRateLimiter } = require('../middleware/rateLimiter');
const publicLeadController = require('../controllers/publicLeadController');

const router = express.Router();

// Apply public lead rate limiter to protect against automated spam abuse
router.use(publicLeadRateLimiter);

/**
 * @route   POST /api/v1/public/leads/:tenantSlug
 * @desc    Submit a prospective customer enquiry/lead for a business tenant
 * @access  Public
 */
router.post('/:tenantSlug', publicLeadController.submitLead);

module.exports = router;

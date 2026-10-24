const express = require('express');
const { publicChatRateLimiter, publicLeadRateLimiter } = require('../middleware/rateLimiter');
const publicChatController = require('../controllers/publicChatController');
const publicLeadController = require('../controllers/publicLeadController');

const router = express.Router();

/**
 * @route   GET /api/v1/public/chat/:tenantSlug/config
 * @desc    Get public presentation configuration for a tenant's chatbot
 * @access  Public
 */
router.get('/:tenantSlug/config', publicChatRateLimiter, publicChatController.getPublicConfiguration);

/**
 * @route   POST /api/v1/public/chat/:tenantSlug/message
 * @desc    Send a public user message to a business tenant's chatbot
 * @access  Public
 */
router.post('/:tenantSlug/message', publicChatRateLimiter, publicChatController.sendMessage);

/**
 * @route   POST /api/v1/public/chat/:tenantSlug/leads
 * @desc    Submit a lead/enquiry through the chatbot widget
 * @access  Public
 */
router.post('/:tenantSlug/leads', publicLeadRateLimiter, publicLeadController.submitLead);

module.exports = router;

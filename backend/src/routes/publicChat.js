const express = require('express');
const { publicChatRateLimiter } = require('../middleware/rateLimiter');
const publicChatController = require('../controllers/publicChatController');

const router = express.Router();

// Apply public rate limiter to abuse-protect chat completions
router.use(publicChatRateLimiter);

/**
 * @route   GET /api/v1/public/chat/:tenantSlug/config
 * @desc    Get public presentation configuration for a tenant's chatbot
 * @access  Public
 */
router.get('/:tenantSlug/config', publicChatController.getPublicConfiguration);

/**
 * @route   POST /api/v1/public/chat/:tenantSlug/message
 * @desc    Send a public user message to a business tenant's chatbot
 * @access  Public
 */
router.post('/:tenantSlug/message', publicChatController.sendMessage);

module.exports = router;

const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const controller = require('../controllers/adminChatbotConfigurationController');

const router = express.Router({ mergeParams: true });
router.use(requireAdminAuth);
router.use(csrfProtection);

router.get('/', controller.getConfiguration);
router.post('/', controller.createConfiguration);
router.patch('/', controller.updateConfiguration);
router.patch('/enabled', controller.updateEnabled);

module.exports = router;

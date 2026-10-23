const Tenant = require('../models/Tenant');
const ChatbotConfiguration = require('../models/ChatbotConfiguration');
const ChatSession = require('../models/ChatSession');
const { retrieveKnowledge } = require('../services/knowledgeRetrievalService');
const { buildGroundedPrompt } = require('../services/groundedPromptBuilder');
const { OllamaModelAdapter } = require('../services/ollamaModelAdapter');

const MAX_MESSAGE_LENGTH = 500;
const SESSION_TOKEN_REGEX = /^[0-9a-fA-F]{48}$/;

const sendError = (res, status, message, code) =>
  res.status(status).json({ success: false, error: { message, code } });

/**
 * Handle incoming user chat message for a tenant
 * POST /api/v1/public/chat/:tenantSlug/message
 */
async function sendMessage(req, res, next) {
  try {
    const { tenantSlug } = req.params;

    if (!tenantSlug || typeof tenantSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      return sendError(res, 400, 'Invalid tenant identifier', 'INVALID_TENANT_SLUG');
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendError(res, 400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
    }

    const allowedKeys = ['message', 'sessionToken'];
    const extraKeys = Object.keys(req.body).filter((k) => !allowedKeys.includes(k));
    if (extraKeys.length > 0) {
      return sendError(res, 400, `Unsupported field(s) provided: ${extraKeys.join(', ')}`, 'UNSUPPORTED_FIELD');
    }

    const { message, sessionToken } = req.body;

    if (typeof message !== 'string' || message.trim().length === 0) {
      return sendError(res, 400, 'Message cannot be empty', 'INVALID_MESSAGE');
    }

    if (message.trim().length > MAX_MESSAGE_LENGTH) {
      return sendError(
        res,
        400,
        `Message exceeds the maximum length of ${MAX_MESSAGE_LENGTH} characters`,
        'MESSAGE_TOO_LONG'
      );
    }

    // Resolve tenant by slug
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      return sendError(res, 404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }

    if (tenant.status !== 'active') {
      return sendError(res, 403, 'This business chatbot is currently inactive', 'TENANT_INACTIVE');
    }

    // Verify ChatbotConfiguration exists and is enabled
    const config = await ChatbotConfiguration.findOne({ tenantId: tenant._id });
    if (!config) {
      return sendError(res, 404, 'Chatbot configuration not found for this business', 'CHATBOT_NOT_CONFIGURED');
    }

    if (!config.enabled) {
      return sendError(res, 403, 'Chatbot service is currently disabled for this business', 'CHATBOT_DISABLED');
    }

    // Resolve or create session scoped to tenant
    let session;
    if (sessionToken !== undefined) {
      if (typeof sessionToken !== 'string' || !SESSION_TOKEN_REGEX.test(sessionToken)) {
        return sendError(res, 400, 'Invalid session token format', 'INVALID_SESSION_TOKEN');
      }

      session = await ChatSession.findOne({ tenantId: tenant._id, sessionToken });
      if (!session) {
        return sendError(res, 404, 'Session not found for this tenant', 'SESSION_NOT_FOUND');
      }
    } else {
      session = await ChatSession.create({
        tenantId: tenant._id,
      });
    }

    // Retrieve published knowledge for this tenant
    const knowledge = await retrieveKnowledge({
      tenantId: tenant._id.toString(),
      question: message.trim(),
    });

    // Build grounded prompt
    const { systemPrompt, userPrompt } = buildGroundedPrompt({
      question: message.trim(),
      knowledge,
    });

    // Invoke model adapter
    const adapter = req.modelAdapter || new OllamaModelAdapter();
    let modelResult;
    try {
      modelResult = await adapter.generate({ systemPrompt, userPrompt });
    } catch (modelError) {
      if (modelError.name === 'ModelAdapterError') {
        const fallbackText = config.fallbackMessage || 'I am currently unable to process your request. Please try again later or contact support.';
        // If model failed, we don't increment message count or leave session corrupted
        return res.status(200).json({
          success: true,
          data: {
            response: fallbackText,
            sessionToken: session.sessionToken,
            fallbackApplied: true,
          },
        });
      }
      throw modelError;
    }

    // Update session activity and message count atomically
    await ChatSession.updateOne(
      { _id: session._id },
      {
        $inc: { messageCount: 1 },
        $set: { lastActivityAt: new Date() },
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        response: modelResult.text,
        sessionToken: session.sessionToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve public chatbot configuration for a tenant
 * GET /api/v1/public/chat/:tenantSlug/config
 */
async function getPublicConfiguration(req, res, next) {
  try {
    const { tenantSlug } = req.params;

    if (!tenantSlug || typeof tenantSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      return sendError(res, 400, 'Invalid tenant identifier', 'INVALID_TENANT_SLUG');
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      return sendError(res, 404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }

    if (tenant.status !== 'active') {
      return sendError(res, 403, 'This business chatbot is currently inactive', 'TENANT_INACTIVE');
    }

    const config = await ChatbotConfiguration.findOne({ tenantId: tenant._id });
    if (!config) {
      return sendError(res, 404, 'Chatbot configuration not found for this business', 'CHATBOT_NOT_CONFIGURED');
    }

    // Return strictly public presentation fields only
    return res.status(200).json({
      success: true,
      data: {
        displayName: config.displayName,
        welcomeMessage: config.welcomeMessage,
        primaryColor: config.primaryColor,
        position: config.position,
        enabled: config.enabled,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  sendMessage,
  getPublicConfiguration,
  MAX_MESSAGE_LENGTH,
};

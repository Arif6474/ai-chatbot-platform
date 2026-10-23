const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const ChatbotConfiguration = require('../models/ChatbotConfiguration');

const CONFIG_FIELDS = ['displayName', 'welcomeMessage', 'primaryColor', 'position', 'enabled', 'fallbackMessage'];
const sendError = (res, status, message, code) => res.status(status).json({ success: false, error: { message, code } });

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

async function findTenant(tenantId, res) {
  if (!isValidObjectId(tenantId)) {
    sendError(res, 400, 'Invalid tenant ID format', 'INVALID_ID');
    return null;
  }
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    sendError(res, 404, 'Tenant not found', 'TENANT_NOT_FOUND');
    return null;
  }
  return tenant;
}

function validateFields(body, allowedFields, requireOne) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const unsupported = Object.keys(body).filter((field) => !allowedFields.includes(field));
  if (unsupported.length) return `Unsupported field(s) provided: ${unsupported.join(', ')}`;
  if (requireOne && Object.keys(body).length === 0) return 'At least one field must be provided for update';
  return null;
}

function validateValues(body) {
  for (const field of ['displayName', 'welcomeMessage']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].trim().length < 2 || body[field].trim().length > (field === 'displayName' ? 80 : 500))) {
      return `${field === 'displayName' ? 'Display name' : 'Welcome message'} must be between 2 and ${field === 'displayName' ? 80 : 500} characters`;
    }
  }
  if (body.primaryColor !== undefined && (typeof body.primaryColor !== 'string' || !ChatbotConfiguration.HEX_COLOR.test(body.primaryColor.trim()))) return 'Primary color must be a six-digit hexadecimal color';
  if (body.position !== undefined && !ChatbotConfiguration.POSITIONS.includes(body.position)) return `Position must be one of: ${ChatbotConfiguration.POSITIONS.join(', ')}`;
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return 'Enabled must be a boolean';
  if (body.fallbackMessage !== undefined && body.fallbackMessage !== null && (typeof body.fallbackMessage !== 'string' || (body.fallbackMessage.trim() !== '' && (body.fallbackMessage.trim().length < 2 || body.fallbackMessage.trim().length > 500)))) return 'Fallback message must be between 2 and 500 characters when provided';
  return null;
}

function normalizedValues(body) {
  const values = {};
  if (body.displayName !== undefined) values.displayName = body.displayName.trim();
  if (body.welcomeMessage !== undefined) values.welcomeMessage = body.welcomeMessage.trim();
  if (body.primaryColor !== undefined) values.primaryColor = body.primaryColor.trim().toLowerCase();
  if (body.position !== undefined) values.position = body.position;
  if (body.enabled !== undefined) values.enabled = body.enabled;
  if (body.fallbackMessage !== undefined) values.fallbackMessage = body.fallbackMessage === null || body.fallbackMessage.trim() === '' ? null : body.fallbackMessage.trim();
  return values;
}

async function getConfiguration(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const configuration = await ChatbotConfiguration.findOne({ tenantId: tenant._id });
    if (!configuration) return sendError(res, 404, 'Chatbot configuration not found for this tenant', 'CONFIG_NOT_FOUND');
    return res.json({ success: true, data: { configuration } });
  } catch (error) { next(error); }
}

async function createConfiguration(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, CONFIG_FIELDS, false);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    const valueError = validateValues(req.body);
    if (valueError) return sendError(res, 400, valueError, 'VALIDATION_ERROR');
    const configuration = await ChatbotConfiguration.create({ tenantId: tenant._id, ...normalizedValues(req.body) });
    return res.status(201).json({ success: true, data: { configuration } });
  } catch (error) {
    if (error?.code === 11000) return sendError(res, 409, 'A chatbot configuration already exists for this tenant', 'CONFIG_CONFLICT');
    next(error);
  }
}

async function updateConfiguration(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, CONFIG_FIELDS, true);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    const valueError = validateValues(req.body);
    if (valueError) return sendError(res, 400, valueError, 'VALIDATION_ERROR');
    const configuration = await ChatbotConfiguration.findOne({ tenantId: tenant._id });
    if (!configuration) return sendError(res, 404, 'Chatbot configuration not found for this tenant', 'CONFIG_NOT_FOUND');
    Object.assign(configuration, normalizedValues(req.body));
    await configuration.save();
    return res.json({ success: true, data: { configuration } });
  } catch (error) { next(error); }
}

async function updateEnabled(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, ['enabled'], false);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    if (typeof req.body.enabled !== 'boolean') return sendError(res, 400, 'Enabled must be a boolean', 'VALIDATION_ERROR');
    const configuration = await ChatbotConfiguration.findOne({ tenantId: tenant._id });
    if (!configuration) return sendError(res, 404, 'Chatbot configuration not found for this tenant', 'CONFIG_NOT_FOUND');
    configuration.enabled = req.body.enabled;
    await configuration.save();
    return res.json({ success: true, data: { configuration } });
  } catch (error) { next(error); }
}

module.exports = { getConfiguration, createConfiguration, updateConfiguration, updateEnabled };

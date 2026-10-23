const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const BusinessContent = require('../models/BusinessContent');

const CONTENT_FIELDS = ['title', 'body', 'status'];
const sendError = (res, status, message, code) => res.status(status).json({ success: false, error: { message, code } });

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function validateFields(body, allowed, requireOne) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const unsupported = Object.keys(body).filter((field) => !allowed.includes(field));
  if (unsupported.length) return `Unsupported field(s) provided: ${unsupported.join(', ')}`;
  if (requireOne && Object.keys(body).length === 0) return 'At least one field must be provided for update';
  return null;
}

function validateValues(body, creating) {
  if (creating && (!Object.hasOwn(body, 'title') || !Object.hasOwn(body, 'body'))) return 'Content title and body are required';
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 150)) return 'Content title must be between 2 and 150 characters';
  if (body.body !== undefined && (typeof body.body !== 'string' || body.body.trim().length < 5 || body.body.trim().length > 10000)) return 'Content body must be between 5 and 10000 characters';
  if (body.status !== undefined && !BusinessContent.CONTENT_STATUSES.includes(body.status)) return `Status must be one of: ${BusinessContent.CONTENT_STATUSES.join(', ')}`;
  return null;
}

async function findScopedContent(tenant, id, res) {
  if (!isValidObjectId(id)) {
    sendError(res, 400, 'Invalid content ID format', 'INVALID_ID');
    return null;
  }
  const content = await BusinessContent.findOne({ _id: id, tenantId: tenant._id });
  if (!content) {
    sendError(res, 404, 'Content record not found for this tenant', 'CONTENT_NOT_FOUND');
    return null;
  }
  return content;
}

async function listTenantContent(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const { page: rawPage = '1', limit: rawLimit = '10', search, status } = req.query;
    if (!/^\d+$/.test(String(rawPage)) || Number(rawPage) < 1) return sendError(res, 400, 'Query parameter "page" must be a positive integer', 'INVALID_QUERY');
    if (!/^\d+$/.test(String(rawLimit)) || Number(rawLimit) < 1 || Number(rawLimit) > 100) return sendError(res, 400, 'Query parameter "limit" must be an integer between 1 and 100', 'INVALID_QUERY');
    if (status !== undefined && !BusinessContent.CONTENT_STATUSES.includes(status)) return sendError(res, 400, `Invalid status filter. Allowed values: ${BusinessContent.CONTENT_STATUSES.join(', ')}`, 'INVALID_QUERY');
    if (search !== undefined && typeof search !== 'string') return sendError(res, 400, 'Query parameter "search" must be a string', 'INVALID_QUERY');

    const page = Number(rawPage);
    const limit = Number(rawLimit);
    const query = { tenantId: tenant._id, ...(status ? { status } : {}) };
    if (search?.trim()) {
      const expression = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ title: expression }, { body: expression }];
    }
    const [total, contents] = await Promise.all([
      BusinessContent.countDocuments(query),
      BusinessContent.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);
    return res.json({ success: true, data: { contents, pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 } } });
  } catch (error) { next(error); }
}

async function createTenantContent(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, CONTENT_FIELDS, false);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    const valueError = validateValues(req.body, true);
    if (valueError) return sendError(res, 400, valueError, 'VALIDATION_ERROR');
    const content = await BusinessContent.create({ tenantId: tenant._id, title: req.body.title.trim(), body: req.body.body.trim(), status: req.body.status || 'draft' });
    return res.status(201).json({ success: true, data: { content } });
  } catch (error) { next(error); }
}

async function getTenantContentById(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const content = await findScopedContent(tenant, req.params.id, res);
    if (!content) return;
    return res.json({ success: true, data: { content } });
  } catch (error) { next(error); }
}

async function updateTenantContent(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, CONTENT_FIELDS, true);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    const valueError = validateValues(req.body, false);
    if (valueError) return sendError(res, 400, valueError, 'VALIDATION_ERROR');
    const content = await findScopedContent(tenant, req.params.id, res);
    if (!content) return;
    if (req.body.title !== undefined) content.title = req.body.title.trim();
    if (req.body.body !== undefined) content.body = req.body.body.trim();
    if (req.body.status !== undefined) content.status = req.body.status;
    await content.save();
    return res.json({ success: true, data: { content } });
  } catch (error) { next(error); }
}

async function updateTenantContentStatus(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;
    const fieldError = validateFields(req.body, ['status'], false);
    if (fieldError) return sendError(res, 400, fieldError, fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR');
    const valueError = validateValues(req.body, false);
    if (valueError || req.body.status === undefined) return sendError(res, 400, valueError || 'Status is required', 'VALIDATION_ERROR');
    const content = await findScopedContent(tenant, req.params.id, res);
    if (!content) return;
    content.status = req.body.status;
    await content.save();
    return res.json({ success: true, data: { content } });
  } catch (error) { next(error); }
}

module.exports = { listTenantContent, createTenantContent, getTenantContentById, updateTenantContent, updateTenantContentStatus };

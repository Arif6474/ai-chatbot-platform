const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Lead = require('../models/Lead');

const ALLOWED_ADMIN_UPDATE_FIELDS = ['status', 'notes', 'name', 'email', 'phone', 'message'];
const sendError = (res, status, message, code) =>
  res.status(status).json({ success: false, error: { message, code } });

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  const unsupported = Object.keys(body).filter((field) => !allowed.includes(field));
  if (unsupported.length > 0) {
    return `Unsupported field(s) provided: ${unsupported.join(', ')}`;
  }
  if (requireOne && Object.keys(body).length === 0) {
    return 'At least one field must be provided for update';
  }
  return null;
}

async function findScopedLead(tenant, leadId, res) {
  if (!isValidObjectId(leadId)) {
    sendError(res, 400, 'Invalid lead ID format', 'INVALID_ID');
    return null;
  }
  const lead = await Lead.findOne({ _id: leadId, tenantId: tenant._id });
  if (!lead) {
    sendError(res, 404, 'Lead record not found for this tenant', 'LEAD_NOT_FOUND');
    return null;
  }
  return lead;
}

/**
 * List leads for a specific tenant
 * GET /api/v1/admin/tenants/:tenantId/leads
 */
async function listTenantLeads(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;

    const allowedParams = ['page', 'limit', 'search', 'status', 'source'];
    const unsupportedParams = Object.keys(req.query).filter((k) => !allowedParams.includes(k));
    if (unsupportedParams.length > 0) {
      return sendError(res, 400, `Unsupported query parameter(s): ${unsupportedParams.join(', ')}`, 'INVALID_QUERY');
    }

    const { page: rawPage = '1', limit: rawLimit = '10', search, status, source } = req.query;

    if (!/^\d+$/.test(String(rawPage)) || Number(rawPage) < 1) {
      return sendError(res, 400, 'Query parameter "page" must be a positive integer', 'INVALID_QUERY');
    }
    if (!/^\d+$/.test(String(rawLimit)) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
      return sendError(res, 400, 'Query parameter "limit" must be an integer between 1 and 100', 'INVALID_QUERY');
    }
    if (status !== undefined && !Lead.LEAD_STATUSES.includes(status)) {
      return sendError(
        res,
        400,
        `Invalid status filter. Allowed values: ${Lead.LEAD_STATUSES.join(', ')}`,
        'INVALID_QUERY'
      );
    }
    if (source !== undefined && !Lead.LEAD_SOURCES.includes(source)) {
      return sendError(
        res,
        400,
        `Invalid source filter. Allowed values: ${Lead.LEAD_SOURCES.join(', ')}`,
        'INVALID_QUERY'
      );
    }
    if (search !== undefined && (typeof search !== 'string' || search.trim().length > 100)) {
      return sendError(res, 400, 'Query parameter "search" must be a string of at most 100 characters', 'INVALID_QUERY');
    }

    const page = Number(rawPage);
    const limit = Number(rawLimit);
    const query = { tenantId: tenant._id };

    if (status) {
      query.status = status;
    }
    if (source) {
      query.source = source;
    }
    if (search?.trim()) {
      const expression = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ name: expression }, { email: expression }, { phone: expression }, { message: expression }];
    }

    const [total, leads] = await Promise.all([
      Lead.countDocuments(query),
      Lead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ]);

    return res.json({
      success: true,
      data: {
        leads,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve a single lead for a specific tenant
 * GET /api/v1/admin/tenants/:tenantId/leads/:id
 */
async function getTenantLeadById(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;

    const lead = await findScopedLead(tenant, req.params.id, res);
    if (!lead) return;

    return res.json({
      success: true,
      data: { lead },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update allowed fields of a lead (status, notes, etc.)
 * PATCH /api/v1/admin/tenants/:tenantId/leads/:id
 */
async function updateTenantLead(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;

    const fieldError = validateFields(req.body, ALLOWED_ADMIN_UPDATE_FIELDS, true);
    if (fieldError) {
      return sendError(
        res,
        400,
        fieldError,
        fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR'
      );
    }

    const lead = await findScopedLead(tenant, req.params.id, res);
    if (!lead) return;

    if (req.body.status !== undefined) {
      if (!Lead.LEAD_STATUSES.includes(req.body.status)) {
        return sendError(
          res,
          400,
          `Status must be one of: ${Lead.LEAD_STATUSES.join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      lead.status = req.body.status;
    }

    if (req.body.notes !== undefined) {
      if (typeof req.body.notes !== 'string' || req.body.notes.length > 2000) {
        return sendError(res, 400, 'Notes cannot exceed 2000 characters', 'VALIDATION_ERROR');
      }
      lead.notes = req.body.notes.trim() || null;
    }

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.trim().length > 100) {
        return sendError(res, 400, 'Name must be between 2 and 100 characters', 'VALIDATION_ERROR');
      }
      lead.name = req.body.name.trim();
    }

    if (req.body.email !== undefined) {
      if (req.body.email && (typeof req.body.email !== 'string' || req.body.email.trim().length > 255 || !Lead.EMAIL_REGEX.test(req.body.email.trim()))) {
        return sendError(res, 400, 'Please provide a valid email address (max 255 characters)', 'VALIDATION_ERROR');
      }
      lead.email = req.body.email ? req.body.email.trim().toLowerCase() : null;
    }

    if (req.body.phone !== undefined) {
      if (req.body.phone && (typeof req.body.phone !== 'string' || req.body.phone.trim().length < 5 || req.body.phone.trim().length > 30 || !Lead.PHONE_REGEX.test(req.body.phone.trim()))) {
        return sendError(res, 400, 'Please provide a valid phone number (5 to 30 characters)', 'VALIDATION_ERROR');
      }
      lead.phone = req.body.phone ? req.body.phone.trim() : null;
    }

    if (req.body.message !== undefined) {
      if (req.body.message && (typeof req.body.message !== 'string' || req.body.message.length > 1000)) {
        return sendError(res, 400, 'Message cannot exceed 1000 characters', 'VALIDATION_ERROR');
      }
      lead.message = req.body.message ? req.body.message.trim() : null;
    }

    // Ensure at least one contact method remains
    if (!lead.email && !lead.phone) {
      return sendError(res, 400, 'At least one contact method (email or phone) must be retained', 'VALIDATION_ERROR');
    }

    await lead.save();

    return res.json({
      success: true,
      data: { lead },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dedicated status updater for a lead
 * PATCH /api/v1/admin/tenants/:tenantId/leads/:id/status
 */
async function updateTenantLeadStatus(req, res, next) {
  try {
    const tenant = await findTenant(req.params.tenantId, res);
    if (!tenant) return;

    const fieldError = validateFields(req.body, ['status'], false);
    if (fieldError) {
      return sendError(
        res,
        400,
        fieldError,
        fieldError.startsWith('Unsupported') ? 'UNSUPPORTED_FIELD' : 'VALIDATION_ERROR'
      );
    }

    if (!req.body.status || !Lead.LEAD_STATUSES.includes(req.body.status)) {
      return sendError(
        res,
        400,
        `Status must be one of: ${Lead.LEAD_STATUSES.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    const lead = await findScopedLead(tenant, req.params.id, res);
    if (!lead) return;

    lead.status = req.body.status;
    await lead.save();

    return res.json({
      success: true,
      data: { lead },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listTenantLeads,
  getTenantLeadById,
  updateTenantLead,
  updateTenantLeadStatus,
  ALLOWED_ADMIN_UPDATE_FIELDS,
};

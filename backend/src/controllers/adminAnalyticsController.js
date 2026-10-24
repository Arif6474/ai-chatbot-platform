const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const {
  getPlatformUsageSummary,
  getTenantUsageSummary,
} = require('../services/usageTrackingService');

const sendError = (res, status, message, code) =>
  res.status(status).json({ success: false, error: { message, code } });

function isValidObjectId(id) {
  return (
    typeof id === 'string' &&
    mongoose.Types.ObjectId.isValid(id) &&
    new mongoose.Types.ObjectId(id).toString() === id
  );
}

const ALLOWED_QUERY_PARAMS = ['period', 'startDate', 'endDate'];

function validateQueryParams(query) {
  const extraKeys = Object.keys(query).filter((k) => !ALLOWED_QUERY_PARAMS.includes(k));
  if (extraKeys.length > 0) {
    const error = new Error(`Unsupported query parameter(s): ${extraKeys.join(', ')}`);
    error.code = 'UNSUPPORTED_PARAMETER';
    throw error;
  }

  for (const key of ['period', 'startDate', 'endDate']) {
    if (query[key] !== undefined) {
      if (typeof query[key] !== 'string' || query[key].length > 10) {
        const error = new Error(`Query parameter '${key}' must be a string up to 10 characters`);
        error.code = 'INVALID_PARAMETER';
        throw error;
      }
    }
  }
}

/**
 * Retrieve platform-wide usage metrics and tenant breakdown
 * GET /api/v1/admin/analytics/usage
 */
async function getPlatformUsage(req, res, next) {
  try {
    validateQueryParams(req.query);
    const { period, startDate, endDate } = req.query;
    const summary = await getPlatformUsageSummary({ period, startDate, endDate });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    if (['INVALID_DATE', 'INVALID_DATE_RANGE', 'INVALID_PERIOD', 'UNSUPPORTED_PARAMETER', 'INVALID_PARAMETER'].includes(error.code)) {
      return sendError(res, 400, error.message, error.code);
    }
    next(error);
  }
}

/**
 * Retrieve tenant-specific usage metrics and daily trends
 * GET /api/v1/admin/tenants/:tenantId/usage
 */
async function getTenantUsage(req, res, next) {
  try {
    const { tenantId } = req.params;

    if (!isValidObjectId(tenantId)) {
      return sendError(res, 400, 'Invalid tenant ID format', 'INVALID_ID');
    }

    validateQueryParams(req.query);

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return sendError(res, 404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }

    const { period, startDate, endDate } = req.query;
    const summary = await getTenantUsageSummary(tenant._id, { period, startDate, endDate });

    return res.status(200).json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        },
        ...summary,
      },
    });
  } catch (error) {
    if (['INVALID_DATE', 'INVALID_DATE_RANGE', 'INVALID_PERIOD', 'UNSUPPORTED_PARAMETER', 'INVALID_PARAMETER'].includes(error.code)) {
      return sendError(res, 400, error.message, error.code);
    }
    next(error);
  }
}

module.exports = {
  getPlatformUsage,
  getTenantUsage,
};


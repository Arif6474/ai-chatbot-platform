const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

// Allowed fields for creation and updates to prevent mass assignment
const ALLOWED_CREATE_FIELDS = ['name', 'slug', 'status', 'contactEmail', 'websiteUrl', 'businessType'];
const ALLOWED_UPDATE_FIELDS = ['name', 'slug', 'contactEmail', 'websiteUrl', 'businessType'];

/**
 * Helper to escape special regex characters for safe search queries
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates MongoDB ObjectId format
 */
function isValidObjectId(id) {
  if (typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

/**
 * List tenants with pagination, search, and status filtering
 * GET /api/v1/admin/tenants
 */
async function listTenants(req, res, next) {
  try {
    const allowedQueryParams = ['page', 'limit', 'search', 'status'];
    const unsupportedParams = Object.keys(req.query).filter((k) => !allowedQueryParams.includes(k));
    if (unsupportedParams.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Unsupported query parameter(s): ${unsupportedParams.join(', ')}`,
          code: 'INVALID_QUERY',
        },
      });
    }

    const { page: rawPage = 1, limit: rawLimit = 10, search, status } = req.query;

    const page = parseInt(rawPage, 10);
    const limit = parseInt(rawLimit, 10);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Query parameter "page" must be a positive integer',
          code: 'INVALID_QUERY',
        },
      });
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Query parameter "limit" must be an integer between 1 and 100',
          code: 'INVALID_QUERY',
        },
      });
    }

    if (search !== undefined && (typeof search !== 'string' || search.trim().length > 100)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Query parameter "search" must be a string of at most 100 characters',
          code: 'INVALID_QUERY',
        },
      });
    }

    const query = {};

    if (status !== undefined && status !== '') {
      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Query parameter "status" must be either "active" or "inactive"',
            code: 'INVALID_QUERY',
          },
        });
      }
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const sanitized = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { slug: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const total = await Tenant.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;

    const tenants = await Tenant.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: {
        tenants,
        pagination: {
          total,
          page,
          limit,
          pages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new business tenant
 * POST /api/v1/admin/tenants
 */
async function createTenant(req, res, next) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request body must be a JSON object',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Rejection of unsupported fields (mass assignment prevention)
    const extraFields = Object.keys(req.body).filter(
      (key) => !ALLOWED_CREATE_FIELDS.includes(key)
    );
    if (extraFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Unsupported field(s) provided: ${extraFields.join(', ')}`,
          code: 'UNSUPPORTED_FIELD',
        },
      });
    }

    const { name, slug, status, contactEmail, websiteUrl, businessType } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Tenant name is required and must be at least 2 characters',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Tenant name cannot exceed 100 characters',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Determine and normalize slug
    let normalizedSlug = '';
    if (slug !== undefined && slug !== null && slug !== '') {
      if (typeof slug !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Slug must be a string',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      normalizedSlug = Tenant.normalizeSlug(slug);
    } else {
      normalizedSlug = Tenant.normalizeSlug(name);
    }

    if (!normalizedSlug || normalizedSlug.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Slug must be at least 2 alphanumeric characters',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    if (normalizedSlug.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Slug cannot exceed 100 characters',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Slug must consist of lowercase alphanumeric characters separated by single hyphens',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Check slug uniqueness
    const existing = await Tenant.findOne({ slug: normalizedSlug });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A tenant with this slug already exists',
          code: 'SLUG_CONFLICT',
        },
      });
    }

    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Status must be either "active" or "inactive"',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    if (contactEmail && typeof contactEmail === 'string' && contactEmail.trim() !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Please enter a valid contact email address',
            code: 'VALIDATION_ERROR',
          },
        });
      }
    }

    if (websiteUrl && typeof websiteUrl === 'string' && websiteUrl.trim() !== '') {
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(websiteUrl.trim())) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Website URL must be a valid HTTP or HTTPS URL',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      if (websiteUrl.trim().length > 255) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Website URL cannot exceed 255 characters',
            code: 'VALIDATION_ERROR',
          },
        });
      }
    }

    if (businessType && typeof businessType === 'string' && businessType.trim().length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Business type cannot exceed 50 characters',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const tenant = await Tenant.create({
      name: name.trim(),
      slug: normalizedSlug,
      status: status || 'active',
      contactEmail: contactEmail ? contactEmail.trim().toLowerCase() : null,
      websiteUrl: websiteUrl ? websiteUrl.trim() : null,
      businessType: businessType ? businessType.trim() : null,
    });

    return res.status(201).json({
      success: true,
      data: {
        tenant,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A tenant with this slug already exists',
          code: 'SLUG_CONFLICT',
        },
      });
    }
    next(error);
  }
}

/**
 * Retrieve tenant details by ID
 * GET /api/v1/admin/tenants/:id
 */
async function getTenantById(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid tenant ID format',
          code: 'INVALID_ID',
        },
      });
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        tenant,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update permitted tenant fields
 * PATCH /api/v1/admin/tenants/:id
 */
async function updateTenant(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid tenant ID format',
          code: 'INVALID_ID',
        },
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request body must be a JSON object',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Rejection of unsupported fields (reject mass assignment / status on this endpoint)
    const bodyKeys = Object.keys(req.body);
    const extraFields = bodyKeys.filter((key) => !ALLOWED_UPDATE_FIELDS.includes(key));
    if (extraFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Unsupported field(s) provided: ${extraFields.join(', ')}`,
          code: 'UNSUPPORTED_FIELD',
        },
      });
    }

    if (bodyKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'At least one permitted field must be provided for update',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
        },
      });
    }

    const { name, slug, contactEmail, websiteUrl, businessType } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Tenant name must be at least 2 characters',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Tenant name cannot exceed 100 characters',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      tenant.name = name.trim();
    }

    if (slug !== undefined) {
      if (typeof slug !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Slug must be a string',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      const normalizedSlug = Tenant.normalizeSlug(slug);
      if (!normalizedSlug || normalizedSlug.length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Slug must be at least 2 alphanumeric characters',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      if (normalizedSlug.length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Slug cannot exceed 100 characters',
            code: 'VALIDATION_ERROR',
          },
        });
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Slug must consist of lowercase alphanumeric characters separated by single hyphens',
            code: 'VALIDATION_ERROR',
          },
        });
      }

      if (normalizedSlug !== tenant.slug) {
        const existing = await Tenant.findOne({ slug: normalizedSlug, _id: { $ne: tenant._id } });
        if (existing) {
          return res.status(409).json({
            success: false,
            error: {
              message: 'A tenant with this slug already exists',
              code: 'SLUG_CONFLICT',
            },
          });
        }
        tenant.slug = normalizedSlug;
      }
    }

    if (contactEmail !== undefined) {
      if (contactEmail === null || contactEmail === '') {
        tenant.contactEmail = null;
      } else if (typeof contactEmail === 'string') {
        const trimmed = contactEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Please enter a valid contact email address',
              code: 'VALIDATION_ERROR',
            },
          });
        }
        tenant.contactEmail = trimmed.toLowerCase();
      } else {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Contact email must be a string or null',
            code: 'VALIDATION_ERROR',
          },
        });
      }
    }

    if (websiteUrl !== undefined) {
      if (websiteUrl === null || websiteUrl === '') {
        tenant.websiteUrl = null;
      } else if (typeof websiteUrl === 'string') {
        const trimmed = websiteUrl.trim();
        if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Website URL must be a valid HTTP or HTTPS URL',
              code: 'VALIDATION_ERROR',
            },
          });
        }
        if (trimmed.length > 255) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Website URL cannot exceed 255 characters',
              code: 'VALIDATION_ERROR',
            },
          });
        }
        tenant.websiteUrl = trimmed;
      } else {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Website URL must be a string or null',
            code: 'VALIDATION_ERROR',
          },
        });
      }
    }

    if (businessType !== undefined) {
      if (businessType === null || businessType === '') {
        tenant.businessType = null;
      } else if (typeof businessType === 'string') {
        const trimmed = businessType.trim();
        if (trimmed.length > 50) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Business type cannot exceed 50 characters',
              code: 'VALIDATION_ERROR',
            },
          });
        }
        tenant.businessType = trimmed;
      } else {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Business type must be a string or null',
            code: 'VALIDATION_ERROR',
          },
        });
      }
    }

    await tenant.save();

    return res.status(200).json({
      success: true,
      data: {
        tenant,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A tenant with this slug already exists',
          code: 'SLUG_CONFLICT',
        },
      });
    }
    next(error);
  }
}

/**
 * Activate or deactivate a business tenant (auditable)
 * PATCH /api/v1/admin/tenants/:id/status
 */
async function updateTenantStatus(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid tenant ID format',
          code: 'INVALID_ID',
        },
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Request body must be a JSON object',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const bodyKeys = Object.keys(req.body);
    const extraFields = bodyKeys.filter((key) => key !== 'status');
    if (extraFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Unsupported field(s) provided: ${extraFields.join(', ')}`,
          code: 'UNSUPPORTED_FIELD',
        },
      });
    }

    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Status must be strictly "active" or "inactive"',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
        },
      });
    }

    const previousStatus = tenant.status;
    tenant.status = status;
    await tenant.save();

    // Audit logging: Explicit and auditable status change log without sensitive data
    console.log(
      `[AUDIT] Tenant status updated: tenantId=${tenant._id}, slug=${tenant.slug}, previousStatus=${previousStatus}, newStatus=${status}, updatedByAdminId=${req.admin?._id || 'unknown'}`
    );

    return res.status(200).json({
      success: true,
      data: {
        tenant,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listTenants,
  createTenant,
  getTenantById,
  updateTenant,
  updateTenantStatus,
};

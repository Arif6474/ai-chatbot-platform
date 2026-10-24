const Tenant = require('../models/Tenant');
const Lead = require('../models/Lead');

const ALLOWED_PUBLIC_LEAD_FIELDS = ['name', 'email', 'phone', 'message', 'website', 'honeypot'];
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 100;
const MIN_NAME_LENGTH = 2;

const sendError = (res, status, message, code) =>
  res.status(status).json({ success: false, error: { message, code } });

/**
 * Public Lead Submission Handler
 * POST /api/v1/public/chat/:tenantSlug/leads
 * POST /api/v1/public/leads/:tenantSlug
 */
async function submitLead(req, res, next) {
  try {
    const { tenantSlug } = req.params;

    if (!tenantSlug || typeof tenantSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      return sendError(res, 400, 'Invalid tenant identifier', 'INVALID_TENANT_SLUG');
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendError(res, 400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
    }

    // Strict allowlist: reject any unrecognized or privileged fields
    const unsupportedKeys = Object.keys(req.body).filter((k) => !ALLOWED_PUBLIC_LEAD_FIELDS.includes(k));
    if (unsupportedKeys.length > 0) {
      return sendError(res, 400, `Unsupported field(s) provided: ${unsupportedKeys.join(', ')}`, 'UNSUPPORTED_FIELD');
    }

    // Automated spam honeypot check:
    // If a bot filled out the hidden website or honeypot field, silently accept without persisting
    const honeypotTriggered = Boolean(
      (req.body.website && String(req.body.website).trim().length > 0) ||
      (req.body.honeypot && String(req.body.honeypot).trim().length > 0)
    );

    if (honeypotTriggered) {
      // Return synthetic success without touching the database or logging details
      return res.status(201).json({
        success: true,
        data: {
          lead: {
            id: 'lead_ack',
            name: typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 50) : 'Lead',
            status: 'new',
            createdAt: new Date().toISOString(),
          },
        },
      });
    }

    // Resolve tenant strictly by slug from the URL — never trust client-supplied tenant IDs
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      return sendError(res, 404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }

    if (tenant.status !== 'active') {
      return sendError(res, 403, 'This business is currently inactive and cannot accept enquiries', 'TENANT_INACTIVE');
    }

    const { name, email, phone, message } = req.body;

    // Validate name
    if (typeof name !== 'string' || name.trim().length < MIN_NAME_LENGTH || name.trim().length > MAX_NAME_LENGTH) {
      return sendError(
        res,
        400,
        `Name is required and must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters`,
        'VALIDATION_ERROR'
      );
    }

    // Check contact methods
    const trimmedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    const trimmedPhone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;

    if (!trimmedEmail && !trimmedPhone) {
      return sendError(res, 400, 'Either email or phone must be provided', 'VALIDATION_ERROR');
    }

    // Validate email if present
    if (trimmedEmail) {
      if (trimmedEmail.length > 255 || !Lead.EMAIL_REGEX.test(trimmedEmail)) {
        return sendError(res, 400, 'Please provide a valid email address', 'VALIDATION_ERROR');
      }
    }

    // Validate phone if present
    if (trimmedPhone) {
      if (trimmedPhone.length < 5 || trimmedPhone.length > 30 || !Lead.PHONE_REGEX.test(trimmedPhone)) {
        return sendError(res, 400, 'Please provide a valid phone number (5 to 30 characters)', 'VALIDATION_ERROR');
      }
    }

    // Validate message if present
    let trimmedMessage = null;
    if (message !== undefined && message !== null) {
      if (typeof message !== 'string') {
        return sendError(res, 400, 'Message must be a string', 'VALIDATION_ERROR');
      }
      if (message.trim().length > MAX_MESSAGE_LENGTH) {
        return sendError(
          res,
          400,
          `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
          'VALIDATION_ERROR'
        );
      }
      trimmedMessage = message.trim() || null;
    }

    // Derive source automatically from route mount — public clients cannot dictate lead origin
    const leadSource = req.baseUrl && req.baseUrl.includes('/chat') ? 'widget' : 'contact_form';

    // Create lead scoped to the verified tenant
    const lead = await Lead.create({
      tenantId: tenant._id,
      name: name.trim(),
      email: trimmedEmail,
      phone: trimmedPhone,
      message: trimmedMessage,
      source: leadSource,
      status: 'new',
    });

    // Return safe, predictable response without exposing internal IDs, tenant details, or unnecessary fields
    return res.status(201).json({
      success: true,
      data: {
        lead: {
          id: lead.id,
          name: lead.name,
          status: lead.status,
          createdAt: lead.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitLead,
  ALLOWED_PUBLIC_LEAD_FIELDS,
};

const mongoose = require('mongoose');

/**
 * Normalizes a raw string into a valid, URL-friendly slug.
 * - Converts to lowercase
 * - Trims whitespace
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Strips leading and trailing hyphens
 *
 * @param {string} str
 * @returns {string}
 */
function normalizeSlug(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      minlength: [2, 'Tenant name must be at least 2 characters'],
      maxlength: [100, 'Tenant name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Tenant slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must consist of lowercase alphanumeric characters separated by single hyphens',
      ],
      minlength: [2, 'Tenant slug must be at least 2 characters'],
      maxlength: [100, 'Tenant slug cannot exceed 100 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status must be either "active" or "inactive"',
      },
      default: 'active',
      index: true,
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Please enter a valid contact email address',
      },
    },
    websiteUrl: {
      type: String,
      trim: true,
      default: null,
      maxlength: [255, 'Website URL cannot exceed 255 characters'],
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
        },
        message: 'Website URL must be a valid HTTP or HTTPS URL',
      },
    },
    businessType: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Business type cannot exceed 50 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for sorted listings by creation date
tenantSchema.index({ createdAt: -1 });
tenantSchema.index({ status: 1, createdAt: -1 });

/**
 * Pre-validation hook:
 * - Normalize slug or auto-derive slug from name if slug not provided
 * - Normalize empty strings to null for optional fields
 */
tenantSchema.pre('validate', function (next) {
  if (this.slug) {
    this.slug = normalizeSlug(this.slug);
  } else if (this.name) {
    this.slug = normalizeSlug(this.name);
  }

  if (this.contactEmail === '') {
    this.contactEmail = null;
  }
  if (this.websiteUrl === '') {
    this.websiteUrl = null;
  }
  if (this.businessType === '') {
    this.businessType = null;
  }

  next();
});

/**
 * Expose slug normalization utility on the model
 */
tenantSchema.statics.normalizeSlug = normalizeSlug;

/**
 * Clean JSON representation (exclude internal database fields like __v)
 */
tenantSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Tenant', tenantSchema);

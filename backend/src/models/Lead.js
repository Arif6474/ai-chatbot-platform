const mongoose = require('mongoose');

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed'];
const LEAD_SOURCES = ['chatbot', 'widget', 'contact_form', 'manual'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s+\-().]{5,30}$/;

const leadSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      maxlength: [255, 'Email cannot exceed 255 characters'],
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return EMAIL_REGEX.test(v);
        },
        message: 'Please provide a valid email address',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return PHONE_REGEX.test(v);
        },
        message: 'Please provide a valid phone number',
      },
    },
    message: {
      type: String,
      trim: true,
      default: null,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    source: {
      type: String,
      enum: {
        values: LEAD_SOURCES,
        message: `Source must be one of: ${LEAD_SOURCES.join(', ')}`,
      },
      default: 'chatbot',
    },
    status: {
      type: String,
      enum: {
        values: LEAD_STATUSES,
        message: `Status must be one of: ${LEAD_STATUSES.join(', ')}`,
      },
      default: 'new',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for tenant-scoped query performance
leadSchema.index({ tenantId: 1, createdAt: -1 });
leadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Ensure at least one contact channel (email or phone) is provided
leadSchema.pre('validate', function (next) {
  if (this.email === '') this.email = null;
  if (this.phone === '') this.phone = null;
  if (this.message === '') this.message = null;
  if (this.notes === '') this.notes = null;

  const hasEmail = Boolean(this.email && this.email.trim());
  const hasPhone = Boolean(this.phone && this.phone.trim());

  if (!hasEmail && !hasPhone) {
    this.invalidate('email', 'At least one contact method (email or phone) must be provided');
  }

  next();
});

leadSchema.statics.LEAD_STATUSES = LEAD_STATUSES;
leadSchema.statics.LEAD_SOURCES = LEAD_SOURCES;
leadSchema.statics.EMAIL_REGEX = EMAIL_REGEX;
leadSchema.statics.PHONE_REGEX = PHONE_REGEX;

leadSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.tenantId = ret.tenantId.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Lead', leadSchema);

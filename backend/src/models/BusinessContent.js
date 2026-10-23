const mongoose = require('mongoose');

const CONTENT_STATUSES = ['draft', 'published'];

const businessContentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Content title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    body: {
      type: String,
      required: [true, 'Content body is required'],
      trim: true,
      minlength: [5, 'Content body must be at least 5 characters'],
      maxlength: [10000, 'Content body cannot exceed 10000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: CONTENT_STATUSES,
        message: 'Status must be draft or published',
      },
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tenant-scoped listing and publication filtering.
businessContentSchema.index({ tenantId: 1, createdAt: -1 });
businessContentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Expose supported publication states to request validation.
businessContentSchema.statics.CONTENT_STATUSES = CONTENT_STATUSES;

/**
 * Safe JSON serialization (exclude __v and map _id to string id)
 */
businessContentSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.tenantId = ret.tenantId.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('BusinessContent', businessContentSchema);

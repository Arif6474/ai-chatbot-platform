const mongoose = require('mongoose');

const tenantDailyUsageSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'],
    },
    successfulResponses: {
      type: Number,
      default: 0,
      min: 0,
    },
    fallbackResponses: {
      type: Number,
      default: 0,
      min: 0,
    },
    newSessions: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring one record per tenant per calendar date
tenantDailyUsageSchema.index({ tenantId: 1, date: 1 }, { unique: true });
// Compound index for platform-wide date filtering
tenantDailyUsageSchema.index({ date: 1 });

tenantDailyUsageSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.tenantId = ret.tenantId.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('TenantDailyUsage', tenantDailyUsageSchema);

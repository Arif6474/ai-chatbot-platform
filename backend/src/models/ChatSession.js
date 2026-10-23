const mongoose = require('mongoose');
const crypto = require('crypto');

const chatSessionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant reference is required'],
      index: true,
    },
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: [/^[0-9a-fA-F]{48}$/, 'Session token must be 48 hexadecimal characters'],
      default: () => crypto.randomBytes(24).toString('hex'),
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tenant-scoped session lookups
chatSessionSchema.index({ tenantId: 1, sessionToken: 1 });

/**
 * Generate a cryptographically random session token
 */
chatSessionSchema.statics.generateSessionToken = function () {
  return crypto.randomBytes(24).toString('hex');
};

/**
 * Safe JSON serialization (strip MongoDB _id and __v)
 */
chatSessionSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.tenantId = ret.tenantId.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);

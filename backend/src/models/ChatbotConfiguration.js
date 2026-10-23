const mongoose = require('mongoose');

const POSITIONS = ['bottom-right', 'bottom-left'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const chatbotConfigurationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant reference is required'],
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [80, 'Display name cannot exceed 80 characters'],
      default: 'Assistant',
    },
    welcomeMessage: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Welcome message must be at least 2 characters'],
      maxlength: [500, 'Welcome message cannot exceed 500 characters'],
      default: 'Hello! How can I help you today?',
    },
    primaryColor: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [HEX_COLOR, 'Primary color must be a six-digit hexadecimal color'],
      default: '#2563eb',
    },
    position: {
      type: String,
      enum: POSITIONS,
      default: 'bottom-right',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    fallbackMessage: {
      type: String,
      trim: true,
      maxlength: [500, 'Fallback message cannot exceed 500 characters'],
      default: null,
      validate: {
        validator: (value) => value === null || value === undefined || value.length >= 2,
        message: 'Fallback message must be at least 2 characters',
      },
    },
  },
  { timestamps: true }
);

chatbotConfigurationSchema.pre('validate', function normalizeFallbackMessage(next) {
  if (typeof this.fallbackMessage === 'string' && this.fallbackMessage.trim() === '') {
    this.fallbackMessage = null;
  }
  next();
});

chatbotConfigurationSchema.statics.POSITIONS = POSITIONS;
chatbotConfigurationSchema.statics.HEX_COLOR = HEX_COLOR;

chatbotConfigurationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.tenantId = ret.tenantId.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ChatbotConfiguration', chatbotConfigurationSchema);

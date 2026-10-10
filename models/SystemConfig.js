const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    valueType: {
      type: String,
      enum: ['string', 'number', 'boolean', 'json'],
      default: 'string',
    },
    category: {
      type: String,
      enum: ['general', 'remnant', 'plant', 'settlement', 'notification', 'security', 'feature'],
      default: 'general',
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isEditable: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

systemConfigSchema.index({ category: 1, key: 1 });

module.exports =
  mongoose.models.SystemConfig ||
  mongoose.model('SystemConfig', systemConfigSchema);
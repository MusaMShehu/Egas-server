const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Scope: global | city | plant | user
    scope: {
      type: String,
      enum: ['global', 'city', 'plant', 'user'],
      default: 'global',
    },
    scopeValue: {
      type: String,
      trim: true,
      default: null,
    },
    // Rollout percentage (future-proof; not used in v1)
    rolloutPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
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

featureFlagSchema.index({ key: 1, scope: 1, scopeValue: 1 });

module.exports =
  mongoose.models.FeatureFlag ||
  mongoose.model('FeatureFlag', featureFlagSchema);
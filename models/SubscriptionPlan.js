const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  included: {
    type: Boolean,
    default: true
  },
  icon: {
    type: String,
    default: '✓'
  }
});

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    maxlength: 150
  },
  baseSize: {
    type: String,
    required: true
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerKg: {
    type: Number,
    default: 1500,
    min: 0
  },
  type: {
    type: String,
    enum: ['preset', 'custom', 'one-time'],
    default: 'preset'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  features: [featureSchema],
  displayOrder: {
    type: Number,
    default: 0,
    min: 0
  },
  frequencyOptions: {
    type: [String],
    default: ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'],
    validate: {
      validator: function(arr) {
        return arr.length > 0;
      },
      message: 'At least one frequency option is required'
    }
  },
  sizeOptions: {
    type: [String],
    default: ['6kg', '12kg', '50kg'],
    validate: {
      validator: function(arr) {
        return arr.length > 0;
      },
      message: 'At least one size option is required'
    }
  },
  maxCustomSize: {
    type: String, // For custom plans
    default: '100kg'
  },
  deliveryInfo: {
    freeDelivery: {
      type: Boolean,
      default: true
    },
    deliveryTime: {
      type: String,
      default: 'Within 24 hours'
    },
    areas: [String]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
subscriptionPlanSchema.index({ isActive: 1, displayOrder: 1 });
subscriptionPlanSchema.index({ type: 1, isActive: 1 });

// Virtual for formatted price
subscriptionPlanSchema.virtual('formattedBasePrice').get(function() {
  return `₦${this.basePrice.toLocaleString()}`;
});

// Method to check if plan supports a frequency
subscriptionPlanSchema.methods.supportsFrequency = function(frequency) {
  return this.frequencyOptions.includes(frequency);
};

// Static method to get popular plans
subscriptionPlanSchema.statics.getPopularPlans = function() {
  return this.find({ isActive: true, isPopular: true })
    .sort({ displayOrder: 1 });
};

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
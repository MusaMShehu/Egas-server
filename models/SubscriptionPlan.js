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

// Define enum values as constants for reusability
const DELIVERY_FREQUENCIES = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly'];
const PLAN_TYPES = ['preset', 'custom', 'one-time', 'emergency'];
const FREQUENCY_OPTIONS = ['One-Time'];

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
  additionalFeePerKg: {
    type: Number,
    default: 0,
    min: 0
  },
  type: {
    type: String,
    enum: {
      values: PLAN_TYPES,
      message: '{VALUE} is not a valid plan type. Must be one of: ' + PLAN_TYPES.join(', ')
    },
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
  
  // For preset and emergency plans - FIXED ENUM
  deliveryFrequency: {
    type: [{
      type: String,
      enum: {
        values: DELIVERY_FREQUENCIES,
        message: '{VALUE} is not a valid delivery frequency. Must be one of: ' + DELIVERY_FREQUENCIES.join(', ')
      }
    }],
    validate: {
      validator: function(arr) {
        // Only validate for preset and emergency types
        if (this.type === 'preset' || this.type === 'emergency') {
          return arr && Array.isArray(arr) && arr.length > 0;
        }
        return true;
      },
      message: 'At least one delivery frequency is required for preset and emergency plans'
    }
  },
  
  // For all plan types except one-time
  subscriptionPeriod: {
    type: [{
      type: Number,
      min: 1,
      max: 12
    }],
    validate: {
      validator: function(arr) {
        // Not required for one-time plans
        if (this.type === 'one-time') {
          return true;
        }
        return arr && Array.isArray(arr) && arr.length > 0;
      },
      message: 'At least one subscription period is required for non one-time plans'
    }
  },
  
  // For custom plans
  cylinderSizeRange: {
    min: {
      type: Number,
      min: 1,
      default: 5
    },
    max: {
      type: Number,
      min: 1,
      default: 100
    }
  },
  
  // For custom plans
  deliveryFrequencyRange: {
    min: {
      type: Number,
      min: 1,
      max: 29,
      default: 1
    },
    max: {
      type: Number,
      min: 1,
      max: 29,
      default: 29
    }
  },
  
  // For one-time and emergency plans - FIXED
  cylinderSizes: {
    type: [{
      type: String,
      validate: {
        validator: function(v) {
          // Allow both string and number formats like "6kg" or 6
          return /^(\d+(\.\d+)?\s*kg|\d+)$/i.test(v);
        },
        message: 'Cylinder size must be in format like "6kg" or "6"'
      }
    }],
    validate: {
      validator: function(arr) {
        // Only validate for one-time and emergency types
        if (this.type === 'one-time' || this.type === 'emergency') {
          return arr && Array.isArray(arr) && arr.length > 0;
        }
        return true;
      },
      message: 'At least one cylinder size is required for one-time and emergency plans'
    }
  },
  
  // For one-time plans - FIXED ENUM
  frequencyOptions: {
    type: [{
      type: String,
      enum: {
        values: FREQUENCY_OPTIONS,
        message: '{VALUE} is not a valid frequency option. Must be: ' + FREQUENCY_OPTIONS.join(', ')
      }
    }],
    default: ['One-Time'],
    validate: {
      validator: function(arr) {
        // Only validate for one-time type
        if (this.type === 'one-time') {
          return arr && Array.isArray(arr) && arr.length > 0;
        }
        return true;
      },
      message: 'Frequency options are required for one-time plans'
    }
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

// Virtual for total price including additional fees
subscriptionPlanSchema.virtual('totalPricePerKg').get(function() {
  return this.pricePerKg + this.additionalFeePerKg;
});

// Method to check if plan supports a frequency
subscriptionPlanSchema.methods.supportsFrequency = function(frequency) {
  if (this.type === 'one-time') {
    return this.frequencyOptions && this.frequencyOptions.includes(frequency);
  }
  return this.deliveryFrequency && this.deliveryFrequency.includes(frequency);
};

// Method to check if cylinder size is supported
subscriptionPlanSchema.methods.supportsCylinderSize = function(size) {
  if (this.type === 'custom') {
    const sizeNum = parseInt(size);
    return sizeNum >= this.cylinderSizeRange.min && sizeNum <= this.cylinderSizeRange.max;
  }
  if (this.type === 'one-time' || this.type === 'emergency') {
    return this.cylinderSizes && this.cylinderSizes.includes(size);
  }
  // For preset plans, check if the size matches baseSize
  return this.baseSize === size;
};

// Method to check if subscription period is supported
subscriptionPlanSchema.methods.supportsSubscriptionPeriod = function(months) {
  if (this.type === 'one-time') {
    return false; // One-time plans don't have subscription periods
  }
  return this.subscriptionPeriod && this.subscriptionPeriod.includes(months);
};

// Method to calculate price for a given cylinder size
subscriptionPlanSchema.methods.calculatePrice = function(cylinderSize) {
  const size = parseInt(cylinderSize);
  if (isNaN(size)) {
    throw new Error('Invalid cylinder size');
  }
  
  const basePrice = size * this.totalPricePerKg;
  return basePrice;
};

// Static method to get popular plans
subscriptionPlanSchema.statics.getPopularPlans = function() {
  return this.find({ isActive: true, isPopular: true })
    .sort({ displayOrder: 1 });
};

// Static method to get plans by type
subscriptionPlanSchema.statics.getPlansByType = function(type) {
  return this.find({ isActive: true, type: type })
    .sort({ displayOrder: 1 });
};

// Static method to get active plans with their types
subscriptionPlanSchema.statics.getActivePlans = function() {
  return this.find({ isActive: true })
    .sort({ displayOrder: 1, type: 1 });
};

// Add a pre-save middleware to handle conditional validation
subscriptionPlanSchema.pre('save', function(next) {
  // Clean up arrays for plans that don't need them
  if (this.type !== 'preset' && this.type !== 'emergency') {
    this.deliveryFrequency = undefined;
  }
  
  if (this.type !== 'one-time' && this.type !== 'emergency') {
    this.cylinderSizes = undefined;
  }
  
  if (this.type !== 'one-time') {
    this.frequencyOptions = undefined;
  }
  
  if (this.type !== 'custom') {
    this.cylinderSizeRange = undefined;
    this.deliveryFrequencyRange = undefined;
  }
  
  next();
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planName: {
      type: String,
      required: true,
    },
    planType: {
      type: String,
      enum: ["custom", "one-time", "emergency", "preset"],
      // required: true, // Commented out as per your schema
    },
    size: String,
    frequency: {
      type: String,
      required: true,
      enum: [
        "Daily",
        "Weekly",
        "Bi-weekly",
        "Monthly",
        "One-Time",
        "Emergency",
      ],
    },
    subscriptionPeriod: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 12,
    },
    price: {
      type: Number,
      required: true,
    },
    reference: {
      type: String,
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    status: {
      type: String,
      enum: ["active", "paused", "cancelled", "expired", "pending"],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: Date,
    paymentMethod: {
      type: String,
      enum: ["wallet", "paystack", "remnant"],
    },

    customPlanDetails: {
      size: String,
      frequency: String,
      subscriptionPeriod: Number,
    },
    deliveries: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Delivery",
      },
    ],

    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    cancelledAt: { type: Date },
    expiredAt: {
      type: Date,
    },
    lastExpirationCheck: {
      type: Date,
    },

    pausedAt: {
      type: Date,
      default: null,
    },

    resumedAt: {
      type: Date,
      default: null,
    },

    remainingDuration: {
      type: Number,
      default: null,
    },

    remainingDays: {
      type: Number,
      default: null,
    },

    // In your Subscription model
    isRemnantSubscription: {
      type: Boolean,
      default: false,
    },
    remnantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Remnant",
      default: null,
    },

    // Fixed: Combined pauseHistory schema to avoid duplicate field
    pauseHistory: [
      {
        pausedAt: { type: Date, required: true },
        resumedAt: { type: Date },
        durationMs: { type: Number },
        reason: { type: String },
        deliveryUpdates: {
          pausedCount: { type: Number, default: 0 },
          resumedCount: { type: Number, default: 0 },
          extendedCount: { type: Number, default: 0 }
        }
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ subscriptionPeriod: 1 });

// Enhanced virtual for checking if subscription is active
subscriptionSchema.virtual("isActive").get(function () {
  return this.status === "active" && new Date() < this.endDate;
});

// Virtual for checking if subscription should expire
subscriptionSchema.virtual("shouldExpire").get(function () {
  if (this.status === "expired") return false;
  if (["cancelled", "expired"].includes(this.status)) return false;

  const now = new Date();
  const oneDayAfterEndDate = new Date(this.endDate);
  oneDayAfterEndDate.setDate(oneDayAfterEndDate.getDate() + 1);

  return now >= oneDayAfterEndDate;
});

// Simple method to expire subscription (NO delivery cleanup)
subscriptionSchema.methods.expireSubscription = async function () {
  if (this.status === "expired") return;

  try {
    // Simply update subscription status
    this.status = "expired";
    this.expiredAt = new Date();
    this.lastExpirationCheck = new Date();

    await this.save();

    console.log(
      `✅ Subscription ${this._id} marked as expired (deliveries preserved)`
    );
    return true;
  } catch (error) {
    console.error(`❌ Error expiring subscription ${this._id}:`, error);
    throw error;
  }
};

// Method to calculate end date based on frequency and period
subscriptionSchema.methods.calculateEndDate = function () {
  const endDate = new Date(this.startDate);

  if (this.frequency === "One-Time") {
    return this.startDate;
  }

  const totalMonths = this.subscriptionPeriod || 1;

  switch (this.frequency) {
    case "Daily":
      endDate.setDate(endDate.getDate() + 30 * totalMonths); // Approximate month as 30 days
      break;

    case "Weekly":
      endDate.setDate(endDate.getDate() + 7 * 4 * totalMonths); // 4 weeks per month
      break;

    case "Bi-weekly":
      endDate.setDate(endDate.getDate() + 14 * 4 * totalMonths); // Fixed: 14 days * 4 periods per month
      break;

    case "Monthly":
    default:
      endDate.setMonth(endDate.getMonth() + totalMonths);
      break;
  }

  return endDate;
};

// Methods to handle pause/resume (Moved from schema definition to methods)
subscriptionSchema.methods.recordPause = function(reason = 'User initiated') {
  if (!this.pauseHistory) this.pauseHistory = [];
  this.pauseHistory.push({
    pausedAt: new Date(),
    reason: reason
  });
  this.pausedAt = new Date();
  this.status = 'paused';
  return this.save();
};

subscriptionSchema.methods.recordResume = function() {
  if (!this.pauseHistory || this.pauseHistory.length === 0) {
    return Promise.reject(new Error('No active pause to resume'));
  }
  
  const activePause = this.pauseHistory[this.pauseHistory.length - 1];
  if (activePause.resumedAt) {
    return Promise.reject(new Error('Pause already resumed'));
  }
  
  activePause.resumedAt = new Date();
  activePause.durationMs = activePause.resumedAt - activePause.pausedAt;
  
  this.resumedAt = new Date();
  this.status = 'active';
  
  return this.save();
};

// Pre-save middleware to auto-calculate end date if not provided
subscriptionSchema.pre("save", function (next) {
  if (!this.endDate && this.startDate) {
    this.endDate = this.calculateEndDate();
  }
  
  // Ensure endDate is always populated if startDate exists
  if (this.startDate && !this.endDate) {
    this.endDate = this.calculateEndDate();
  }
  
  next();
});

module.exports = mongoose.model("Subscription", subscriptionSchema);
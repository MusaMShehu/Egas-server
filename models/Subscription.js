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
      // required: true,
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
      enum: ["wallet", "paystack"],
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

    pauseHistory: [
      {
        pausedAt: { type: Date },
        resumedAt: { type: Date },
        durationMs: { type: Number },
      },
    ],
  },
  {
    timestamps: true,
  }
);

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
      endDate.setDate(endDate.getDate() + 30 * totalMonths);
      break;

    case "Weekly":
      endDate.setDate(endDate.getDate() + 7 * 4 * totalMonths);
      break;

    case "Bi-weekly": // <-- MATCH ENUM EXACTLY
      endDate.setDate(endDate.getDate() + 14 * totalMonths);
      break;

    case "Monthly":
    default:
      endDate.setMonth(endDate.getMonth() + totalMonths);
      break;
  }

  return endDate;
};

// Pre-save middleware to auto-calculate end date if not provided
subscriptionSchema.pre("save", function (next) {
  if (!this.endDate && this.startDate) {
    this.endDate = this.calculateEndDate();
  }
  next();
});

module.exports = mongoose.model("Subscription", subscriptionSchema);

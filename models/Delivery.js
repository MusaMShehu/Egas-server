const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deliveryDate: {
      type: Date,
      required: true,
    },

    scheduledDate: {
      type: Date,
      required: true,
    },

    pausedAt: {
      type: Date,
      default: null,
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    originalDeliveryDate: {
      type: Date, // Store original date before pause
    },
    originalScheduledDate: {
      type: Date, // Store original scheduled date
    },
    pauseResumeHistory: [
      {
        action: {
          type: String,
          enum: ["paused", "resumed"],
        },
        date: {
          type: Date,
          required: true,
        },
        originalDate: Date,
        newDate: Date,
        pauseDurationMs: Number,
        reason: String,
      },
    ],

    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "accepted",
        "out_for_delivery",
        "delivered",
        "failed",
        "cancelled",
        "paused",
      ],
      default: "pending",
    },
    address: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    planDetails: {
      planName: String,
      size: String,
      frequency: String,
      price: Number,
    },
    deliveredAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    failedReason: {
      type: String,
    },
    customerConfirmation: {
      confirmed: { type: Boolean, default: false },
      confirmedAt: { type: Date },
      customerNotes: String,
    },
    agentNotes: {
      type: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    previousAttempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    assignedAt: {
      type: Date,
    },
    acceptedAt: {
      type: Date,
    },
    // ADDED: Track if this is a retry delivery
    isRetry: {
      type: Boolean,
      default: false,
    },

    // Partial delivery fields
    deliveredKg: {
      type: Number,
      min: 0,
    },
    remainingKg: {
      type: Number,
      min: 0,
    },

    partialDelivery: {
      isPartial: { type: Boolean, default: false },
      delivered: Number,
      remaining: Number,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      recordedAt: Date,
      canRecordPartial: { type: Boolean, default: true }, // NEW: Track if partial can be recorded
    },
    partialDeliveryRecorded: { type: Boolean, default: false }, // NEW: Track if partial was recorded
    
    // Remnant delivery fields
    isRemnantDelivery: {
      type: Boolean,
      default: false,
    },
    remnantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Remnant",
    },
    requestedKg: {
      type: Number,
      min: 0,
    },

    subscriptionPeriod: {
      type: Number,
      default: 1,
    },

    isInitialDelivery: {
      type: Boolean,
      default: false,
    },

    sequenceNumber: {
      type: Number,
      default: 0,
    },

    totalSequences: {
      type: Number,
      default: 0,
    },

    planType: {
      type: String,
      enum: ["custom", "one-time", "emergency", "preset"],
    },

    // Price breakdown
    priceBreakdown: {
      pricePerKg: Number,
      totalDeliveries: Number,
      baseAmount: Number,
    },

    // In your Delivery model
    isOneTimeRemnantDelivery: {
      type: Boolean,
      default: false,
    },

    // New fields for requirements
    failureHistory: [{
      attemptedAt: Date,
      reason: String,
      notes: String,
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    
    isRetry: {
      type: Boolean,
      default: false
    },
    
    retryCount: {
      type: Number,
      default: 0
    },
    
    remnantConfirmed: {
      type: Boolean,
      default: false
    },
    
    // Enhanced customer confirmation
    customerConfirmation: {
      confirmed: { type: Boolean, default: false },
      confirmedAt: Date,
      customerNotes: String,
      required: { type: Boolean, default: true },
      pendingSince: Date
    },
    
    // Enhanced partial delivery tracking
    partialDelivery: {
      isPartial: { type: Boolean, default: false },
      delivered: Number,
      remaining: Number,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      recordedAt: Date,
      customerConfirmed: { type: Boolean, default: false },
      customerConfirmedAt: Date
    },
    
    // Security fields
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    ipAddress: String,
    userAgent: String
  },
  {
    timestamps: true,
  }
);

// Indexes for new queries
deliverySchema.index({ 'failureHistory.attemptedAt': -1 });
deliverySchema.index({ isRetry: 1, retryCount: 1 });
deliverySchema.index({ 'customerConfirmation.pendingSince': 1 });

deliverySchema.index({ deliveryDate: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ deliveryAgent: 1 });
deliverySchema.index({ userId: 1 });
deliverySchema.index({ subscriptionId: 1 });

// Add to your existing Delivery model after the indexes
deliverySchema.index({ remnantId: 1 });
deliverySchema.index({ isRemnantDelivery: 1 });
deliverySchema.index({ "partialDelivery.isPartial": 1 });

// Add indexes for pause/resume queries
deliverySchema.index({ subscriptionId: 1, status: 1 });
deliverySchema.index({ pausedAt: 1 });
deliverySchema.index({ deliveryDate: 1, status: 1 });

// Virtual to check if delivery can be paused
deliverySchema.virtual("canBePaused").get(function () {
  return ["pending", "assigned", "accepted", "out_for_delivery"].includes(
    this.status
  );
});

// Virtual to check if delivery can be resumed
deliverySchema.virtual("canBeResumed").get(function () {
  return this.status === "paused";
});

// Add a virtual to check if delivery can be marked as partial
deliverySchema.methods.canBePartial = function () {
  return (
    ["assigned", "accepted", "out_for_delivery"].includes(this.status) &&
    !this.isRemnantDelivery
  );
};

// Add method to mark as partial delivery
deliverySchema.methods.markAsPartial = async function (
  deliveredKg,
  remainingKg,
  agentId,
  notes = ""
) {
  this.status = "delivered"; // Or create new status like 'partial_delivered'
  this.deliveredKg = deliveredKg;
  this.remainingKg = remainingKg;
  this.partialDelivery = {
    isPartial: true,
    delivered: deliveredKg,
    remaining: remainingKg,
    recordedBy: agentId,
    recordedAt: new Date(),
  };
  this.agentNotes = notes;
  this.deliveredAt = new Date();

  return this.save();
};

module.exports = mongoose.model("Delivery", deliverySchema);

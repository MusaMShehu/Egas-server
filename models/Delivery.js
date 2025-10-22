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
    status: {
      type: String,
      enum: ["pending", "assigned", "accepted", "out_for_delivery", "delivered", "failed", "cancelled"],
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
      default: false
    }
  },
  {
    timestamps: true,
  }
);

deliverySchema.index({ deliveryDate: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ deliveryAgent: 1 });
deliverySchema.index({ userId: 1 });
deliverySchema.index({ subscriptionId: 1 });

module.exports = mongoose.model("Delivery", deliverySchema);
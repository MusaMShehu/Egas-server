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
    },

     // Partial delivery fields
  deliveredKg: {
    type: Number,
    min: 0
  },
  remainingKg: {
    type: Number,
    min: 0
  },
  partialDelivery: {
    isPartial: {
      type: Boolean,
      default: false
    },
    delivered: Number,
    remaining: Number,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    recordedAt: Date
  },
  
  // Remnant delivery fields
  isRemnantDelivery: {
    type: Boolean,
    default: false
  },
  remnantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Remnant'
  },
  requestedKg: {
    type: Number,
    min: 0
  },
  
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


// Add to your existing Delivery model after the indexes
deliverySchema.index({ remnantId: 1 });
deliverySchema.index({ isRemnantDelivery: 1 });
deliverySchema.index({ 'partialDelivery.isPartial': 1 });

// Add a virtual to check if delivery can be marked as partial
deliverySchema.methods.canBePartial = function() {
  return ['assigned', 'accepted', 'out_for_delivery'].includes(this.status) && 
         !this.isRemnantDelivery;
};

// Add method to mark as partial delivery
deliverySchema.methods.markAsPartial = async function(deliveredKg, remainingKg, agentId, notes = '') {
  this.status = 'delivered'; // Or create new status like 'partial_delivered'
  this.deliveredKg = deliveredKg;
  this.remainingKg = remainingKg;
  this.partialDelivery = {
    isPartial: true,
    delivered: deliveredKg,
    remaining: remainingKg,
    recordedBy: agentId,
    recordedAt: new Date()
  };
  this.agentNotes = notes;
  this.deliveredAt = new Date();
  
  return this.save();
};

module.exports = mongoose.model("Delivery", deliverySchema);
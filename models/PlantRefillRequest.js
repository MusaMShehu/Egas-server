const mongoose = require('mongoose');

/**
 * PlantRefillRequest — An agent's request to a plant to refill a specific cylinder.
 *
 * SEPARATE from Delivery.status.
 * The plant ONLY updates this model; it NEVER touches the customer delivery.
 */
const plantRefillRequestSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    requestNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: PR-000823
    },

    // ==================== LINKAGES ====================
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },

    // ==================== CYLINDER SNAPSHOT ====================
    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cylinder',
      required: true,
    },
    cylinderTag: { type: String, required: true, uppercase: true, trim: true },
    cylinderSize: { type: String, required: true, trim: true },
    emptyWeight: { type: Number, required: true, min: 0 },
    measuredWeight: { type: Number, required: true, min: 0 },
    calculatedRemnant: { type: Number, required: true, min: 0 },

    // ==================== QUANTITIES (never overwritten) ====================
    requestedQuantity: {
      type: Number,
      required: true,
      min: [0, 'Requested quantity cannot be negative'],
    },
    agentReportedQuantity: {
      type: Number,
      default: null,
      min: 0,
    },
    plantConfirmedQuantity: {
      type: Number,
      default: null,
      min: 0,
    },

    // ==================== PRICING SNAPSHOT ====================
    pricePerKg: { type: Number, default: null, min: 0 },
    priceAgreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantPriceAgreement',
      default: null,
    },

    // ==================== TRANSACTION LINK ====================
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillTransaction',
      default: null,
      index: true,
    },

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: [
        'created',
        'received',
        'inspection_pending',
        'approved',
        'rejected',
        'refilling',
        'quantity_recorded',
        'confirmed',
        'disputed',
        'reconciled',
        'settled',
        'cancelled',
      ],
      default: 'created',
      index: true,
    },

    // ==================== RECEIVE TRACKING ====================
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    receivedAt: { type: Date, default: null },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    rejectedReason: { type: String, trim: true, default: null },

    // ==================== RETRY CHAIN ====================
    attemptNumber: { type: Number, default: 1, min: 1 },
    previousRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
      default: null,
    },

    // ==================== LOCATION & NOTES ====================
    agentNotes: { type: String, trim: true, maxlength: 500, default: null },
    gpsAtRequest: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },

    // ==================== TIMESTAMPS ====================
    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// =============================================
// INDEXES
// =============================================
plantRefillRequestSchema.index({ requestNumber: 1 }, { unique: true });
plantRefillRequestSchema.index({ plantId: 1, status: 1, createdAt: -1 });
plantRefillRequestSchema.index({ deliveryId: 1 });
plantRefillRequestSchema.index({ agentId: 1, createdAt: -1 });
plantRefillRequestSchema.index({ customerId: 1, createdAt: -1 });
plantRefillRequestSchema.index({ status: 1, createdAt: -1 });

// =============================================
// PRE-SAVE HOOKS
// =============================================
plantRefillRequestSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// =============================================
// VIRTUALS
// =============================================
plantRefillRequestSchema.virtual('variance').get(function () {
  if (this.plantConfirmedQuantity === null || this.requestedQuantity === null) {
    return null;
  }
  return +(this.plantConfirmedQuantity - this.requestedQuantity).toFixed(3);
});

plantRefillRequestSchema.virtual('canBeCancelled').get(function () {
  // Can be cancelled only before plant receives it
  return this.status === 'created';
});

module.exports =
  mongoose.models.PlantRefillRequest ||
  mongoose.model('PlantRefillRequest', plantRefillRequestSchema);
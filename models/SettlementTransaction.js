const mongoose = require('mongoose');

/**
 * SettlementTransaction — Junction record between a PlantSettlement and
 * a PlantRefillTransaction.
 *
 * Locks the transaction once added to a settlement. Immutable.
 */
const settlementTransactionSchema = new mongoose.Schema(
  {
    // ==================== LINKS ====================
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantSettlement',
      required: true,
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillTransaction',
      required: true,
      index: true,
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },

    // ==================== FINANCIAL SNAPSHOT ====================
    // These values are LOCKED at settlement generation time.
    // Even if the source transaction changes later (it shouldn't), the
    // settlement record preserves what was agreed.
    confirmedKg: {
      type: Number,
      required: true,
      min: 0,
    },
    pricePerKg: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // ==================== ADJUSTMENTS ====================
    // Positive = add to payable, negative = subtract
    adjustmentAmount: {
      type: Number,
      default: 0,
      // signed
    },
    adjustmentReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    adjustmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Adjustment',
      default: null,
    },

    // ==================== FLAGS ====================
    isLocked: {
      type: Boolean,
      default: true,
      // Once true, this row cannot be re-settled
    },
    isDisputed: {
      type: Boolean,
      default: false,
    },

    // ==================== META ====================
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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
// One transaction can only appear in one settlement
settlementTransactionSchema.index(
  { transactionId: 1 },
  { unique: true }
);
settlementTransactionSchema.index({ settlementId: 1, transactionId: 1 });
settlementTransactionSchema.index({ plantId: 1, createdAt: -1 });

// =============================================
// VIRTUALS
// =============================================

/**
 * Net amount after adjustments.
 */
settlementTransactionSchema.virtual('netAmount').get(function () {
  return +((this.amount || 0) + (this.adjustmentAmount || 0)).toFixed(2);
});

// =============================================
// GUARDS — Immutable
// =============================================
settlementTransactionSchema.pre('findOneAndUpdate', function (next) {
  // Allow only adjustmentAmount + adjustmentReason + isDisputed to change
  const update = this.getUpdate() || {};
  const keys = Object.keys(update.$set || update);

  const allowed = ['adjustmentAmount', 'adjustmentReason', 'isDisputed', 'adjustmentId'];
  const forbidden = keys.filter((k) => !allowed.includes(k));

  if (forbidden.length > 0) {
    return next(
      new Error(
        `SettlementTransaction: cannot modify ${forbidden.join(', ')} after creation`
      )
    );
  }
  next();
});

settlementTransactionSchema.pre('findOneAndDelete', function (next) {
  next(new Error('SettlementTransaction cannot be deleted. Cancel the settlement instead.'));
});

settlementTransactionSchema.pre('deleteMany', function (next) {
  next(new Error('SettlementTransaction cannot be bulk-deleted. Cancel the settlement instead.'));
});

// =============================================
// STATICS
// =============================================

/**
 * Get all settlement transactions for a settlement, with populated refill data.
 */
settlementTransactionSchema.statics.findBySettlement = function (settlementId) {
  return this.find({ settlementId })
    .populate('transactionId')
    .sort({ createdAt: 1 })
    .lean();
};

/**
 * Get all settlement transactions for a plant within a period.
 */
settlementTransactionSchema.statics.findByPlant = function (plantId, options = {}) {
  const filter = { plantId };
  if (options.from || options.to) {
    filter.createdAt = {};
    if (options.from) filter.createdAt.$gte = new Date(options.from);
    if (options.to) filter.createdAt.$lte = new Date(options.to);
  }
  return this.find(filter)
    .populate('transactionId')
    .populate('settlementId', 'settlementNumber status period')
    .sort({ createdAt: -1 })
    .lean();
};

module.exports =
  mongoose.models.SettlementTransaction ||
  mongoose.model('SettlementTransaction', settlementTransactionSchema);
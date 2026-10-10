const mongoose = require('mongoose');

/**
 * PlantSettlement — Periodic settlement statement for a partner plant.
 *
 * Aggregates all reconciled refill transactions within a period into a
 * single payable amount. Once generated, the included transactions are
 * LOCKED (isSettled = true) and cannot be settled again.
 *
 * Lifecycle:
 *   draft → pending_review → approved → processing → paid
 *                        ↘ disputed
 *                        ↘ cancelled
 */
const plantSettlementSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    settlementNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: STL-2026-10-A-0001
    },

    // ==================== PLANT ====================
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },

    // ==================== PERIOD ====================
    period: {
      startDate: {
        type: Date,
        required: true,
        index: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      label: {
        type: String,
        trim: true,
        default: null,
        // e.g. "01–07 Oct 2026"
      },
    },

    // ==================== AGGREGATES ====================
    totals: {
      transactionCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalRequestedKg: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalConfirmedKg: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalVarianceKg: {
        type: Number,
        default: 0,
        // signed: sum of (plantConfirmed - requested)
      },
      grossValue: {
        type: Number,
        default: 0,
        min: 0,
      },
      adjustments: {
        type: Number,
        default: 0,
        // signed: sum of adjustmentAmount across disputed transactions
      },
      disputedCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      rejectedCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      netPayable: {
        type: Number,
        default: 0,
        min: 0,
      },
      currency: {
        type: String,
        default: 'NGN',
        uppercase: true,
        enum: ['NGN'],
      },
    },

    // ==================== TRANSACTIONS ====================
    // Array of PlantRefillTransaction IDs included in this settlement.
    // These are locked (isSettled = true) once the settlement is created.
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PlantRefillTransaction',
      },
    ],

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: [
        'draft',
        'pending_review',
        'approved',
        'processing',
        'paid',
        'disputed',
        'cancelled',
      ],
      default: 'draft',
      index: true,
    },

    // ==================== WORKFLOW ACTORS ====================
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },

    // ==================== PAYMENT REFERENCE ====================
    paymentReference: {
      type: String,
      trim: true,
      default: null,
      // e.g. bank transfer ref, Paystack payout ref
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: null,
      // 'bank_transfer' | 'paystack' | 'cash' | 'other'
    },

    // ==================== NOTES ====================
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    // ==================== STATUS HISTORY ====================
    statusHistory: [
      {
        from: String,
        to: {
          type: String,
          required: true,
        },
        at: {
          type: Date,
          default: Date.now,
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        byRole: String,
        note: String,
      },
    ],
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
plantSettlementSchema.index({ settlementNumber: 1 }, { unique: true });
plantSettlementSchema.index({ plantId: 1, status: 1 });
plantSettlementSchema.index({ plantId: 1, 'period.startDate': -1 });
plantSettlementSchema.index({ 'period.startDate': -1 });
plantSettlementSchema.index({ status: 1, createdAt: -1 });

// =============================================
// VIRTUALS
// =============================================
plantSettlementSchema.virtual('isOpen').get(function () {
  return ['draft', 'pending_review', 'approved', 'processing'].includes(
    this.status
  );
});

plantSettlementSchema.virtual('isFinalized').get(function () {
  return ['paid', 'cancelled'].includes(this.status);
});

plantSettlementSchema.virtual('averageValuePerTransaction').get(function () {
  if (!this.totals.transactionCount) return 0;
  return +(this.totals.grossValue / this.totals.transactionCount).toFixed(2);
});

// =============================================
// PRE-SAVE HOOKS
// =============================================

/**
 * Compute netPayable if not explicitly set.
 * netPayable = grossValue + adjustments
 */
plantSettlementSchema.pre('save', function (next) {
  if (this.totals) {
    if (this.totals.netPayable === 0 || this.isNew) {
      this.totals.netPayable = +(
        (this.totals.grossValue || 0) + (this.totals.adjustments || 0)
      ).toFixed(2);
    }
  }
  next();
});

// =============================================
// METHODS
// =============================================

/**
 * Transition status and record history.
 */
plantSettlementSchema.methods.transitionTo = async function ({
  status,
  by = null,
  byRole = null,
  note = null,
}) {
  const from = this.status;
  if (from === status) return this;

  this.status = status;
  this.statusHistory.push({
    from,
    to: status,
    at: new Date(),
    by,
    byRole,
    note,
  });

  return this.save();
};

/**
 * Mark as reviewed.
 */
plantSettlementSchema.methods.markReviewed = async function (userId, role) {
  this.reviewedBy = userId;
  this.reviewedAt = new Date();
  return this.transitionTo({
    status: 'pending_review',
    by: userId,
    byRole: role,
    note: 'Reviewed',
  });
};

/**
 * Approve settlement.
 */
plantSettlementSchema.methods.markApproved = async function (userId, role) {
  this.approvedBy = userId;
  this.approvedAt = new Date();
  return this.transitionTo({
    status: 'approved',
    by: userId,
    byRole: role,
    note: 'Approved',
  });
};

/**
 * Mark as paid.
 */
plantSettlementSchema.methods.markPaid = async function (
  userId,
  role,
  { paymentReference = null, paymentMethod = null, note = null } = {}
) {
  this.paidBy = userId;
  this.paidAt = new Date();
  this.paymentReference = paymentReference;
  this.paymentMethod = paymentMethod;

  return this.transitionTo({
    status: 'paid',
    by: userId,
    byRole: role,
    note: note || `Paid (ref: ${paymentReference || 'N/A'})`,
  });
};

/**
 * Cancel settlement.
 */
plantSettlementSchema.methods.cancel = async function (
  userId,
  role,
  reason
) {
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  return this.transitionTo({
    status: 'cancelled',
    by: userId,
    byRole: role,
    note: reason,
  });
};

// =============================================
// STATICS
// =============================================

/**
 * Find open settlements for a plant.
 */
plantSettlementSchema.statics.findOpenByPlant = function (plantId) {
  return this.find({
    plantId,
    status: { $in: ['draft', 'pending_review', 'approved', 'processing'] },
  })
    .sort({ 'period.startDate': -1 })
    .lean();
};

/**
 * Get most recent settlement for a plant.
 */
plantSettlementSchema.statics.getLatestForPlant = function (plantId) {
  return this.findOne({ plantId }).sort({ 'period.endDate': -1 }).lean();
};

module.exports =
  mongoose.models.PlantSettlement ||
  mongoose.model('PlantSettlement', plantSettlementSchema);
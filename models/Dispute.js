const mongoose = require('mongoose');

/**
 * Dispute — Formal dispute record for variance/quality issues between
 * agent-reported and plant-confirmed refill quantities.
 *
 * Created automatically by PlantRefillService.confirmRefill() when
 * variance exceeds PLANT_VARIANCE_TOLERANCE_KG, or manually by admins.
 *
 * Lifecycle:
 *   open → under_review → resolved | rejected | cancelled
 *
 * The original PlantRefillRequest/Transaction records are NEVER modified
 * by a dispute. Resolution only creates Adjustments (side-effect records).
 */
const disputeSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    disputeNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: DSP-000001
    },

    // ==================== CONTEXT ====================
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
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
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
      index: true,
    },

    // ==================== VARIANCE SNAPSHOT ====================
    // Snapshot of the numbers at the moment the dispute was created.
    // These are immutable — never overwrite, even if the underlying
    // transaction is later edited (it shouldn't be, but this is defensive).
    requestedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    agentReportedQuantity: {
      type: Number,
      default: null,
      min: 0,
    },
    plantConfirmedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    variance: {
      type: Number,
      required: true,
      // Signed: plantConfirmed - requested
    },
    tolerance: {
      type: Number,
      default: 0.2,
      min: 0,
    },

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'rejected', 'cancelled'],
      default: 'open',
      index: true,
    },

    // ==================== RAISED BY ====================
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    raisedByRole: {
      type: String,
      trim: true,
      default: null,
    },
    // 'system' when auto-created on variance threshold breach
    raisedByType: {
      type: String,
      enum: ['system', 'admin', 'plant_admin', 'plant_supervisor', 'agent'],
      default: 'system',
    },

    // ==================== INITIAL REASON ====================
    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    // ==================== RESOLUTION ====================
    resolution: {
      type: String,
      enum: [
        'accept_plant_quantity',
        'accept_agent_quantity',
        'partial_adjustment',
        'reject_transaction',
        'request_more_evidence',
        null,
      ],
      default: null,
    },
    resolutionNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },

    // ==================== FINANCIAL IMPACT ====================
    // Populated when resolution involves an adjustment
    adjustmentKg: {
      type: Number,
      default: 0,
    },
    adjustmentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    adjustmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Adjustment',
      default: null,
    },

    // ==================== EVIDENCE ====================
    evidence: [
      {
        public_id: String,
        url: String,
        secure_url: String,
        original_filename: String,
        format: String,
        bytes: Number,
        created_at: String,
        _id: false,
      },
    ],

    // ==================== COMMENTS ====================
    comments: [
      {
        authorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        authorRole: {
          type: String,
          trim: true,
        },
        authorName: {
          type: String,
          trim: true,
          default: null,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 2000,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ==================== RESOLUTION TIMELINE ====================
    // Every status change recorded here for full audit trail
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

    // ==================== META ====================
    isAutoGenerated: {
      type: Boolean,
      default: false,
      index: true,
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
disputeSchema.index({ disputeNumber: 1 }, { unique: true });
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ plantId: 1, status: 1, createdAt: -1 });
disputeSchema.index({ transactionId: 1 });
disputeSchema.index({ requestId: 1 });
disputeSchema.index({ isAutoGenerated: 1, status: 1 });

// =============================================
// VIRTUALS
// =============================================
disputeSchema.virtual('isOpen').get(function () {
  return ['open', 'under_review'].includes(this.status);
});

disputeSchema.virtual('isClosed').get(function () {
  return ['resolved', 'rejected', 'cancelled'].includes(this.status);
});

disputeSchema.virtual('varianceMagnitude').get(function () {
  return Math.abs(this.variance);
});

// =============================================
// PRE-SAVE HOOKS
// =============================================
disputeSchema.pre('save', function (next) {
  // Ensure variance is always computed correctly
  if (
    this.plantConfirmedQuantity != null &&
    this.requestedQuantity != null
  ) {
    this.variance = +(this.plantConfirmedQuantity - this.requestedQuantity).toFixed(3);
  }
  next();
});

// =============================================
// METHODS
// =============================================

/**
 * Add a comment to the dispute.
 */
disputeSchema.methods.addComment = async function ({
  authorId,
  authorRole,
  authorName = null,
  text,
}) {
  this.comments.push({
    authorId,
    authorRole,
    authorName,
    text,
    createdAt: new Date(),
  });
  return this.save();
};

/**
 * Transition to a new status and record in history.
 */
disputeSchema.methods.transitionTo = async function ({
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

// =============================================
// STATICS
// =============================================

/**
 * Find open disputes for a specific plant.
 */
disputeSchema.statics.findOpenByPlant = function (plantId) {
  return this.find({
    plantId,
    status: { $in: ['open', 'under_review'] },
  })
    .sort({ createdAt: -1 })
    .populate('plantId', 'name code')
    .lean();
};

/**
 * Count open disputes for the dashboard.
 */
disputeSchema.statics.countOpen = function (plantId = null) {
  const filter = { status: { $in: ['open', 'under_review'] } };
  if (plantId) filter.plantId = plantId;
  return this.countDocuments(filter);
};

module.exports =
  mongoose.models.Dispute || mongoose.model('Dispute', disputeSchema);
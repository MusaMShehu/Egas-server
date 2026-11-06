// const mongoose = require('mongoose');

// /**
//  * CylinderRemnantLedger — Immutable, append-only remnant LPG ledger.
//  *
//  * CORE RULE: Never UPDATE or DELETE rows. Only INSERT.
//  *
//  * Each row is a single balance-changing event for a customer's remnant account.
//  * The current balance is derived by reading the latest `newBalance` (or summing deltas).
//  *
//  * Events:
//  *   + measurement_added        (from weighing; +remnant)
//  *   + remnant_credited         (admin manual credit)
//  *   - remnant_consumed         (customer requests remnant delivery)
//  *   - remnant_debited          (admin manual debit)
//  *   - remnant_expired          (auto, after expiry window)
//  *   ± adjustment               (dispute resolution)
//  */
// const cylinderRemnantLedgerSchema = new mongoose.Schema(
//   {
//     // ==================== ACCOUNT ====================
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       required: true,
//       index: true,
//     },

//     // Optional: cylinder-scoped tracking (a user may have multiple cylinders)
//     cylinderId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Cylinder',
//       default: null,
//       index: true,
//     },
//     cylinderTag: {
//       type: String,
//       trim: true,
//       uppercase: true,
//       default: null,
//     },

//     // ==================== EVENT ====================
//     event: {
//       type: String,
//       enum: [
//         'measurement_added',
//         'remnant_consumed',
//         'remnant_credited',
//         'remnant_debited',
//         'remnant_expired',
//         'adjustment',
//       ],
//       required: true,
//       index: true,
//     },

//     // ==================== BALANCE MATH ====================
//     previousBalance: {
//       type: Number,
//       required: true,
//       min: [0, 'Previous balance cannot be negative'],
//     },
//     delta: {
//       type: Number,
//       required: true,
//       // Signed: positive for additions, negative for consumption
//     },
//     newBalance: {
//       type: Number,
//       required: true,
//       min: [0, 'New balance cannot be negative'],
//       index: true,
//     },

//     // ==================== MEASUREMENT CONTEXT ====================
//     // Populated only when event === 'measurement_added'
//     measuredWeight: {
//       type: Number,
//       default: null,
//       min: 0,
//     },
//     emptyWeight: {
//       type: Number,
//       default: null,
//       min: 0,
//     },
//     physicalRemnant: {
//       type: Number,
//       default: null,
//       min: 0,
//     },

//     // ==================== REFERENCES ====================
//     deliveryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Delivery',
//       default: null,
//       index: true,
//     },
//     weightRecordId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'CylinderWeightRecord',
//       default: null,
//     },
//     subscriptionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Subscription',
//       default: null,
//     },
//     disputeId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Dispute',
//       default: null,
//     },
//     adjustmentId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Adjustment',
//       default: null,
//     },

//     // ==================== ACTOR ====================
//     performedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       default: null,
//     },
//     performedByRole: {
//       type: String,
//       trim: true,
//       default: null,
//     },

//     // ==================== REASON ====================
//     reason: {
//       type: String,
//       trim: true,
//       maxlength: 500,
//       default: null,
//     },

//     // ==================== FREE-FORM METADATA ====================
//     metadata: {
//       type: mongoose.Schema.Types.Mixed,
//       default: {},
//     },

//     createdAt: {
//       type: Date,
//       default: Date.now,
//       index: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // =============================================
// // INDEXES
// // =============================================
// cylinderRemnantLedgerSchema.index({ userId: 1, createdAt: -1 });
// cylinderRemnantLedgerSchema.index({ cylinderId: 1, createdAt: -1 });
// cylinderRemnantLedgerSchema.index({ event: 1, createdAt: -1 });
// cylinderRemnantLedgerSchema.index({ deliveryId: 1 });

// // Compound index for fast "latest balance for user" query
// cylinderRemnantLedgerSchema.index({ userId: 1, newBalance: -1, createdAt: -1 });

// // =============================================
// // GUARDS — Append-only
// // =============================================
// cylinderRemnantLedgerSchema.pre('findOneAndUpdate', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
// });
// cylinderRemnantLedgerSchema.pre('findOneAndDelete', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
// });
// cylinderRemnantLedgerSchema.pre('updateOne', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
// });
// cylinderRemnantLedgerSchema.pre('updateMany', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
// });
// cylinderRemnantLedgerSchema.pre('deleteOne', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
// });
// cylinderRemnantLedgerSchema.pre('deleteMany', function (next) {
//   next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
// });

// // =============================================
// // VIRTUALS
// // =============================================
// cylinderRemnantLedgerSchema.virtual('isCredit').get(function () {
//   return this.delta > 0;
// });
// cylinderRemnantLedgerSchema.virtual('isDebit').get(function () {
//   return this.delta < 0;
// });

// module.exports =
//   mongoose.models.CylinderRemnantLedger ||
//   mongoose.model('CylinderRemnantLedger', cylinderRemnantLedgerSchema);
























const mongoose = require('mongoose');

/**
 * CylinderRemnantLedger — Immutable, append-only remnant LPG ledger.
 *
 * CORE RULE: Never UPDATE or DELETE rows. Only INSERT.
 *
 * Each row is a single balance-changing event for a customer's remnant account.
 * The current balance is derived by reading the latest `newBalance` (or summing deltas).
 *
 * Remnant means: gas E-Gas owes the customer because the plant under-filled
 * vs. the customer's purchase.
 *
 *   remnantDeltaKg = max(0, purchasedKg - (postFillWeight - preFillWeight))
 *
 * Events:
 *   + measurement_added        (from post-fill weighing; remnantDeltaKg)
 *   + remnant_credited         (admin manual credit)
 *   - remnant_consumed         (customer requests remnant delivery)
 *   - remnant_debited          (admin manual debit)
 *   - remnant_expired          (auto, after expiry window)
 *   ± adjustment               (dispute resolution)
 */
const cylinderRemnantLedgerSchema = new mongoose.Schema(
  {
    // ==================== ACCOUNT ====================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cylinder',
      default: null,
      index: true,
    },
    cylinderTag: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    // ==================== EVENT ====================
    event: {
      type: String,
      enum: [
        'measurement_added',
        'remnant_consumed',
        'remnant_credited',
        'remnant_debited',
        'remnant_expired',
        'adjustment',
      ],
      required: true,
      index: true,
    },

    // ==================== BALANCE MATH ====================
    previousBalance: {
      type: Number,
      required: true,
      min: [0, 'Previous balance cannot be negative'],
    },
    delta: {
      type: Number,
      required: true,
      // Signed: positive for additions, negative for consumption
    },
    newBalance: {
      type: Number,
      required: true,
      min: [0, 'New balance cannot be negative'],
      index: true,
    },

    // ==================== MEASUREMENT CONTEXT (LEGACY) ====================
    // Kept for backwards compatibility.
    // For new pre/post fill records:
    //   measuredWeight  = postFillWeight
    //   emptyWeight     = preFillWeight
    //   physicalRemnant = refilledKg (postFill - preFill)
    measuredWeight: {
      type: Number,
      default: null,
      min: 0,
    },
    emptyWeight: {
      type: Number,
      default: null,
      min: 0,
    },
    physicalRemnant: {
      type: Number,
      default: null,
      min: 0,
    },

    // ==================== PRE/POST FILL (NEW) ====================
    // Denormalized for fast display — mirrors metadata.* for easy query.
    preFillWeight: {
      type: Number,
      default: null,
      min: 0,
    },
    postFillWeight: {
      type: Number,
      default: null,
      min: 0,
    },
    purchasedKg: {
      type: Number,
      default: null,
      min: 0,
    },
    refilledKg: {
      type: Number,
      default: null,
      min: 0,
    },

    // ==================== REFERENCES ====================
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
      index: true,
    },
    weightRecordId: {
      // For new records: points to the POST-fill weight record.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CylinderWeightRecord',
      default: null,
    },
    preWeightRecordId: {
      // NEW: points to the PRE-fill weight record.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CylinderWeightRecord',
      default: null,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    disputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispute',
      default: null,
    },
    adjustmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Adjustment',
      default: null,
    },

    // ==================== ACTOR ====================
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    performedByRole: {
      type: String,
      trim: true,
      default: null,
    },

    // ==================== REASON ====================
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // ==================== METADATA ====================
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// =============================================
// INDEXES
// =============================================
cylinderRemnantLedgerSchema.index({ userId: 1, createdAt: -1 });
cylinderRemnantLedgerSchema.index({ cylinderId: 1, createdAt: -1 });
cylinderRemnantLedgerSchema.index({ event: 1, createdAt: -1 });
cylinderRemnantLedgerSchema.index({ deliveryId: 1 });
cylinderRemnantLedgerSchema.index({ userId: 1, newBalance: -1, createdAt: -1 });

// =============================================
// GUARDS — Append-only
// =============================================
cylinderRemnantLedgerSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
});
cylinderRemnantLedgerSchema.pre('findOneAndDelete', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
});
cylinderRemnantLedgerSchema.pre('updateOne', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
});
cylinderRemnantLedgerSchema.pre('updateMany', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No updates allowed.'));
});
cylinderRemnantLedgerSchema.pre('deleteOne', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
});
cylinderRemnantLedgerSchema.pre('deleteMany', function (next) {
  next(new Error('CylinderRemnantLedger is append-only. No deletes allowed.'));
});

// =============================================
// VIRTUALS
// =============================================
cylinderRemnantLedgerSchema.virtual('isCredit').get(function () {
  return this.delta > 0;
});
cylinderRemnantLedgerSchema.virtual('isDebit').get(function () {
  return this.delta < 0;
});

module.exports =
  mongoose.models.CylinderRemnantLedger ||
  mongoose.model('CylinderRemnantLedger', cylinderRemnantLedgerSchema);
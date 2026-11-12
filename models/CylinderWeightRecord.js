// const mongoose = require('mongoose');

// /**
//  * CylinderWeightRecord — Immutable record of a single weight measurement.
//  *
//  * Every physical weighing event creates ONE record. Never mutate.
//  * This is the source-of-truth for remnant calculations.
//  */
// const cylinderWeightRecordSchema = new mongoose.Schema(
//   {
//     // ==================== REFERENCES ====================
//     cylinderId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Cylinder',
//       required: true,
//       index: true,
//     },
//     tagCode: {
//       type: String,
//       trim: true,
//       uppercase: true,
//     },
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       index: true,
//     },

//     // ==================== CONTEXT ====================
//     deliveryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Delivery',
//       default: null,
//       index: true,
//     },
//     subscriptionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Subscription',
//       default: null,
//     },
//     plantRefillRequestId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'PlantRefillRequest',
//       default: null,
//       index: true,
//     },

//     measurementType: {
//       type: String,
//       enum: [
//         'customer_delivery',    // weighing cylinder before refill (agent side)
//         'plant_refill_pre',     // plant-side pre-refill weight
//         'plant_refill_post',    // plant-side post-refill weight
//         'audit',                // manual audit weighing
//         'registration',         // initial registration weighing
//       ],
//       default: 'customer_delivery',
//       index: true,
//     },

//     // ==================== WEIGHTS ====================
//     measuredWeight: {
//       type: Number,
//       required: true,
//       min: [0, 'Measured weight cannot be negative'],
//     },
//     emptyWeight: {
//       type: Number,
//       required: true,
//       min: [0, 'Empty weight cannot be negative'],
//     },
//     calculatedLpg: {
//       type: Number,
//       required: true,
//       min: [0, 'Calculated LPG cannot be negative'],
//     },

//     // ==================== ACTOR ====================
//     recordedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       required: true,
//       index: true,
//     },
//     recordedByRole: {
//       type: String,
//       trim: true,
//     },

//     // ==================== LOCATION ====================
//     gpsCoordinates: {
//       type: {
//         type: String,
//         enum: ['Point'],
//         default: 'Point',
//       },
//       coordinates: {
//         type: [Number], // [lng, lat]
//         default: undefined,
//       },
//     },

//     // ==================== EVIDENCE ====================
//     photos: [
//       {
//         public_id: String,
//         url: String,
//         secure_url: String,
//         _id: false,
//       },
//     ],

//     notes: {
//       type: String,
//       trim: true,
//       maxlength: 500,
//     },

//     // ==================== LEDGER LINK ====================
//     remnantLedgerEntryId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'CylinderRemnantLedger',
//       default: null,
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
// cylinderWeightRecordSchema.index({ cylinderId: 1, createdAt: -1 });
// cylinderWeightRecordSchema.index({ deliveryId: 1 });
// cylinderWeightRecordSchema.index({ userId: 1, createdAt: -1 });
// cylinderWeightRecordSchema.index({ measurementType: 1, createdAt: -1 });

// // =============================================
// // GUARD — Immutable
// // =============================================
// cylinderWeightRecordSchema.pre('findOneAndUpdate', function (next) {
//   next(new Error('CylinderWeightRecord is immutable.'));
// });
// cylinderWeightRecordSchema.pre('findOneAndDelete', function (next) {
//   next(new Error('CylinderWeightRecord cannot be deleted.'));
// });
// cylinderWeightRecordSchema.pre('deleteMany', function (next) {
//   next(new Error('CylinderWeightRecord cannot be bulk-deleted.'));
// });

// module.exports =
//   mongoose.models.CylinderWeightRecord ||
//   mongoose.model('CylinderWeightRecord', cylinderWeightRecordSchema);

const mongoose = require("mongoose");

/**
 * CylinderWeightRecord — Immutable record of a single weight measurement.
 *
 * Every physical weighing event creates ONE record. Never mutate.
 * This is the source-of-truth for remnant calculations.
 *
 * Measurement phases (NEW — pre/post fill workflow):
 *  - 'pre_fill'     : cylinder weighed BEFORE plant refill (agent collects from customer)
 *  - 'post_fill'    : cylinder weighed AFTER plant refill (agent collects from plant)
 *  - 'standalone'   : any other weigh event (audit, registration, legacy customer_delivery)
 *
 * The pairing rule:
 *  - Every 'post_fill' record MUST have a pairedWeightRecordId pointing to the
 *    corresponding 'pre_fill' record for the SAME delivery.
 *  - Only 'post_fill' records carry `remnantDeltaKg` (the amount E-Gas owes the customer).
 *
 * remnantDeltaKg formula (authoritative — computed in CylinderWeightService):
 *     refilledKg    = postFillWeight - preFillWeight
 *     remnantDeltaKg = max(0, purchasedKg - refilledKg)
 */
const cylinderWeightRecordSchema = new mongoose.Schema(
  {
    // ==================== REFERENCES ====================
    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cylinder",
      required: true,
      index: true,
    },
    tagCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // ==================== CONTEXT ====================
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    plantRefillRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlantRefillRequest",
      default: null,
      index: true,
    },

    // ==================== PHASE (NEW) ====================
    phase: {
      type: String,
      enum: ["pre_fill", "post_fill", "standalone"],
      default: "standalone",
      index: true,
    },

    // Legacy measurement type — kept for backwards compatibility.
    // For new pre/post fill records, this is derived from `phase`.
    measurementType: {
      type: String,
      enum: [
        "customer_delivery",
        "plant_refill_pre",
        "plant_refill_post",
        "audit",
        "registration",
      ],
      default: "customer_delivery",
      index: true,
    },

    // ==================== PAIRING (NEW) ====================
    // On a post_fill record, points to the matching pre_fill record.
    // On a pre_fill record, remains null.
    pairedWeightRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CylinderWeightRecord",
      default: null,
    },
    // Set to true when a retry supersedes this pre-fill (a newer one exists).
    superseded: {
      type: Boolean,
      default: false,
      index: true,
    },
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CylinderWeightRecord",
      default: null,
    },

    // ==================== WEIGHTS ====================
    measuredWeight: {
      type: Number,
      required: true,
      min: [0, "Measured weight cannot be negative"],
    },
    emptyWeight: {
      // LEGACY: registered tare. Not used for remnant math anymore.
      // Populated from cylinder.emptyWeight at time of weighing for reference only.
      type: Number,
      // required: true,
      min: [0, "Empty weight cannot be negative"],
    },
    calculatedLpg: {
      // LEGACY: measured - empty. Kept for old code paths.
      // For new post_fill records, use `remnantDeltaKg` instead.
      type: Number,
      // required: true,
      min: [0, "Calculated LPG cannot be negative"],
    },

    // ==================== REMNANT (NEW) ====================
    // Only populated on 'post_fill' records.
    // = max(0, purchasedKg - refilledKg)
    remnantDeltaKg: {
      type: Number,
      default: null,
      min: 0,
    },
    // Diagnostic — populated on 'post_fill' records.
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
    overFillKg: {
      type: Number,
      default: null,
      min: 0,
    },

    // ==================== ACTOR ====================
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recordedByRole: {
      type: String,
      trim: true,
    },

    // ==================== LOCATION ====================
    gpsCoordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
      },
    },

    // ==================== EVIDENCE ====================
    photos: [
      {
        public_id: String,
        url: String,
        secure_url: String,
        _id: false,
      },
    ],

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // ==================== LEDGER LINK ====================
    remnantLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CylinderRemnantLedger",
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// =============================================
// INDEXES
// =============================================
cylinderWeightRecordSchema.index({ cylinderId: 1, createdAt: -1 });
cylinderWeightRecordSchema.index({ deliveryId: 1, phase: 1 });
cylinderWeightRecordSchema.index({ userId: 1, createdAt: -1 });
cylinderWeightRecordSchema.index({ measurementType: 1, createdAt: -1 });
cylinderWeightRecordSchema.index({ phase: 1, superseded: 1 });

// =============================================
// GUARD — Immutable
// =============================================
// EXCEPTION: `superseded` / `supersededBy` may be set exactly once
// (when a retry supersedes an old pre-fill). Everything else is immutable.
cylinderWeightRecordSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const keys = Object.keys(update.$set || update);
  const allowed = ["superseded", "supersededBy", "remnantLedgerEntryId"];
  const forbidden = keys.filter((k) => !allowed.includes(k));
  if (forbidden.length > 0) {
    return next(
      new Error(
        `CylinderWeightRecord: cannot modify ${forbidden.join(", ")} after creation`,
      ),
    );
  }
  next();
});

cylinderWeightRecordSchema.pre("findOneAndDelete", function (next) {
  next(new Error("CylinderWeightRecord cannot be deleted."));
});

cylinderWeightRecordSchema.pre("deleteMany", function (next) {
  next(new Error("CylinderWeightRecord cannot be bulk-deleted."));
});

module.exports =
  mongoose.models.CylinderWeightRecord ||
  mongoose.model("CylinderWeightRecord", cylinderWeightRecordSchema);

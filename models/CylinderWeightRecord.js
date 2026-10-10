const mongoose = require('mongoose');

/**
 * CylinderWeightRecord — Immutable record of a single weight measurement.
 *
 * Every physical weighing event creates ONE record. Never mutate.
 * This is the source-of-truth for remnant calculations.
 */
const cylinderWeightRecordSchema = new mongoose.Schema(
  {
    // ==================== REFERENCES ====================
    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cylinder',
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
      ref: 'User',
      index: true,
    },

    // ==================== CONTEXT ====================
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    plantRefillRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
      default: null,
      index: true,
    },

    measurementType: {
      type: String,
      enum: [
        'customer_delivery',    // weighing cylinder before refill (agent side)
        'plant_refill_pre',     // plant-side pre-refill weight
        'plant_refill_post',    // plant-side post-refill weight
        'audit',                // manual audit weighing
        'registration',         // initial registration weighing
      ],
      default: 'customer_delivery',
      index: true,
    },

    // ==================== WEIGHTS ====================
    measuredWeight: {
      type: Number,
      required: true,
      min: [0, 'Measured weight cannot be negative'],
    },
    emptyWeight: {
      type: Number,
      required: true,
      min: [0, 'Empty weight cannot be negative'],
    },
    calculatedLpg: {
      type: Number,
      required: true,
      min: [0, 'Calculated LPG cannot be negative'],
    },

    // ==================== ACTOR ====================
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
        enum: ['Point'],
        default: 'Point',
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
      ref: 'CylinderRemnantLedger',
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
  }
);

// =============================================
// INDEXES
// =============================================
cylinderWeightRecordSchema.index({ cylinderId: 1, createdAt: -1 });
cylinderWeightRecordSchema.index({ deliveryId: 1 });
cylinderWeightRecordSchema.index({ userId: 1, createdAt: -1 });
cylinderWeightRecordSchema.index({ measurementType: 1, createdAt: -1 });

// =============================================
// GUARD — Immutable
// =============================================
cylinderWeightRecordSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('CylinderWeightRecord is immutable.'));
});
cylinderWeightRecordSchema.pre('findOneAndDelete', function (next) {
  next(new Error('CylinderWeightRecord cannot be deleted.'));
});
cylinderWeightRecordSchema.pre('deleteMany', function (next) {
  next(new Error('CylinderWeightRecord cannot be bulk-deleted.'));
});

module.exports =
  mongoose.models.CylinderWeightRecord ||
  mongoose.model('CylinderWeightRecord', cylinderWeightRecordSchema);
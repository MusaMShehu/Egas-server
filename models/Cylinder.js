const mongoose = require('mongoose');

/**
 * Cylinder — A registered physical LPG cylinder.
 *
 * Key concepts:
 *  - Identified by human-readable `tagCode` (e.g. EG-CYL-001245). No QR/NFC.
 *  - `emptyWeight` (tare) is registered once, updated only via explicit re-registration.
 *  - `currentCustodian` tracks who physically holds the cylinder.
 *  - History is stored in separate collections (weight, custody, remnant) and linked here.
 */
const cylinderSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    tagCode: {
      type: String,
      required: [true, 'Cylinder tag code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9\-]{4,32}$/, 'Invalid cylinder tag format'],
      index: true,
    },

    size: {
      type: String,
      required: [true, 'Cylinder size is required'],
      trim: true,
      // Examples: "6kg", "12.5kg", "25kg", "50kg"
    },

    brand: {
      type: String,
      trim: true,
      default: null,
    },

    // ==================== OWNERSHIP ====================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer is required'],
      index: true,
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },

    // ==================== WEIGHTS ====================
    // Registered tare (empty cylinder) weight — the authoritative reference
    emptyWeight: {
      type: Number,
      required: [true, 'Empty cylinder weight is required'],
      min: [0, 'Empty weight cannot be negative'],
    },

    // Last physical measurement recorded
    lastMeasuredWeight: {
      type: Number,
      min: 0,
      default: null,
    },
    lastMeasuredAt: {
      type: Date,
      default: null,
    },

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: [
        'active',            // with customer, ready
        'in_transit',        // with agent
        'at_plant',          // at partner plant
        'under_inspection',  // being inspected at plant
        'retired',           // end of life
        'lost',              // reported lost
        'flagged',           // damaged / unsafe
      ],
      default: 'active',
      index: true,
    },

    // ==================== CUSTODY ====================
    currentCustodian: {
      type: {
        type: String,
        enum: ['customer', 'agent', 'plant', 'egas', 'unknown'],
        default: 'customer',
      },
      referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      since: {
        type: Date,
        default: Date.now,
      },
    },

    // ==================== CONDITION ====================
    lastInspection: {
      inspectionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PlantInspection',
        default: null,
      },
      status: {
        type: String,
        enum: ['pass', 'fail', null],
        default: null,
      },
      at: {
        type: Date,
        default: null,
      },
    },
    flaggedReason: {
      type: String,
      trim: true,
      default: null,
    },

    // ==================== HISTORY POINTERS ====================
    // These are lightweight references; actual data lives in the respective collection
    weightHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CylinderWeightRecord',
      },
    ],
    custodyHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CylinderCustodyRecord',
      },
    ],
    remnantLedger: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CylinderRemnantLedger',
      },
    ],

    // ==================== FLAGS ====================
    isDeleted: {
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
cylinderSchema.index({ tagCode: 1 }, { unique: true });
cylinderSchema.index({ userId: 1, status: 1 });
cylinderSchema.index({ status: 1, isDeleted: 1 });
cylinderSchema.index({ 'currentCustodian.type': 1, 'currentCustodian.referenceId': 1 });

// =============================================
// VIRTUALS
// =============================================
cylinderSchema.virtual('isWithCustomer').get(function () {
  return this.currentCustodian?.type === 'customer';
});

cylinderSchema.virtual('isWithAgent').get(function () {
  return this.currentCustodian?.type === 'agent';
});

cylinderSchema.virtual('isAtPlant').get(function () {
  return this.currentCustodian?.type === 'plant';
});

cylinderSchema.virtual('isAvailable').get(function () {
  return this.status === 'active' && !this.isDeleted;
});

// =============================================
// STATICS
// =============================================
cylinderSchema.statics.findByTagCode = function (tagCode) {
  return this.findOne({
    tagCode: String(tagCode).toUpperCase(),
    isDeleted: false,
  });
};

cylinderSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    userId,
    isDeleted: false,
    status: { $in: ['active', 'in_transit', 'at_plant', 'under_inspection'] },
  }).sort({ createdAt: -1 });
};

// =============================================
// METHODS
// =============================================
cylinderSchema.methods.setCustodian = function (type, referenceId) {
  this.currentCustodian = {
    type,
    referenceId,
    since: new Date(),
  };
  return this.save();
};

module.exports =
  mongoose.models.Cylinder || mongoose.model('Cylinder', cylinderSchema);
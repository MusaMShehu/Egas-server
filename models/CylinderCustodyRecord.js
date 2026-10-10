const mongoose = require('mongoose');

/**
 * CylinderCustodyRecord — Immutable trail of who held the cylinder.
 *
 * One record per custody handover event:
 *   customer → agent
 *   agent → plant
 *   plant → agent
 *   agent → customer
 *   etc.
 */
const cylinderCustodyRecordSchema = new mongoose.Schema(
  {
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

    // ==================== FROM / TO ====================
    fromCustodian: {
      type: {
        type: String,
        enum: ['customer', 'agent', 'plant', 'egas', 'unknown'],
        required: true,
      },
      referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    toCustodian: {
      type: {
        type: String,
        enum: ['customer', 'agent', 'plant', 'egas', 'unknown'],
        required: true,
      },
      referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },

    // ==================== CONTEXT ====================
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
      index: true,
    },
    plantRefillRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
      default: null,
      index: true,
    },

    // ==================== ACTOR ====================
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
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
        type: [Number],
        default: undefined,
      },
    },

    // ==================== META ====================
    event: {
      type: String,
      enum: [
        'registered',           // initial handover to customer
        'collected_by_agent',   // agent picks up from customer
        'delivered_to_plant',   // agent drops at plant
        'collected_from_plant', // agent picks up from plant
        'delivered_to_customer',// agent returns to customer
        'reassigned',           // admin override
        'returned_to_egas',     // end of life
        'flagged',              // condition issue
      ],
      required: true,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
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
cylinderCustodyRecordSchema.index({ cylinderId: 1, createdAt: -1 });
cylinderCustodyRecordSchema.index({ deliveryId: 1 });
cylinderCustodyRecordSchema.index({ event: 1, createdAt: -1 });

// =============================================
// GUARD — Immutable
// =============================================
cylinderCustodyRecordSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('CylinderCustodyRecord is immutable.'));
});
cylinderCustodyRecordSchema.pre('findOneAndDelete', function (next) {
  next(new Error('CylinderCustodyRecord cannot be deleted.'));
});

module.exports =
  mongoose.models.CylinderCustodyRecord ||
  mongoose.model('CylinderCustodyRecord', cylinderCustodyRecordSchema);
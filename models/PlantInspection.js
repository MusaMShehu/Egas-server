const mongoose = require('mongoose');

/**
 * PlantInspection — Inspection record for a refill request.
 * One inspection per request (in normal flow).
 */
const plantInspectionSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
      required: true,
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillTransaction',
      default: null,
      index: true,
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },
    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cylinder',
      default: null,
    },

    inspectorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ==================== CHECKLIST ====================
    checklist: {
      valveCondition: {
        type: String,
        enum: ['pass', 'fail'],
        default: 'pass',
      },
      bodyCondition: {
        type: String,
        enum: ['pass', 'fail'],
        default: 'pass',
      },
      leakTest: {
        type: String,
        enum: ['pass', 'fail'],
        default: 'pass',
      },
      visibleDamage: {
        type: String,
        enum: ['none', 'minor', 'major'],
        default: 'none',
      },
      expiryValid: {
        type: String,
        enum: ['pass', 'fail'],
        default: 'pass',
      },
      suitabilityForRefill: {
        type: String,
        enum: ['pass', 'fail'],
        default: 'pass',
      },
    },

    // ==================== OUTCOME ====================
    outcome: {
      type: String,
      enum: ['approved', 'rejected'],
      required: true,
      index: true,
    },

    rejectionReason: {
      type: String,
      enum: [
        'valve_defect',
        'body_damage',
        'leak_detected',
        'expired',
        'unsafe',
        'wrong_size',
        'other',
        null,
      ],
      default: null,
    },
    rejectionNotes: { type: String, trim: true, maxlength: 500, default: null },

    // ==================== EVIDENCE ====================
    photos: [
      {
        public_id: String,
        url: String,
        secure_url: String,
        _id: false,
      },
    ],

    // ==================== WEIGHT SNAPSHOT ====================
    measuredWeightAtInspection: { type: Number, default: null, min: 0 },
  },
  {
    timestamps: true,
  }
);

// =============================================
// INDEXES
// =============================================
plantInspectionSchema.index({ requestId: 1 }, { unique: true });
plantInspectionSchema.index({ plantId: 1, outcome: 1, createdAt: -1 });
plantInspectionSchema.index({ inspectorId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PlantInspection ||
  mongoose.model('PlantInspection', plantInspectionSchema);
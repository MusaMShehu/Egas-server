const mongoose = require('mongoose');

/**
 * PlantPriceAgreement — Versioned ₦/kg rate for a partner plant.
 *
 * Historical refill transactions MUST reference the price agreement
 * that was in effect at the time of request.
 */
const plantPriceAgreementSchema = new mongoose.Schema(
  {
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },

    // ==================== RATE ====================
    pricePerKg: {
      type: Number,
      required: [true, 'Price per kg is required'],
      min: [0, 'Price per kg cannot be negative'],
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
      enum: ['NGN'],
    },

    // ==================== VALIDITY ====================
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveTo: {
      type: Date,
      default: null, // null = open-ended
    },

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: ['draft', 'active', 'superseded', 'cancelled'],
      default: 'active',
      index: true,
    },

    // ==================== AUDIT ====================
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
  }
);

// =============================================
// INDEXES
// =============================================
plantPriceAgreementSchema.index(
  { plantId: 1, status: 1, effectiveFrom: -1 }
);
plantPriceAgreementSchema.index({ effectiveFrom: -1 });

// =============================================
// VIRTUALS
// =============================================
plantPriceAgreementSchema.virtual('isActive').get(function () {
  if (this.status !== 'active') return false;
  const now = new Date();
  if (this.effectiveFrom > now) return false;
  if (this.effectiveTo && this.effectiveTo < now) return false;
  return true;
});

module.exports =
  mongoose.models.PlantPriceAgreement ||
  mongoose.model('PlantPriceAgreement', plantPriceAgreementSchema);
const mongoose = require('mongoose');

/**
 * PlantRefillTransaction — Plant-side execution record.
 * Created when the plant receives the cylinder.
 */
const plantRefillTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // Format: PT-000823
    },

    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantRefillRequest',
      required: true,
      unique: true,
      index: true,
    },

    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerPlant',
      required: true,
      index: true,
    },

    // ==================== SNAPSHOT ====================
    cylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cylinder',
    },
    cylinderTag: { type: String, uppercase: true, trim: true },

    requestedQuantity: { type: Number, default: null, min: 0 },
    plantConfirmedQuantity: { type: Number, default: null, min: 0 },
    variance: { type: Number, default: null },

    pricePerKg: { type: Number, default: null, min: 0 },
    totalValue: { type: Number, default: null, min: 0 },

    // ==================== ACTORS ====================
    plantStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // ==================== INSPECTION LINK ====================
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantInspection',
      default: null,
    },

    // ==================== STATUS ====================
    status: {
      type: String,
      enum: [
        'received',
        'inspection_pending',
        'approved',
        'rejected',
        'refilling',
        'quantity_recorded',
        'confirmed',
        'disputed',
        'reconciled',
        'settled',
        'void',
      ],
      default: 'received',
      index: true,
    },

    // ==================== TIMELINE ====================
    receivedAt: { type: Date, default: null },
    inspectedAt: { type: Date, default: null },
    refilledAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },

    // ==================== IDEMPOTENCY ====================
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // ==================== SETTLEMENT ====================
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantSettlement',
      default: null,
      index: true,
    },
    isSettled: { type: Boolean, default: false, index: true },

    notes: { type: String, trim: true, maxlength: 500, default: null },
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
plantRefillTransactionSchema.index({ plantId: 1, createdAt: -1 });
plantRefillTransactionSchema.index({ plantId: 1, isSettled: 1, status: 1 });
plantRefillTransactionSchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models.PlantRefillTransaction ||
  mongoose.model('PlantRefillTransaction', plantRefillTransactionSchema);
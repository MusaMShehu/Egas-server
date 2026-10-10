const mongoose = require('mongoose');

/**
 * PartnerPlant — An approved LPG refilling plant.
 *
 * Owns:
 *  - Staff users (via User.plantId)
 *  - Refill transactions
 *  - Price agreements
 *  - Settlements
 *
 * Scoping rule: ALL plant portal operations must verify req.user.plantId === this._id.
 */
const partnerPlantSchema = new mongoose.Schema(
  {
    // ==================== IDENTITY ====================
    name: {
      type: String,
      required: [true, 'Plant name is required'],
      unique: true,
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: [true, 'Plant code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9\-]{3,32}$/, 'Invalid plant code format'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    logo: {
      public_id: String,
      url: String,
      secure_url: String,
    },

    // ==================== CONTACT ====================
    contactPerson: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },

    // ==================== LOCATION ====================
    address: {
      type: String,
      required: [true, 'Plant address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      index: true,
    },
    gpsCoordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    serviceRadiusKm: {
      type: Number,
      default: 30,
      min: 1,
      max: 500,
    },

    // ==================== OPERATIONAL ====================
    status: {
      type: String,
      enum: ['pending_approval', 'active', 'suspended', 'inactive'],
      default: 'pending_approval',
      index: true,
    },
    operatingHours: {
      open: { type: String, default: '08:00' },   // HH:mm
      close: { type: String, default: '18:00' },  // HH:mm
      daysOpen: {
        type: [String],
        default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      },
    },

    // ==================== COMMERCIAL ====================
    currentPriceAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlantPriceAgreement',
      default: null,
    },
    priceHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PlantPriceAgreement',
      },
    ],

    // ==================== APPROVAL ====================
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, trim: true, default: null },

    // ==================== METRICS (denormalized) ====================
    metrics: {
      totalRefills: { type: Number, default: 0, min: 0 },
      totalKgSupplied: { type: Number, default: 0, min: 0 },
      totalRejected: { type: Number, default: 0, min: 0 },
      avgVariance: { type: Number, default: 0 },
      lastRefillAt: { type: Date, default: null },
    },

    // ==================== AUDIT ====================
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
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
partnerPlantSchema.index({ name: 1 }, { unique: true });
partnerPlantSchema.index({ code: 1 }, { unique: true });
partnerPlantSchema.index({ status: 1, city: 1 });
partnerPlantSchema.index({ gpsCoordinates: '2dsphere' });
partnerPlantSchema.index({ isDeleted: 1, status: 1 });

// =============================================
// VIRTUALS
// =============================================
partnerPlantSchema.virtual('isActive').get(function () {
  return this.status === 'active' && !this.isDeleted;
});

partnerPlantSchema.virtual('isOperational').get(function () {
  if (this.status !== 'active') return false;

  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = dayNames[now.getDay()];

  if (!this.operatingHours?.daysOpen?.includes(today)) return false;

  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const open = this.operatingHours?.open || '00:00';
  const close = this.operatingHours?.close || '23:59';

  return current >= open && current <= close;
});

// =============================================
// METHODS
// =============================================
partnerPlantSchema.methods.approve = async function (adminId) {
  this.status = 'active';
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  return this.save();
};

partnerPlantSchema.methods.suspend = async function (adminId, reason) {
  this.status = 'suspended';
  this.suspendedBy = adminId;
  this.suspendedAt = new Date();
  this.suspensionReason = reason;
  return this.save();
};

module.exports =
  mongoose.models.PartnerPlant ||
  mongoose.model('PartnerPlant', partnerPlantSchema);
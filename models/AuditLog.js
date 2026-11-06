// // models/AuditLog.js
// const mongoose = require('mongoose');

// const auditLogSchema = new mongoose.Schema({
//   user: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   action: {
//     type: String,
//     required: true,
//     enum: [
//       'CREATE_DELIVERY',
//       'UPDATE_DELIVERY',
//       'DELETE_DELIVERY',
//       'ASSIGN_AGENT',
//       'MARK_DELIVERED',
//       'MARK_FAILED',
//       'RECORD_PARTIAL',
//       'CONFIRM_DELIVERY',
//       'CONFIRM_REMNANT',
//       'REQUEST_REMNANT',
//       'PAUSE_SUBSCRIPTION',
//       'RESUME_SUBSCRIPTION',
//       'SYNC_DELIVERY'
//     ]
//   },
//   details: {
//     type: mongoose.Schema.Types.Mixed,
//     required: true
//   },
//   ip: String,
//   userAgent: String,
//   timestamp: {
//     type: Date,
//     default: Date.now,
//     index: true
//   }
// }, {
//   timestamps: true
// });

// // Index for efficient querying
// auditLogSchema.index({ user: 1, timestamp: -1 });
// auditLogSchema.index({ action: 1, timestamp: -1 });

// module.exports = mongoose.model('AuditLog', auditLogSchema);























// models/AuditLog.js
const mongoose = require('mongoose');

/**
 * AuditLog — Immutable operational audit trail.
 *
 * Rules:
 *  - Never delete or update audit records.
 *  - Store previous + new values for state transitions.
 *  - Actor is always recorded (user + role).
 *  - IP/user-agent/GPS captured where relevant.
 */
const auditLogSchema = new mongoose.Schema(
  {
    // Actor
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
      trim: true,
    },

    // Action
    action: {
      type: String,
      required: true,
      enum: [
        // ---- Existing delivery actions ----
        'CREATE_DELIVERY',
        'UPDATE_DELIVERY',
        'DELETE_DELIVERY',
        'ASSIGN_AGENT',
        'MARK_DELIVERED',
        'MARK_FAILED',
        'RECORD_PARTIAL',
        'CONFIRM_DELIVERY',
        'CONFIRM_REMNANT',
        'REQUEST_REMNANT',
        'PAUSE_SUBSCRIPTION',
        'RESUME_SUBSCRIPTION',
        'SYNC_DELIVERY',

        // ---- Cylinder domain ----
        'CYLINDER_REGISTERED',
        'CYLINDER_UPDATED',
        'CYLINDER_WEIGHT_RECORDED',
        'CYLINDER_PRE_FILL_RECORDED',
        'CYLINDER_POST_FILL_RECORDED',
        'CYLINDER_CUSTODY_CHANGED',
        'CYLINDER_FLAGGED',
        'CYLINDER_RETIRED',
        'CYLINDER_DEACTIVATED',

        // ---- Remnant ledger ----
        'REMNANT_ADDED',
        'REMNANT_CONSUMED',
        'REMNANT_CREDITED',
        'REMNANT_DEBITED',
        'REMNANT_EXPIRED',
        'REMNANT_ELIGIBILITY_UPDATED',

        // ---- Partner Plant ----
        'PLANT_CREATED',
        'PLANT_UPDATED',
        'PLANT_APPROVED',
        'PLANT_SUSPENDED',
        'PLANT_ACTIVATED',
        'PLANT_DEACTIVATED',
        'PLANT_PRICE_AGREEMENT_CREATED',
        'PLANT_PRICE_AGREEMENT_UPDATED',
        'PLANT_PRICE_AGREEMENT_CANCELLED',

        // ---- Plant Staff ----
        'PLANT_STAFF_ADDED',
        'PLANT_STAFF_REMOVED',
        'PLANT_STAFF_ROLE_CHANGED',
        'PLANT_STAFF_STATUS_CHANGED',

        // ---- Plant Refill Workflow ----
        'PLANT_REFILL_REQUEST_CREATED',
        'PLANT_REFILL_REQUEST_CANCELLED',
        'PLANT_REFILL_REQUEST_RETRY',
        'PLANT_RECEIVED_CYLINDER',
        'PLANT_INSPECTION_SUBMITTED',
        'PLANT_INSPECTION_APPROVED',
        'PLANT_INSPECTION_REJECTED',
        'PLANT_REFILL_STARTED',
        'PLANT_REFILL_QUANTITY_RECORDED',
        'PLANT_REFILL_CONFIRMED',
        'CYLINDER_COLLECTED_FROM_PLANT',
        'DELIVERY_ESCALATED',

        // ---- Reconciliation & Disputes ----
        'RECONCILIATION_STARTED',
        'RECONCILIATION_COMPLETED',
        'DISPUTE_CREATED',
        'DISPUTE_COMMENTED',
        'DISPUTE_RESOLVED',
        'DISPUTE_REJECTED',
        'ADJUSTMENT_CREATED',
        'ADJUSTMENT_APPROVED',

        // ---- Settlement ----
        'SETTLEMENT_CREATED',
        'SETTLEMENT_REVIEWED',
        'SETTLEMENT_APPROVED',
        'SETTLEMENT_PROCESSING',
        'SETTLEMENT_PAID',
        'SETTLEMENT_CANCELLED',

        // ---- System ----
        'CONFIG_UPDATED',
        'FEATURE_FLAG_UPDATED',
        'SYSTEM_MIGRATION',
      ],
      index: true,
    },

    // Entity context
    entityType: {
      type: String,
      trim: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    // State change
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Legacy details field (kept for backward compatibility)
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Context
    ip: String,
    userAgent: String,
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

    // Free-form metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Timestamps
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    // Audit logs are append-only: prevent updates & deletes
    strict: true,
  }
);

// =============================================
// INDEXES — optimized for common audit queries
// =============================================
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ 'metadata.plantId': 1, timestamp: -1 });
auditLogSchema.index({ 'metadata.deliveryId': 1, timestamp: -1 });
auditLogSchema.index({ 'metadata.cylinderId': 1, timestamp: -1 });

// =============================================
// GUARD — Block updates/deletes (append-only)
// =============================================
// Note: Application layer enforces this. Also enforce on the query layer.
auditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('AuditLog records are immutable.'));
});
auditLogSchema.pre('findOneAndDelete', function (next) {
  next(new Error('AuditLog records cannot be deleted.'));
});
auditLogSchema.pre('updateMany', function (next) {
  next(new Error('AuditLog records are immutable.'));
});
auditLogSchema.pre('deleteMany', function (next) {
  next(new Error('AuditLog records cannot be deleted.'));
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
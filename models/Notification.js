const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },

    type: {
      type: String,
      enum: [
        'account',
        'order',
        'subscription',
        'delivery',
        'refill',
        'wallet',
        'support',
        'promotional',
        'system',
      ],
      required: true,
      index: true,
    },

    subType: {
      type: String,
      enum: [
        // ---- Account ----
        'account_created',
        'email_verification',
        'password_reset',
        'password_reset_success',
        'account_locked',
        'suspicious_activity',

        // ---- Orders ----
        'order_created',
        'order_confirmed',
        'order_out_for_delivery',
        'order_delivered',
        'order_failed',
        'order_cancelled',

        // ---- Subscriptions ----
        'subscription_created',
        'subscription_delivery_reminder',
        'subscription_fulfilled',
        'subscription_ending_warning',
        'subscription_paused',
        'subscription_resumed',
        'subscription_cancelled',
        'subscription_renewal_due',

        // ---- Deliveries (generic) ----
        'delivery_scheduled',
        'delivery_fulfilled',
        'delivery_failed',
        'delivery_escalated',
        'delivery_paused',
        'delivery_resumed',

        // ---- Refill (plant workflow) ----
        'refill_request_created',
        'refill_request_received',
        'refill_inspection_pending',
        'refill_request_approved',
        'refill_request_rejected',
        'refill_quantity_recorded',
        'refill_request_confirmed',
        'refill_ready_for_collection',
        'refill_collected_from_plant',
        'refill_disputed',

        // ---- Wallet ----
        'wallet_topup_success',
        'wallet_topup_failed',
        'wallet_debited',
        'wallet_credited',

        // ---- Support ----
        'support_created',
        'support_resolved',
        'ticket_response',

        // ---- Promotional ----
        'promotional',

        // ---- System ----
        'system_update',
        'plant_approved',
        'plant_suspended',
        'plant_staff_invited',
      ],
      required: true,
      index: true,
    },

    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel',
    },
    relatedModel: {
      type: String,
      enum: [
        'Order',
        'Subscription',
        'SupportTicket',
        'Transaction',
        'Delivery',
        'PlantRefillRequest',
        'Cylinder',
        null,
      ],
      default: null,
    },
    deviceTokens: { type: [String], default: [] },

    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    archived: { type: Boolean, default: false, index: true },

    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },

    scheduledFor: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },

    sentVia: {
      type: [String],
      enum: ['push', 'in_app', 'email', 'sms'],
      default: ['in_app'],
    },
    deviceTokens: [String],

    // Idempotency — dedupe when retries happen
    idempotencyKey: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------- Indexes ----------
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, sentVia: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// idempotency key unique per user (nulls are allowed many times in Mongo)
notificationSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// ---------- Virtuals ----------
notificationSchema.virtual('isUnread').get(function () {
  return !this.read;
});

notificationSchema.virtual('formattedTime').get(function () {
  if (!this.createdAt) return '';
  return this.createdAt.toLocaleString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// ---------- Statics ----------
notificationSchema.statics.findForUser = function (userId, filter = {}, opts = {}) {
  const { page = 1, limit = 20, unreadOnly = false, type } = opts;
  const query = { userId, archived: { $ne: true }, ...filter };
  if (unreadOnly) query.read = false;
  if (type) query.type = type;

  const skip = (Math.max(1, page) - 1) * limit;
  return Promise.all([
    this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    this.countDocuments(query),
    this.countDocuments({ userId, read: false, archived: { $ne: true } }),
  ]);
};

module.exports = mongoose.model('Notification', notificationSchema);
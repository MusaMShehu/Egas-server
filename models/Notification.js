// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'account',
      'order',
      'subscription',
      'delivery', 
      'wallet',
      'support',
      'promotional',
      'system'
    ],
    required: true
  },
  subType: {
    type: String,
    enum: [
      // Account
      'account_created',
      
      // Orders
      'order_created',
      'order_confirmed',
      'order_out_for_delivery',
      'order_delivered',
      
      // Subscriptions
      'subscription_created',
      'subscription_delivery_reminder',
      'subscription_fulfilled',
      'subscription_ending_warning',
      'subscription_paused',
      'subscription_resumed',
      'subscription_cancelled',
      
      // Wallet
      'wallet_topup_success',
      
      // Support
      'support_resolved',
      
      // Promotional
      'promotional',
      
      // System
      'system_update'
    ],
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Order', 'Subscription', 'SupportTicket', 'Transaction', null]
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  scheduledFor: {
    type: Date,
    index: true
  },
  sentVia: {
    type: [String],
    enum: ['push', 'in_app', 'email', 'sms'],
    default: ['in_app']
  },
  deviceTokens: [String],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, sentVia: 1 });

// Virtual for formatted date
notificationSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

module.exports = mongoose.model('Notification', notificationSchema);
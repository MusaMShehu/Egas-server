// server/models/SMSLog.js
const mongoose = require('mongoose');

const SMSLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  to: {
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
      'verification',
      'account',
      'order_update',
      'order_confirmation',
      'order_delivery',
      'subscription',
      'subscription_reminder',
      'transactional',
      'wallet',
      'support',
      'security',
      'promotional',
      'marketing'
    ],
    required: true
  },
  provider: {
    type: String,
    default: 'sendchamp'
  },
  providerId: {
    type: String // Sendchamp message ID
  },
  status: {
    type: String,
    enum: ['processing', 'sent', 'delivered', 'failed', 'undelivered'],
    default: 'processing'
  },
  cost: {
    type: Number,
    default: null
  },
  route: {
    type: String,
    enum: ['dnd', 'non_dnd'],
    default: 'dnd'
  },
  errorMessage: String,
  providerResponse: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Index for better query performance
SMSLogSchema.index({ userId: 1, createdAt: -1 });
SMSLogSchema.index({ providerId: 1 });
SMSLogSchema.index({ status: 1 });

module.exports = mongoose.model('SMSLog', SMSLogSchema);
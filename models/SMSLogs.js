const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema({
    recipient: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: [
            'account_created',
            'order_created',
            'order_confirmed',
            'order_out_for_delivery',
            'order_delivered',
            'subscription_created',
            'subscription_reminder',
            'subscription_fulfilled',
            'subscription_ending',
            'subscription_paused',
            'subscription_resumed',
            'subscription_cancelled',
            'wallet_topup',
            'support_resolved',
            'promotional',
            'promotional_bulk'
        ]
    },
    status: {
        type: String,
        required: true,
        enum: ['sent', 'delivered', 'failed', 'pending'],
        default: 'pending'
    },
    provider: {
        type: String,
        default: 'sendchamp'
    },
    providerResponse: {
        type: mongoose.Schema.Types.Mixed
    },
    providerId: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

smsLogSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Indexes for better query performance
smsLogSchema.index({ recipient: 1, createdAt: -1 });
smsLogSchema.index({ type: 1, status: 1 });
smsLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SMSLog', smsLogSchema);
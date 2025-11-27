// server/models/SMSPreferences.js
const mongoose = require('mongoose');

const SMSPreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  preferences: {
    // Account notifications
    accountAlerts: { type: Boolean, default: true },
    
    // Order notifications
    orderUpdates: { type: Boolean, default: true },
    orderConfirmation: { type: Boolean, default: true },
    orderDelivery: { type: Boolean, default: true },
    
    // Subscription notifications
    subscriptionAlerts: { type: Boolean, default: true },
    subscriptionReminders: { type: Boolean, default: true },
    subscriptionChanges: { type: Boolean, default: true },
    
    // Transaction notifications
    transactionAlerts: { type: Boolean, default: true },
    walletUpdates: { type: Boolean, default: true },
    
    // Support notifications
    supportUpdates: { type: Boolean, default: true },
    
    // Security notifications
    securityAlerts: { type: Boolean, default: true },
    
    // Promotional notifications
    promotional: { type: Boolean, default: false },
    marketing: { type: Boolean, default: false },
    abandonedCart: { type: Boolean, default: true }
  },
  dailyLimit: {
    type: Number,
    default: 15
  },
  lastSent: Date,
  timezone: {
    type: String,
    default: 'UTC'
  },
  quietHours: {
    start: { type: String, default: '22:00' }, // 10 PM
    end: { type: String, default: '08:00' }    // 8 AM
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SMSPreferences', SMSPreferencesSchema);
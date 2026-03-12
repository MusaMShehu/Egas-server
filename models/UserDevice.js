// models/UserDevice.js
const mongoose = require('mongoose');

const userDeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceToken: {
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    enum: ['web', 'android', 'ios'],
    required: true
  },
  browser: String,
  deviceModel: String,
  osVersion: String,
  lastActive: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  fcmToken: String, // For Firebase Cloud Messaging
  apnsToken: String, // For Apple Push Notification Service
  preferences: {
    pushNotifications: {
      type: Boolean,
      default: true
    },
    promotional: {
      type: Boolean,
      default: true
    },
    orderUpdates: {
      type: Boolean,
      default: true
    },
    subscriptionReminders: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});


module.exports = mongoose.model('UserDevice', userDeviceSchema);
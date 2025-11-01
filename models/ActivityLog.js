const mongoose = require('mongoose');

const activityLogSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['user', 'order', 'payment', 'subscription', 'suppor', 'delivery', 'product', 'report', 'system'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
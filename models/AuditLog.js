// models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
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
      'SYNC_DELIVERY'
    ]
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  ip: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
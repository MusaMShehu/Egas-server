const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  reference: { 
    type: String, 
    // required: true, 
    unique: true 
  },
  orderId: { 
    type: String, 
    // required: false
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    // required: false 
  },
  email: { 
    type: String, 
    // required: true 
  },
  amount: { 
    type: Number, 
    // required: true 
  },
  currency: { 
    type: String, 
    default: 'NGN' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed', 'abandoned'], 
    default: 'pending' 
  },
  planName: String,
  size: String,
  frequency: String,
  metadata: mongoose.Schema.Types.Mixed,
  paystackData: mongoose.Schema.Types.Mixed,
  verifiedAt: Date,
  completedAt: Date,
  failedAt: Date
}, { 
  timestamps: true 
});

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ reference: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  email: { 
    type: String, 
    // required: true 
  },
  orderId: { 
    type: String, 
    // required: false
  },
  type: {
    type: String,
    enum: ['credit', 'debit', 'topup', 'refund', 'transfer'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative'],
    validate: {
      validator: Number.isFinite,
      message: 'Amount must be a number',
    },
  },
  balanceBefore: {
    type: Number,
    // required: true,
  },
  balanceAfter: {
    type: Number,
    // required: true,
  },
  reference: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  currency: { 
    type: String, 
    default: 'NGN' 
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'success', 'failed', 'reversed', 'abandoned'],
    default: 'pending',
    index: true,
  },
  reversalReason: String,
  reversedAt: Date,

  planName: String,
  size: String,
  frequency: String,
  metadata: mongoose.Schema.Types.Mixed,
  paystackData: mongoose.Schema.Types.Mixed,
  verifiedAt: Date,
  completedAt: Date,
  failedAt: Date
}, {
  timestamps: true,
});


module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
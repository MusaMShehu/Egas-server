const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    // required: true
  },
  transactionId: {
    type: String,
    // required: true,
    unique: true
  },
  amount: {
    type: Number,
    // required: true
  },
  description: {
    type: String,
    // required: true
  },
  reference: String,
  type: {
    type: String,
    enum: ['credit', 'debit'],
    // required: true
  },
  method: {
    type: String,
    enum: ['card', 'transfer', 'wallet', 'ussd'],
    // required: false
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  order: {
    type: mongoose.Schema.ObjectId,
    ref: 'Order'
  },
  subscription: {
    type: mongoose.Schema.ObjectId,
    ref: 'Subscription'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate transaction ID before saving
paymentSchema.pre('save', function(next) {
  if (!this.transactionId) {
    this.transactionId = `TX-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
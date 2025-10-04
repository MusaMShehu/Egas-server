const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0
  },
  transactions: [{
    amount: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['Credit', 'Debit'],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
});

module.exports = mongoose.model('Wallet', WalletSchema);
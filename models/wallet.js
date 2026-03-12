// const mongoose = require('mongoose');

// const WalletSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     unique: true
//   },
//   balance: {
//     type: Number,
//     default: 0
//   },
//   transactions: [{
//     amount: {
//       type: Number,
//       required: true
//     },
//     type: {
//       type: String,
//       enum: ['Credit', 'Debit'],
//       required: true
//     },
//     description: {
//       type: String,
//       required: true
//     },
//     date: {
//       type: Date,
//       default: Date.now
//     }
//   }]
// });

// module.exports = mongoose.model('Wallet', WalletSchema);






const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative'],
    validate: {
      validator: Number.isFinite,
      message: 'Balance must be a number',
    },
  },
  currency: {
    type: String,
    default: 'NGN',
    uppercase: true,
    enum: ['NGN'],
  },
  version: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastTransaction: {
    type: Date,
  },
  dailyLimit: {
    type: Number,
    default: 1000000,
  },
  monthlyLimit: {
    type: Number,
    default: 10000000,
  },
}, {
  timestamps: true,
});


module.exports = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
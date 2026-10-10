// const mongoose = require('mongoose');

// const walletSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     unique: true,
//     index: true,
//   },
//   balance: {
//     type: Number,
//     default: 0,
//     min: [0, 'Balance cannot be negative'],
//     validate: {
//       validator: Number.isFinite,
//       message: 'Balance must be a number',
//     },
//   },
//   currency: {
//     type: String,
//     default: 'NGN',
//     uppercase: true,
//     enum: ['NGN'],
//   },
//   version: {
//     type: Number,
//     default: 0,
//   },
//   isActive: {
//     type: Boolean,
//     default: true,
//   },
//   lastTransaction: {
//     type: Date,
//   },
//   dailyLimit: {
//     type: Number,
//     default: 1000000,
//   },
//   monthlyLimit: {
//     type: Number,
//     default: 10000000,
//   },
// }, {
//   timestamps: true,
// });


// module.exports = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);


























const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isFinite,
      message: 'Amount must be a number',
    },
  },
  type: {
    type: String,
    enum: ['Credit', 'Debit', 'Failed'],
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  reference: {
    type: String,
    trim: true,
    index: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const walletSchema = new mongoose.Schema(
  {
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
    // ✅ FIXED: Version field for optimistic locking
    version: {
      type: Number,
      default: 0,
    },
    // ✅ FIXED: Transactions array (referenced by multiple controllers)
    transactions: {
      type: [walletTransactionSchema],
      default: [],
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
  },
  {
    timestamps: true,
  }
);

// Indexes
walletSchema.index({ userId: 1 }, { unique: true });
walletSchema.index({ 'transactions.reference': 1 });

module.exports =
  mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
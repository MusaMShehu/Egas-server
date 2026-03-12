const mongoose = require('mongoose');
const { Wallet, Transaction } = require('../models/Wallet');
const { redisClient } = require('../config/redis');
const ErrorResponse = require('../utils/errorResponse');

class WalletService {
  async getWallet(userId, session = null) {
    let wallet = await Wallet.findOne({ userId }).session(session);
    
    if (!wallet) {
      wallet = await Wallet.create([{ userId, balance: 0 }], { session });
      wallet = wallet[0];
    }
    
    return wallet;
  }

  async processPayment(userId, amount, metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get or create wallet
      let wallet = await this.getWallet(userId, session);

      if (!wallet.isActive) {
        throw new ErrorResponse('Wallet is deactivated', 400);
      }

      if (wallet.balance < amount) {
        throw new ErrorResponse('Insufficient balance', 400);
      }

      // Check daily limits
      const todaySpent = await this.getTodaySpent(userId, session);
      if (todaySpent + amount > wallet.dailyLimit) {
        throw new ErrorResponse('Daily transaction limit exceeded', 400);
      }

      // Generate unique reference
      const reference = this.generateReference('PAY');

      // Record transaction before updating balance
      const transaction = new Transaction({
        walletId: wallet._id,
        userId,
        type: 'debit',
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance - amount,
        reference,
        description: metadata.description || 'Payment',
        metadata,
        status: 'pending',
      });

      // Atomic update with version check
      const updatedWallet = await Wallet.findOneAndUpdate(
        { 
          _id: wallet._id, 
          version: wallet.version,
          balance: { $gte: amount }
        },
        { 
          $inc: { balance: -amount, version: 1 },
          $set: { lastTransaction: new Date() }
        },
        { 
          session, 
          new: true,
          runValidators: true 
        }
      );

      if (!updatedWallet) {
        throw new ErrorResponse('Transaction failed. Please retry.', 409);
      }

      // Update transaction with completed status
      transaction.status = 'completed';
      transaction.balanceAfter = updatedWallet.balance;
      await transaction.save({ session });

      await session.commitTransaction();

      // Clear cache
      await redisClient.del(`wallet:${userId}`);
      await redisClient.del(`transactions:${userId}`);

      return {
        success: true,
        balance: updatedWallet.balance,
        transaction: transaction.toObject(),
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async creditWallet(userId, amount, metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await this.getWallet(userId, session);

      const reference = this.generateReference('CR');
      
      const transaction = new Transaction({
        walletId: wallet._id,
        userId,
        type: 'credit',
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance + amount,
        reference,
        description: metadata.description || 'Wallet credit',
        metadata,
        status: 'pending',
      });

      const updatedWallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id, version: wallet.version },
        { 
          $inc: { balance: amount, version: 1 },
          $set: { lastTransaction: new Date() }
        },
        { session, new: true }
      );

      if (!updatedWallet) {
        throw new ErrorResponse('Transaction failed. Please retry.', 409);
      }

      transaction.status = 'completed';
      transaction.balanceAfter = updatedWallet.balance;
      await transaction.save({ session });

      await session.commitTransaction();

      // Clear cache
      await redisClient.del(`wallet:${userId}`);

      return {
        success: true,
        balance: updatedWallet.balance,
        transaction: transaction.toObject(),
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async reverseTransaction(reference, reason) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const transaction = await Transaction.findOne({ reference }).session(session);
      
      if (!transaction) {
        throw new ErrorResponse('Transaction not found', 404);
      }

      if (transaction.status === 'reversed') {
        throw new ErrorResponse('Transaction already reversed', 400);
      }

      if (transaction.status !== 'completed') {
        throw new ErrorResponse('Only completed transactions can be reversed', 400);
      }

      const wallet = await Wallet.findOne({ userId: transaction.userId }).session(session);
      
      if (!wallet) {
        throw new ErrorResponse('Wallet not found', 404);
      }

      // Determine reversal direction
      const reversalAmount = transaction.type === 'debit' ? transaction.amount : -transaction.amount;

      // Create reversal transaction
      const reversalTransaction = new Transaction({
        walletId: wallet._id,
        userId: transaction.userId,
        type: transaction.type === 'debit' ? 'refund' : 'debit',
        amount: transaction.amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance + reversalAmount,
        reference: this.generateReference('REV'),
        description: `Reversal of ${reference}`,
        metadata: {
          originalTransaction: reference,
          reason,
        },
        status: 'pending',
      });

      const updatedWallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id, version: wallet.version },
        { 
          $inc: { balance: reversalAmount, version: 1 },
          $set: { lastTransaction: new Date() }
        },
        { session, new: true }
      );

      if (!updatedWallet) {
        throw new ErrorResponse('Reversal failed. Please retry.', 409);
      }

      reversalTransaction.status = 'completed';
      reversalTransaction.balanceAfter = updatedWallet.balance;
      await reversalTransaction.save({ session });

      // Update original transaction
      transaction.status = 'reversed';
      transaction.reversalReason = reason;
      transaction.reversedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        balance: updatedWallet.balance,
        reversalTransaction: reversalTransaction.toObject(),
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getWalletBalance(userId, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await redisClient.get(`wallet:${userId}`);
      if (cached !== null) {
        return cached;
      }
    }

    const wallet = await Wallet.findOne({ userId });
    const balance = wallet ? wallet.balance : 0;
    
    await redisClient.set(`wallet:${userId}`, balance, 300); // 5 minutes cache
    
    return balance;
  }

  async getTransactionHistory(userId, page = 1, limit = 20) {
    const cacheKey = `transactions:${userId}:${page}:${limit}`;
    
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return cached;
    }

    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments({ userId });

    const result = {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };

    await redisClient.set(cacheKey, result, 60); // 1 minute cache

    return result;
  }

  generateReference(prefix) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  async getTodaySpent(userId, session = null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await Transaction.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          type: 'debit',
          status: 'completed',
          createdAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]).session(session);

    return result.length > 0 ? result[0].total : 0;
  }
}

module.exports = new WalletService();
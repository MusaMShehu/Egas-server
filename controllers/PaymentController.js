const axios = require('axios');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Subscription = require("../models/Subscription");
const Order = require("../models/Order");
const User = require("../models/User");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const asyncHandler = require('../middleware/async');


const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';
const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/";



// @desc    Initialize a new transaction for subscription/purchase
// @route   POST /api/payments/initialize
// @access  Private
exports.initializeSubscriptionPayment = async (req, res) => {
  try {
    const { amount, email, planId, frequency, size, planName, reference, startDate, endDate, price } = req.body;
    const userId = req.user._id;

    console.log('Received payment initialization request:', {
      amount, email, planId, frequency, size, planName, reference, startDate, endDate, price, userId
    });

    // Validation
    if (!amount || !email || !userId) {
      return res.status(400).json({
        success: false,
        message: "Amount, email, and userId are required",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate plan exists if planId is provided
    if (planId) {
      const plan = await SubscriptionPlan.findOne({ 
        _id: planId, 
        isActive: true 
      });
      if (!plan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription plan'
        });
      }
    }

    // Calculate dates if not provided
    const subscriptionDates = calculateSubscriptionDates(frequency);
    const finalStartDate = startDate || subscriptionDates.startDate;
    const finalEndDate = endDate || subscriptionDates.endDate;
    // const finalReference = reference;
    // || `sub_${userId}_${Date.now()}`;
    const finalPrice = price || amount;

    // Metadata
    const metadata = {
      userId: userId.toString(),
      planId: planId,
      planName: planName,
      size: size,
      frequency: frequency,
      userEmail: email,
      userName: user.name,
      subscriptionId: `${planId}-${userId}-${Date.now()}`,
      startDate: finalStartDate,
      endDate: finalEndDate,
      // reference: finalReference,
      price: finalPrice
    };

    // Paystack payload
    const payload = {
      amount: Math.round(amount * 100),
      email: email,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      metadata: metadata,
    };

    console.log('Sending request to Paystack with payload:', {
      ...payload,
      amount: payload.amount,
      metadata: metadata
    });

    // Paystack request
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { data } = response.data;
    console.log('Paystack response received:', data);

    // Create subscription record with all required fields
    const subscriptionData = {
      subscriptionNumber: metadata.subscriptionId,
      userId: userId, 
      planName: planName,
      size: size,
      frequency: frequency,
      price: finalPrice,
      reference: data.reference,
      startDate: new Date(finalStartDate),
      endDate: new Date(finalEndDate),
      items: [
        {
          planName: planName,
          size: size,
          frequency: frequency,
          price: finalPrice,
          quantity: 1,
        },
      ],
      amount: amount,
      status: "pending",
      paymentStatus: "pending",
      paymentReference: data.reference,
    };

    console.log('Creating subscription with data:', subscriptionData);

    // Database records
    await Transaction.create({
      reference: data.reference,
      amount: amount,
      email: email,
      userId: userId,
      metadata: metadata,
      status: "pending",
      planName: planName,
      size: size,
      frequency: frequency,
    });

    await Subscription.create(subscriptionData);

    console.log('Subscription and transaction created successfully');

    // Response
    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      authorization_url: data.authorization_url,
      reference: data.reference,
      access_code: data.access_code,
      data: data,
    });

  } catch (error) {
    console.error('Payment initialization error:', error.response?.data || error.message);
    
    if (error.response?.data?.errors) {
      console.error('Validation errors:', error.response.data.errors);
    }

    return res.status(500).json({
      success: false,
      message: "Payment initialization failed",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    });
  }
};

// @desc    Verify transaction status
// @route   GET /api/payments/verify/:reference
// @access  Private
// @desc    Verify transaction status
// @route   GET /api/payments/verify/:reference
// @access  Private
exports.verifySubscriptioTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }

    console.log('Verifying transaction with reference:', reference);

    // Paystack verification
    const paystackResponse = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, 
      {
        headers: { 
          Authorization: `Bearer ${PAYSTACK_SECRET}` 
        }
      }
    );

    const paystackData = paystackResponse.data.data;
    console.log('Paystack verification response:', paystackData);

    // Check if transaction exists in our database
    let transaction = await Transaction.findOne({ reference: reference });
    
    if (!transaction) {
      // Create transaction if it doesn't exist (for direct verification)
      const metadata = paystackData.metadata || {};
      transaction = await Transaction.create({
        reference: reference,
        amount: paystackData.amount / 100,
        email: paystackData.customer?.email || metadata.userEmail,
        userId: metadata.userId,
        metadata: metadata,
        status: paystackData.status,
        paystackData: paystackData,
        verifiedAt: new Date()
      });
    } else {
      // Update existing transaction
      transaction = await Transaction.findOneAndUpdate(
        { reference: reference },
        { 
          status: paystackData.status,
          paystackData: paystackData,
          verifiedAt: new Date()
        },
        { new: true }
      );
    }

    // Fulfill subscription if successful
    if (paystackData.status === 'success') {
      try {
        await exports._fulfillSubscription(paystackData, transaction);
      } catch (fulfillError) {
        console.error('Subscription fulfillment error:', fulfillError);
        // Don't fail the entire verification if fulfillment fails
      }
    }

    // Response
    return res.json({
      success: true,
      message: 'Transaction verification completed',
      data: {
        status: paystackData.status,
        amount: paystackData.amount / 100,
        currency: paystackData.currency,
        transactionDate: paystackData.transaction_date,
        reference: paystackData.reference,
        metadata: paystackData.metadata
      },
      transaction: transaction
    });

  } catch (error) {
    console.error('Verify transaction error:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found on Paystack'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Transaction verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Paystack webhook handler
// @route   POST /api/payments/webhook
// @access  Public (Paystack calls this)
exports.handleWebhook= async (req, res) => {
  try {
    const rawBody = req.rawBody || req.body;
    const signature = req.headers['x-paystack-signature'];

    if (!signature) {
      console.warn('Missing Paystack signature');
      return res.status(400).send('Missing signature');
    }

    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET)
                       .update(rawBody)
                       .digest('hex');

    if (hash !== signature) {
      console.warn('Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString());
    console.log(`Webhook received: ${event.event}`);

    res.status(200).send('Webhook received');

    process.nextTick(async () => {
      try {
        switch (event.event) {
          case 'charge.success':
            await exports._handleSuccessfulCharge(event.data);
            break;
          case 'charge.failed':
            await exports._handleFailedCharge(event.data);
            break;
          case 'subscription.create':
            await exports._handleSubscriptionCreation(event.data);
            break;
          case 'subscription.disable':
            await exports._handleSubscriptionDisable(event.data);
            break;
          default:
            console.log(`Unhandled event type: ${event.event}`);
        }
      } catch (error) {
        console.error('Webhook processing error:', error);
      }
    });

  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).send('Webhook processing failed');
  }
};

// @desc    Get transaction history for a user
// @route   GET /api/payments/history/:userId
// @access  Private
exports.getTransactionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({ userId });

    res.json({
      success: true,
      data: transactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total: total
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history'
    });
  }
};

// @desc    Get subscription details for a user
// @route   GET /api/payments/subscription
// @access  Private
exports.getSubscriptionDetails = async (req, res) => {
  try {
    const userId = req.user._id;

    const subscription = await Subscription.findOne({ 
      userId: userId, 
      status: 'active' 
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    res.json({
      success: true,
      data: subscription
    });

  } catch (error) {
    console.error('Get subscription details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription details'
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

// Calculate subscription dates based on frequency
const calculateSubscriptionDates = (frequency) => {
  const startDate = new Date();
  const endDate = new Date();
  
  switch (frequency) {
    case "Daily":
      endDate.setDate(startDate.getDate() + 30);
      break;
    case "Weekly":
      endDate.setDate(startDate.getDate() + 30);
      break;
    case "Bi-Weekly":
      endDate.setDate(startDate.getDate() + 30);
      break;
    case "Monthly":
      endDate.setDate(startDate.getDate() + 30);
      break;
    case "One-Time":
      endDate.setDate(startDate.getDate() + 1);
      break;
    default:
      endDate.setDate(startDate.getDate() + 30);
  }
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
};

// Handle successful charge
exports._handleSuccessfulCharge = async (data) => {
  try {
    const reference = data.reference;
    console.log('Handling successful charge for reference:', reference);
    
    const transaction = await Transaction.findOneAndUpdate(
      { reference: reference },
      {
        status: 'success',
        paystackData: data,
        completedAt: new Date()
      },
      { new: true }
    );

    if (transaction) {
      await exports._fulfillSubscription(data, transaction);
    } else {
      const metadata = data.metadata || {};
      await Transaction.create({
        reference: reference,
        amount: data.amount ? data.amount / 100 : 0,
        email: data.customer?.email,
        userId: metadata.userId,
        metadata: metadata,
        status: 'success',
        paystackData: data,
        completedAt: new Date()
      });

      await exports._fulfillSubscription(data, { metadata, reference });
    }

    console.log(`Successfully processed charge for reference: ${reference}`);
  } catch (error) {
    console.error('Error handling successful charge:', error);
  }
};

// Handle failed charge
exports._handleFailedCharge = async (data) => {
  try {
    await Transaction.findOneAndUpdate(
      { reference: data.reference },
      {
        status: 'failed',
        paystackData: data,
        failedAt: new Date()
      }
    );

    await Subscription.findOneAndUpdate(
      { paymentReference: data.reference },
      {
        status: 'cancelled',
        paymentStatus: 'failed'
      }
    );

    console.log(`Marked transaction as failed: ${data.reference}`);
  } catch (error) {
    console.error('Error handling failed charge:', error);
  }
};

// Handle subscription creation
exports._handleSubscriptionCreation = async (data) => {
  try {
    console.log('Subscription created:', data);
  } catch (error) {
    console.error('Error handling subscription creation:', error);
  }
};

// Handle subscription disable
exports._handleSubscriptionDisable = async (data) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { paystackSubscriptionCode: data.subscription_code },
      {
        status: 'inactive',
        cancelledAt: new Date(),
        cancellationReason: 'disabled_via_webhook'
      },
      { new: true }
    );

    if (subscription) {
      await User.findByIdAndUpdate(subscription.userId, {
        $set: {
          'subscription.status': 'inactive',
          'subscription.cancelledAt': new Date()
        }
      });
    }

    console.log(`Subscription disabled: ${data.subscription_code}`);
  } catch (error) {
    console.error('Error handling subscription disable:', error);
  }
};

// Fulfill subscription after successful payment
exports._fulfillSubscription = async (paystackData, transaction) => {
  try {
    const amountInNaira = paystackData.amount / 100;
    const metadata = transaction.metadata || paystackData.metadata || {};
    const userId = metadata.userId || transaction.userId;

    console.log('Fulfilling subscription for user:', userId, 'with metadata:', metadata);

    if (!userId) {
      console.warn('No userId found in transaction metadata');
      return;
    }

    // Update subscription status to active
    const subscription = await Subscription.findOneAndUpdate(
      { paymentReference: transaction.reference },
      {
        status: 'active',
        paymentStatus: 'paid',
        paidAt: new Date(),
        amount: amountInNaira
      },
      { new: true }
    );

    console.log('Found existing subscription:', subscription);

    // If subscription doesn't exist, create it with all required fields
    if (!subscription) {
      const subscriptionData = {
        subscriptionNumber: metadata.subscriptionId || `sub_${userId}_${Date.now()}`,
        userId: userId, // Use userId field
        planName: metadata.planName,
        size: metadata.size,
        frequency: metadata.frequency,
        price: amountInNaira,
        reference: metadata.reference || transaction.reference,
        startDate: new Date(metadata.startDate || new Date()),
        endDate: new Date(metadata.endDate || calculateSubscriptionDates(metadata.frequency).endDate),
        items: [
          {
            planName: metadata.planName,
            size: metadata.size,
            frequency: metadata.frequency,
            price: amountInNaira,
            quantity: 1,
          },
        ],
        amount: amountInNaira,
        status: 'active',
        paymentStatus: 'paid',
        paymentReference: transaction.reference,
        paidAt: new Date()
      };

      console.log('Creating new subscription with data:', subscriptionData);
      await Subscription.create(subscriptionData);
    }

    // Update user subscription info
    if (metadata.frequency && metadata.frequency !== 'One-Time') {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'subscription.status': 'active',
          'subscription.planId': metadata.planId,
          'subscription.planName': metadata.planName,
          'subscription.startDate': new Date(metadata.startDate || new Date()),
          'subscription.endDate': new Date(metadata.endDate || calculateSubscriptionDates(metadata.frequency).endDate)
        }
      });
    }

    await exports._grantUserAccess(userId, metadata.planName, metadata.size);
    await exports._sendPaymentNotifications(userId, subscription, transaction);

    console.log(`Subscription fulfilled successfully for reference: ${transaction.reference}`);
  } catch (error) {
    console.error('Subscription fulfillment error:', error);
    throw error;
  }
};

// Grant user access based on purchased plan
exports._grantUserAccess = async (userId, planName, size = null) => {
  try {
    const accessRules = {
      'basic plan': { maxProjects: 3, storageLimit: '5GB', features: ['basic-support'] },
      'family plan': { maxProjects: 10, storageLimit: '20GB', features: ['priority-support', 'advanced-analytics'] },
      'business plan': { maxProjects: 50, storageLimit: '100GB', features: ['dedicated-support', 'custom-integrations'] },
      'custom plan': { maxProjects: 25, storageLimit: size ? `${size}` : '50GB', features: ['custom-support'] },
      'one-time purchase': { maxProjects: 5, storageLimit: '10GB', features: ['basic-support'] }
    };

    const planKey = (planName || '').toLowerCase();
    const planConfig = accessRules[planKey] || accessRules['basic plan'];
    
    await User.findByIdAndUpdate(userId, {
      $set: {
        'access.maxProjects': planConfig.maxProjects,
        'access.storageLimit': planConfig.storageLimit,
        'access.features': planConfig.features,
        'access.grantedAt': new Date(),
        'access.lastUpdated': new Date(),
        'access.planName': planName
      }
    });

    console.log(`Access granted for user ${userId} with plan: ${planName}`);
  } catch (error) {
    console.error('Error granting user access:', error);
  }
};

// Send payment notifications
exports._sendPaymentNotifications = async (userId, subscription, transaction) => {
  try {
    console.log(`Payment notifications sent for subscription: ${subscription?.subscriptionNumber}`);
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
};





// WALLET TOPUP WALLET TOPUP
// WALLET TOPUP WALLET TOPUP
// WALLET TOPUP WALLET TOPUP
// WALLET TOPUP WALLET TOPUP




// ✅ Initiate Top-up
exports.initiateTopup = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const paystackAmount = amount * 100;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      { email: user.email, amount: paystackAmount },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Save transaction as pending
    const transaction = await Transaction.create({
      userId: user._id,
      reference: response.data.data.reference,
      amount,
      status: "pending",
      type: "topup",
    });

    return res.status(200).json({
      success: true,
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
      transaction,
    });
  } catch (err) {
    console.error("Top-up initiation error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
      error: err.response?.data || err.message,
    });
  }
};

// ✅ Verify Top-up
exports.verifyTopup = async (req, res) => {
  try {
    const { reference } = req.query;
    const userId = req.user._id;

    if (!reference) {
      return res.status(400).json({ success: false, message: "Missing reference" });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );

    const data = response.data.data;
    const transaction = await Transaction.findOne({ reference });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (data.status === "success" && transaction.status !== "success") {
      transaction.status = "success";
      await transaction.save();

      const user = await User.findById(userId);
      user.walletBalance = (user.walletBalance || 0) + transaction.amount;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Top-up successful",
        walletBalance: user.walletBalance,
      });
    } else if (data.status !== "success") {
      transaction.status = "failed";
      await transaction.save();
      return res.status(400).json({ success: false, message: "Top-up failed" });
    }

    // Already verified
    const user = await User.findById(userId);
    return res.status(200).json({
      success: true,
      message: "Already verified",
      walletBalance: user.walletBalance,
    });
  } catch (err) {
    console.error("Verification error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};


// Wallet Top-Up Webhook
exports.handleWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers["x-paystack-signature"];

    // 🔐 1. Validate signature
    if (!signature) {
      console.warn("❌ Missing Paystack signature");
      return res.status(400).send("Missing signature");
    }

    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (hash !== signature) {
      console.warn("⚠️ Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    // ✅ 2. Parse event safely
    const event =
      typeof rawBody === "string" ? JSON.parse(rawBody) : req.body;

    console.log(`📬 Paystack Webhook received: ${event.event}`);
    res.status(200).send("Webhook received"); // respond early

    // ✅ 3. Process in background
    process.nextTick(async () => {
      try {
        if (event.event === "charge.success") {
          const data = event.data;

          // Extract details
          const reference = data.reference;
          const email = data.customer.email;
          const amount = data.amount / 100; // convert from kobo

          // Find user
          const user = await User.findOne({ email });
          if (!user) {
            console.warn(`⚠️ No user found for email: ${email}`);
            return;
          }

          // Check if this transaction already exists
          const existingPayment = await Payment.findOne({ reference });
          if (existingPayment) {
            console.log(`ℹ️ Payment ${reference} already processed`);
            return;
          }

          // ✅ Update wallet balance
          user.walletBalance += amount;
          await user.save();

          // ✅ Log transaction
          await Payment.create({
            user: user._id,
            reference,
            amount,
            type: "wallet_topup",
            status: "success",
            provider: "Paystack",
            metadata: data,
          });

          console.log(`✅ Wallet top-up successful for ${email} (+₦${amount})`);
        }

        else if (event.event === "charge.failed") {
          const data = event.data;
          const reference = data.reference;
          const email = data.customer.email;
          const amount = data.amount / 100;

          await Payment.create({
            reference,
            amount,
            status: "failed",
            type: "wallet_topup",
            provider: "Paystack",
            metadata: data,
          });

          console.warn(`❌ Wallet top-up failed for ${email} (₦${amount})`);
        }

        else {
          console.log(`ℹ️ Unhandled event type: ${event.event}`);
        }
      } catch (error) {
        console.error("🔥 Webhook processing error:", error);
      }
    });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    res.status(500).send("Webhook processing failed");
  }
};



// ✅ Get Wallet Balance
exports.getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, balance: user.walletBalance || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch balance" });
  }
};

// ✅ Get Payment History
exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (page < 1 || limit < 1) {
      return res.status(400).json({
        success: false,
        message: "Page and limit must be positive numbers",
      });
    }

    const skip = (page - 1) * limit;
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Transaction.countDocuments({ userId });
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        current: page,
        pages: totalPages,
        total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error("Error fetching payment history:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
    });
  }
};






// ORDER PAYMENT ---- ORDER PAYMENT
// ORDER PAYMENT ---- ORDER PAYMENT
// ORDER PAYMENT ---- ORDER PAYMENT
// ORDER PAYMENT ---- ORDER PAYMENT


//  @desc    Pay with Wallet
//  @route   POST /api/v1/orders/:id/pay/wallet
//  @access  Private

exports.payWithWallet = async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  const user = await User.findById(req.user._id);

  if (!order) return next(new ErrorResponse("Order not found", 404));
  if (order.isPaid) return next(new ErrorResponse("Order already paid", 400));

  if (user.walletBalance < order.totalAmount) {
    return next(new ErrorResponse("Insufficient wallet balance", 400));
  }

  // Deduct balance atomically
  user.walletBalance -= order.totalAmount;
  await user.save();

  // Mark order as paid
  order.isPaid = true;
  order.paidAt = Date.now();
  order.paymentMethod = "wallet";
  order.paymentResult = {
    status: "success",
    amount: order.totalAmount,
  };
  await order.save();

  res.json({ message: "Payment successful via wallet", order });
};


/**
 * @desc    Initialize Paystack payment
 * @route   POST /api/v1/orders/:id/paystack/init
 * @access  Private
 */
exports.initializeOrderPymentPaystack = async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate("user");
  if (!order) return next(new ErrorResponse("Order not found", 404));
  if (order.isPaid) return next(new ErrorResponse("Order already paid", 400));

  // Paystack requires amount in kobo (multiply by 100)
  const amountInKobo = Math.round(order.totalAmount * 100);

  try {
    const response = await axios.post(
      PAYSTACK_INITIALIZE_URL,
      {
        email: order.user.email,
        amount: amountInKobo,
        reference: `PSK-${order._id}-${Date.now()}`,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback/${order._id}`,
      },
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );

    const data = response.data.data;

    // Store reference in order for future verification
    order.paymentResult = {
      reference: data.reference,
      status: "pending",
    };
    await order.save();

    res.status(200).json({
      success: true,
      authorization_url: data.authorization_url,
      access_code: data.access_code,
      reference: data.reference,
    });
  } catch (err) {
    console.error("Paystack init error:", err.response?.data || err.message);
    return next(new ErrorResponse("Unable to initialize Paystack transaction", 500));
  }
};

/**
 * @desc    Confirm Paystack payment via verifying reference
 * @route   POST /api/v1/orders/:id/paystack/verify
 * @access  Private
 */
exports.confirmOrderPaymentPaystack = async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new ErrorResponse("Order not found", 404));

  const { reference } = req.body;
  if (!reference) return next(new ErrorResponse("Missing Paystack reference", 400));

  let verifyResp;
  try {
    verifyResp = await axios.get(`${PAYSTACK_VERIFY_URL}${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
  } catch (err) {
    console.error("Paystack verify error:", err.response?.data || err.message);
    return next(new ErrorResponse("Unable to verify payment", 500));
  }

  const { status, data } = verifyResp.data;
  if (!status || data.status !== "success") {
    return next(new ErrorResponse("Payment verification failed", 400));
  }

  const orderAmountInKobo = Math.round(order.totalAmount * 100);
  if (data.amount !== orderAmountInKobo) {
    return next(new ErrorResponse("Payment amount mismatch", 400));
  }

  order.isPaid = true;
  order.paidAt = Date.now();
  order.paymentMethod = "paystack";
  order.paymentResult = {
    id: data.id,
    status: data.status,
    reference: data.reference,
    gateway_response: data.gateway_response,
    paid_at: data.paid_at,
  };

  await order.save();

  res.json({ success: true, message: "Payment verified successfully", order });
};

/**
 * @desc    Paystack Webhook (optional but recommended)
 * @route   POST /webhooks/paystack
 * @access  Public
 */
exports.handleOrderPaymentPaystackWebhook = async (req, res, next) => {
  const signature = req.headers["x-paystack-signature"];
  const body = req.body;

  // ✅ Verify webhook signature
  const crypto = require("crypto");
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex");
  if (hash !== signature) {
    return res.status(400).send("Invalid signature");
  }

  const event = body.event;
  const eventData = body.data;

  if (event === "charge.success") {
    const reference = eventData.reference;
    const order = await Order.findOne({ "paymentResult.reference": reference });
    if (order && !order.isPaid) {
      order.isPaid = true;
      order.paidAt = Date.now();
      order.paymentMethod = "paystack";
      order.paymentResult = {
        id: eventData.id,
        status: eventData.status,
        reference: eventData.reference,
        gateway_response: eventData.gateway_response,
        paid_at: eventData.paid_at,
      };
      await order.save();
    }
  }

  res.status(200).send("ok");
};
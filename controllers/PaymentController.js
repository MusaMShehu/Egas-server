const axios = require("axios");
const crypto = require("crypto");
const Subscription = require("../models/Subscription");
const Order = require("../models/Order");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const asyncHandler = require("../middleware/async");
const NotificationService = require("../services/notificationService");
const emailService = require("../services/emailService");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = "https://api.paystack.co";
const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify/";


// WALLET TOPUP WALLET TOPUP
// WALLET TOPUP WALLET TOPUP
// WALLET TOPUP WALLET TOPUP

// ✅ Initiate Top-up
exports.initiateTopup = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        balance: 0,
        currency: "NGN",
        isActive: true,
      });
    }

    const paystackAmount = amount * 100;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: paystackAmount,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          type: "wallet",
          payment_type: "wallet",
          user_id: userId.toString(),
          amount: amount,
          // reference: response.data.data.reference,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Create transaction with all required fields
    const transaction = await Transaction.create({
      walletId: wallet._id,
      userId: user._id,
      email: user.email,
      type: "topup",
      amount: amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // Same as before since not yet credited
      reference: response.data.data.reference,
      description: `Wallet top-up of ₦${amount}`,
      status: "pending",
      metadata: {
        paystackReference: response.data.data.reference,
        amount: amount,
        email: user.email,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
      transaction: {
        id: transaction._id,
        reference: transaction.reference,
        amount: transaction.amount,
        status: transaction.status,
      },
    });
  } catch (err) {
    console.error(
      "Top-up initiation error:",
      err.response?.data || err.message,
    );
    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
      error: err.response?.data?.message || err.message,
    });
  }
};

// ✅ Verify Top-up - FIXED
exports.verifyTopup = async (req, res) => {
  try {
    const { reference } = req.query;
    const userId = req.user._id;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Missing transaction reference",
      });
    }

    // Find the transaction
    let transaction = await Transaction.findOne({ reference });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Verify with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      },
    );

    const paystackData = response.data.data;

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        balance: 0,
        currency: "NGN",
        isActive: true,
      });
    }

    // Check if already verified
    if (
      transaction.status === "success" ||
      transaction.status === "completed"
    ) {
      return res.status(200).json({
        success: true,
        message: "Transaction already verified",
        amount: transaction.amount,
        walletBalance: wallet.balance,
        reference: transaction.reference,
      });
    }

    // Handle successful payment
    if (paystackData.status === "success") {
      // Update transaction status
      transaction.status = "success";
      transaction.completedAt = new Date();
      transaction.paystackData = paystackData;
      transaction.balanceBefore = wallet.balance;
      transaction.balanceAfter = wallet.balance + transaction.amount;
      await transaction.save();

      // Update wallet balance
      const previousBalance = wallet.balance;
      wallet.balance += transaction.amount;
      wallet.lastTransaction = new Date();

      // Add transaction to wallet transactions array if it exists
      if (wallet.transactions && Array.isArray(wallet.transactions)) {
        wallet.transactions.push({
          amount: transaction.amount,
          type: "Credit",
          description: `Wallet top-up via Paystack (Ref: ${reference})`,
          date: new Date(),
        });
      }
      await wallet.save();

      // Create payment record
      await Payment.create({
        user: userId,
        reference: reference,
        amount: transaction.amount,
        type: "credit",
        status: "completed",
        method: "card",
        provider: "Paystack",
        transactionId: transaction._id,
        metadata: paystackData,
      });

      //✅ SMS NOTIFICATION: Send wallet topup success notification
      try {
        const user = await User.findById(userId);
        // if (user && user.phone && user.phoneVerified) {
        await NotificationService.sendWalletTopup(
          {
            amount: transaction.amount,
            paymentMethod: "Paystack",
            newBalance: wallet.balance,
            transactionId: transaction._id.toString(),
            reference: reference,
            date: new Date(),
          },
          user,
        );
        // }
      } catch (smsError) {
        console.error("Wallet topup SMS failed:", smsError);
      }

      // Send notifications (don't await to avoid blocking response)
      setTimeout(async () => {
        try {
          const user = await User.findById(userId);
          if (user) {
            // Send email notification
            await emailService
              .sendWalletTopupSuccess(user, {
                id: reference,
                amount: transaction.amount,
                paymentMethod: "Paystack",
                newBalance: wallet.balance,
                date: new Date(),
              })
              .catch((err) => console.error("Email error:", err));
          }
        } catch (notifError) {
          console.error("Notification error:", notifError);
        }
      }, 0);

      return res.status(200).json({
        success: true,
        message: "Top-up successful",
        amount: transaction.amount,
        walletBalance: wallet.balance,
        reference: transaction.reference,
      });
    }

    // Handle failed payment
    else if (
      paystackData.status === "failed" ||
      paystackData.status === "abandoned"
    ) {
      transaction.status = "failed";
      transaction.failedAt = new Date();
      transaction.paystackData = paystackData;
      await transaction.save();

      return res.status(400).json({
        success: false,
        message: "Payment failed or was abandoned",
        reference: transaction.reference,
        status: paystackData.status,
      });
    }

    // Handle pending (still waiting)
    else {
      return res.status(202).json({
        success: false,
        message: "Payment is still pending",
        reference: transaction.reference,
        status: paystackData.status,
      });
    }
  } catch (err) {
    console.error("Verification error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: "Verification failed",
      error: err.response?.data?.message || err.message,
    });
  }
};

// // controllers/paymentController.js
// exports.handlePaymentCallback = asyncHandler(async (req, res, next) => {
//   const { reference, trxref } = req.query;
//   const actualReference = reference || trxref;
//   const userAgent = req.headers["user-agent"] || "";

//   // Detect platform
//   const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
//   const isAndroid = /Android/i.test(userAgent);
//   const isExpo = /Expo|ExpoGo/i.test(userAgent);

//   // Deep link URL schemes for different platforms
//   let redirectUrl;

//   if (isIOS) {
//     // iOS deep link
//     redirectUrl = `Egas://subscriptions/payment-success?reference=${actualReference}`;
//   } else if (isAndroid) {
//     // Android deep link
//     redirectUrl = `Egas://subscriptions/payment-success?reference=${actualReference}`;
//   } else if (isExpo) {
//     // Expo Go deep link
//     redirectUrl = `exp://10.202.194.73:8081/--/subscriptions/payment-success?reference=${actualReference}`;
//   } else {
//     // Web redirect
//     redirectUrl = `${process.env.FRONTEND_URL}/subscriptions/payment-success?reference=${actualReference}`;
//   }

//   // HTML page with auto-redirect (fallback)
//   const html = `
//     <!DOCTYPE html>
//     <html>
//     <head>
//       <title>Redirecting...</title>
//       <meta charset="utf-8">
//       <meta http-equiv="refresh" content="2;url=${redirectUrl}">
//       <script>
//         setTimeout(function() {
//           window.location.href = "${redirectUrl}";
//         }, 1000);
//       </script>
//     </head>
//     <body>
//       <h2>Payment Processing Complete</h2>
//       <p>Redirecting back to app...</p>
//       <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a></p>
//     </body>
//     </html>
//   `;

//   res.send(html);
// });


// controllers/paymentController.js - Unified handlePaymentCallback

exports.handlePaymentCallback = asyncHandler(async (req, res, next) => {
  const { reference, trxref } = req.query;
  const actualReference = reference || trxref;
  const userAgent = req.headers['user-agent'] || '';
  
  // Detect platform
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isExpo = /Expo|ExpoGo/i.test(userAgent);
  const isMobile = isIOS || isAndroid || isExpo;
  
  let paymentType = 'unknown';
  let transactionData = null;
  
  // Determine payment type by checking transaction and metadata
  try {
    // First check Transaction model (for wallet topup)
    let transaction = await Transaction.findOne({ reference: actualReference });
    
    if (transaction) {
      // Found in Transaction model - this is a wallet topup
      paymentType = 'wallet';
      transactionData = {
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
      };
    } else {
      // Check Subscription model (for subscription payment)
      const subscription = await Subscription.findOne({ reference: actualReference });
      
      if (subscription) {
        // Found in Subscription model - this is a subscription payment
        paymentType = 'subscription';
        transactionData = {
          planName: subscription.planName,
          frequency: subscription.frequency,
          amount: subscription.amount,
          status: subscription.paymentStatus,
        };
      } else {
        // Try to fetch from Paystack to get metadata
        try {
          const paystackResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${actualReference}`,
            {
              headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
            }
          );
          
          const paystackData = paystackResponse.data.data;
          const metadata = paystackData.metadata || {};
          
          // Determine type from metadata
          if (metadata.type === 'subscription' || metadata.planId) {
            paymentType = 'subscription';
          } else if (metadata.type === 'wallet' || metadata.payment_type === 'wallet') {
            paymentType = 'wallet';
          } else {
            // Default to subscription if cannot determine
            paymentType = 'subscription';
          }
        } catch (error) {
          console.error('Error fetching from Paystack:', error.message);
          paymentType = 'subscription'; // Default fallback
        }
      }
    }
  } catch (error) {
    console.error('Error determining payment type:', error);
    paymentType = 'subscription'; // Default fallback
  }
  
  // Build redirect path based on payment type
  let redirectPath;
  let appRoute;
  
  switch (paymentType) {
    case 'wallet':
      redirectPath = 'payment/wallet-success';
      appRoute = 'wallet/callback';
      break;
    case 'subscription':
      redirectPath = 'subscriptions/payment-success';
      appRoute = 'subscriptions/callback';
      break;
    default:
      redirectPath = 'payment/status';
      appRoute = 'payment/status';
  }
  
  // Build redirect URL based on platform
  let redirectUrl;
  const baseUrl = process.env.FRONTEND_URL;
  const expoIp = process.env.EXPO_IP || '10.22.157.73';
  
  if (isIOS) {
    redirectUrl = `egas://${appRoute}?reference=${actualReference}&type=${paymentType}`;
  } else if (isAndroid) {
    redirectUrl = `egas://${appRoute}?reference=${actualReference}&type=${paymentType}`;
  } else if (isExpo) {
    redirectUrl = `exp://${expoIp}:8081/--/${redirectPath}?reference=${actualReference}&type=${paymentType}`;
  } else {
    // Web redirect
    redirectUrl = `${baseUrl}/${redirectPath}?reference=${actualReference}&type=${paymentType}`;
  }
  
  console.log(`Payment callback: Type=${paymentType}, Reference=${actualReference}, Platform=${isMobile ? 'Mobile' : 'Web'}, Redirect=${redirectUrl}`);
  
  // HTML page with auto-redirect and enhanced UI
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Processing Payment...</title>
      <meta charset="utf-8">
      <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: white;
          color: black;
        }
        
        .container {
          text-align: center;
          padding: 20px;
          max-width: 400px;
          width: 90%;
        }
        
        .spinner {
          border: 3px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top: 3px solid white;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        
        h2 {
          font-size: 24px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        
        .payment-type {
          background: rgba(255,255,255,0.2);
          padding: 6px 16px;
          border-radius: 20px;
          display: inline-block;
          font-size: 13px;
          margin: 15px 0;
          backdrop-filter: blur(10px);
        }
        
        .message {
          font-size: 14px;
          opacity: 0.9;
          margin-bottom: 20px;
          line-height: 1.5;
        }
        
        .reference {
          background: rgba(0,0,0,0.2);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-family: monospace;
          margin-top: 15px;
          word-break: break-all;
        }
        
        a {
          color: white;
          text-decoration: underline;
          opacity: 0.8;
        }
        
        .button {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          padding: 12px 24px;
          border-radius: 25px;
          text-decoration: none;
          color: white;
          margin-top: 20px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s ease;
        }
        
        .button:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }
        
        @media (max-width: 480px) {
          h2 { font-size: 20px; }
          .icon { font-size: 48px; }
        }
      </style>
      <script>
        let attempts = 0;
        const maxAttempts = 3;
        
        function redirect() {
          window.location.href = "${redirectUrl}";
        }
        
        function checkRedirect() {
          attempts++;
          if (attempts >= maxAttempts) {
            document.getElementById('manual-link').style.display = 'inline-block';
            document.getElementById('retry-btn').style.display = 'inline-block';
            document.getElementById('countdown').style.display = 'none';
          }
        }
        
        // Attempt redirect after delay
        setTimeout(function() {
          redirect();
        }, 2000);
        
        // Check after longer delay
        setTimeout(checkRedirect, 5000);
      </script>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <div class="icon">
          ${paymentType === 'wallet' ? '💰' : '📦'}
        </div>
        <h2>Payment Processing Complete</h2>
        <div class="payment-type">
          ${paymentType === 'wallet' ? 'Wallet Top-up' : 'Subscription Payment'}
        </div>
        <p class="message">
          ${paymentType === 'wallet' 
            ? 'Your wallet is being topped up. Please wait...' 
            : 'Your subscription is being activated. Please wait...'}
        </p>
        <div class="reference">
          Ref: ${actualReference}
        </div>
        <p id="countdown" style="margin-top: 20px; font-size: 12px;">
          Redirecting in a few seconds...
        </p>
        <div style="margin-top: 20px;">
          <a href="${redirectUrl}" id="manual-link" class="button" style="display: none;">Click here if not redirected</a>
          <a href="#" id="retry-btn" class="button" style="display: none; margin-left: 10px;" onclick="redirect(); return false;">Try Again</a>
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
});



// Wallet Top-Up Webhook
exports.handleWalletWebhook = async (req, res) => {
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
    const event = typeof rawBody === "string" ? JSON.parse(rawBody) : req.body;

    console.log(`📬 Paystack Webhook received: ${event.event}`);
    res.status(200).send("Webhook received"); // respond early

    // ✅ 3. Process asynchronously
    process.nextTick(async () => {
      try {
        const data = event.data;
        const reference = data.reference;
        const email = data.customer.email;
        const amount = data.amount / 100; // convert from kobo

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
          console.warn(`⚠️ No user found for email: ${email}`);
          return;
        }

        // Find or create the user's wallet
        let wallet = await Wallet.findOne({ userId: user._id });
        if (!wallet) {
          wallet = await Wallet.create({
            userId: user._id,
            balance: 0,
            transactions: [],
          });
          console.log(`🆕 Wallet created for ${email}`);
        }

        if (event.event === "charge.success") {
          // ✅ Credit wallet
          wallet.balance += amount;

          // ✅ Add a transaction record
          wallet.transactions.push({
            amount,
            type: "Credit",
            description: `Wallet top-up via Paystack`,
            date: new Date(),
          });

          await wallet.save();

          // (Optional) Log in Payment collection for audit
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

          // ✅ EMAIL NOTIFICATION: Send wallet top-up success email via webhook
          setTimeout(async () => {
            try {
              await emailService.sendWalletTopupSuccess(user, {
                id: reference,
                amount: amount,
                paymentMethod: "Paystack",
                newBalance: wallet.balance,
                date: new Date(),
              });
            } catch (emailError) {
              console.error("Failed to send wallet top-up email:", emailError);
            }
          }, 0);

          // ✅ SMS NOTIFICATION: Send wallet topup success notification via webhook
          try {
            // if (user && user.phone && user.phoneVerified) {
            await NotificationService.sendWalletTopup(
              {
                amount: amount,
                newBalance: newBalance,
                transactionId: reference,
                reference: reference,
              },
              user,
            );
            // }
          } catch (smsError) {
            console.error("Webhook wallet topup SMS failed:", smsError);
          }
        } else if (event.event === "charge.failed") {
          await Payment.create({
            user: user._id,
            reference,
            amount,
            type: "wallet_topup",
            status: "failed",
            provider: "Paystack",
            metadata: data,
          });

          // Optionally record a failed transaction in wallet history
          wallet.transactions.push({
            amount,
            type: "Failed",
            description: `Failed wallet top-up attempt`,
            date: new Date(),
          });
          await wallet.save();

          console.warn(`❌ Wallet top-up failed for ${email} (₦${amount})`);

          // ✅ SMS NOTIFICATION: Send wallet topup failed notification
          try {
            if (user && user.phone && user.phoneVerified) {
              await NotificationService.sendNotification(
                user.phone,
                `Wallet top-up of ₦${amount} failed. Please try again or contact support.`,
                "wallet_topup_failed",
                {
                  userId: user._id,
                  amount: amount,
                  reference: reference,
                },
              );
            }
          } catch (smsError) {
            console.error("Wallet topup failed SMS failed:", smsError);
          }
        } else {
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

// ✅ Get Wallet Balance - CORRECTED VERSION
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find the wallet document for this user
    let wallet = await Wallet.findOne({ userId });

    // If wallet doesn't exist, create one with zero balance
    if (!wallet) {
      wallet = await Wallet.create({
        userId: userId,
        balance: 0,
        currency: "NGN",
        isActive: true,
      });
    }

    res.status(200).json({
      success: true,
      balance: wallet.balance,
    });
  } catch (err) {
    console.error("Get wallet balance error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch balance",
    });
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

// exports.payWithWallet = async (req, res, next) => {
//   const order = await Order.findById(req.params.id);
//   const user = await User.findById(req.user._id);

//   if (!order) return next(new ErrorResponse("Order not found", 404));
//   if (order.isPaid) return next(new ErrorResponse("Order already paid", 400));

//   if (user.walletBalance < order.totalAmount) {
//     return next(new ErrorResponse("Insufficient wallet balance", 400));
//   }

//   // Deduct balance atomically
//   user.walletBalance -= order.totalAmount;
//   await user.save();

//   // Mark order as paid
//   order.isPaid = true;
//   order.paidAt = Date.now();
//   order.paymentMethod = "wallet";
//   order.paymentResult = {
//     status: "success",
//     amount: order.totalAmount,
//   };
//   await order.save();

//   res.json({ message: "Payment successful via wallet", order });
// };

// /**
//  * @desc    Initialize Paystack payment
//  * @route   POST /api/v1/orders/:id/paystack/init
//  * @access  Private
//  */
// exports.initializeOrderPymentPaystack = async (req, res, next) => {
//   const order = await Order.findById(req.params.id).populate("user");
//   if (!order) return next(new ErrorResponse("Order not found", 404));
//   if (order.isPaid) return next(new ErrorResponse("Order already paid", 400));

//   // Paystack requires amount in kobo (multiply by 100)
//   const amountInKobo = Math.round(order.totalAmount * 100);

//   try {
//     const response = await axios.post(
//       PAYSTACK_INITIALIZE_URL,
//       {
//         email: order.user.email,
//         amount: amountInKobo,
//         reference: `PSK-${order._id}-${Date.now()}`,
//         callback_url: `${process.env.FRONTEND_URL}/payment/callback/${order._id}`,
//       },
//       {
//         headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
//       }
//     );

//     const data = response.data.data;

//     // Store reference in order for future verification
//     order.paymentResult = {
//       reference: data.reference,
//       status: "pending",
//     };
//     await order.save();

//     res.status(200).json({
//       success: true,
//       authorization_url: data.authorization_url,
//       access_code: data.access_code,
//       reference: data.reference,
//     });
//   } catch (err) {
//     console.error("Paystack init error:", err.response?.data || err.message);
//     return next(new ErrorResponse("Unable to initialize Paystack transaction", 500));
//   }
// };

// /**
//  * @desc    Confirm Paystack payment via verifying reference
//  * @route   POST /api/v1/orders/:id/paystack/verify
//  * @access  Private
//  */
// exports.confirmOrderPaymentPaystack = async (req, res, next) => {
//   const order = await Order.findById(req.params.id);
//   if (!order) return next(new ErrorResponse("Order not found", 404));

//   const { reference } = req.body;
//   if (!reference) return next(new ErrorResponse("Missing Paystack reference", 400));

//   let verifyResp;
//   try {
//     verifyResp = await axios.get(`${PAYSTACK_VERIFY_URL}${encodeURIComponent(reference)}`, {
//       headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
//     });
//   } catch (err) {
//     console.error("Paystack verify error:", err.response?.data || err.message);
//     return next(new ErrorResponse("Unable to verify payment", 500));
//   }

//   const { status, data } = verifyResp.data;
//   if (!status || data.status !== "success") {
//     return next(new ErrorResponse("Payment verification failed", 400));
//   }

//   const orderAmountInKobo = Math.round(order.totalAmount * 100);
//   if (data.amount !== orderAmountInKobo) {
//     return next(new ErrorResponse("Payment amount mismatch", 400));
//   }

//   order.isPaid = true;
//   order.paidAt = Date.now();
//   order.paymentMethod = "paystack";
//   order.paymentResult = {
//     id: data.id,
//     status: data.status,
//     reference: data.reference,
//     gateway_response: data.gateway_response,
//     paid_at: data.paid_at,
//   };

//   await order.save();

//   res.json({ success: true, message: "Payment verified successfully", order });
// };

// /**
//  * @desc    Paystack Webhook (optional but recommended)
//  * @route   POST /webhooks/paystack
//  * @access  Public
//  */
// exports.handleOrderPaymentPaystackWebhook = async (req, res, next) => {
//   const signature = req.headers["x-paystack-signature"];
//   const body = req.body;

//   // ✅ Verify webhook signature
//   const crypto = require("crypto");
//   const hash = crypto
//     .createHmac("sha512", PAYSTACK_SECRET)
//     .update(JSON.stringify(body))
//     .digest("hex");
//   if (hash !== signature) {
//     return res.status(400).send("Invalid signature");
//   }

//   const event = body.event;
//   const eventData = body.data;

//   if (event === "charge.success") {
//     const reference = eventData.reference;
//     const order = await Order.findOne({ "paymentResult.reference": reference });
//     if (order && !order.isPaid) {
//       order.isPaid = true;
//       order.paidAt = Date.now();
//       order.paymentMethod = "paystack";
//       order.paymentResult = {
//         id: eventData.id,
//         status: eventData.status,
//         reference: eventData.reference,
//         gateway_response: eventData.gateway_response,
//         paid_at: eventData.paid_at,
//       };
//       await order.save();
//     }
//   }

//   res.status(200).send("ok");
// };

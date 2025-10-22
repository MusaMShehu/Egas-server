const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const paystack = require('../utils/paystack');
const crypto = require('crypto');

// ✅ CHANGED: Import delivery helper
const { generateDeliverySchedules } = require('../utils/deliveryHelper');

// @desc    Get all subscriptions
// @route   GET /api/v1/subscriptions
// @route   GET /api/v1/users/:userId/subscriptions
// @access  Private
exports.getSubscriptions = asyncHandler(async (req, res, next) => {
  if (req.params.userId) {
    const subscriptions = await Subscription.find({ userId: req.params.userId })
      // .populate('plan')
      .populate('userId', 'firstName lastName email phone');

    return res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions
    });
  } else {
    res.status(200).json(res.advancedResults);
  }
});

// @desc    Get single subscription
// @route   GET /api/v1/subscriptions/:id
// @access  Private
exports.getSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id)
    // .populate('plan')
    .populate('userId', 'firstName lastName email phone');

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is subscription owner or admin
  if (
    subscription.userId._id.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this subscription`,
        401
      )
    );
  }

  res.status(200).json({
    success: true,
    data: subscription
  });
});

// @desc    Create subscription
// @route   POST /api/v1/subscriptions
// @access  Private
exports.createSubscription = asyncHandler(async (req, res, next) => {

  if (!req.body || Object.keys(req.body).length === 0) {
    return next(new ErrorResponse('Request body is required', 400));
  }

  const { plan: planId, size, frequency, subscriptionPeriod, customPlan } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!planId || !size || !frequency) {
    return next(new ErrorResponse('Plan, size, and frequency are required', 400));
  }

  // Check if plan exists and is active
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    return next(new ErrorResponse(`No plan found with id ${planId}`, 404));
  }
  
  if (!plan.isActive) {
    return next(new ErrorResponse('This plan is currently not active', 400));
  }

  // Check for existing active subscription for the same plan
  const existingSubscription = await Subscription.findOne({ 
    userId, 
    plan: planId, 
    status: 'active' 
  });
  
  if (existingSubscription) {
    return next(new ErrorResponse('You already have an active subscription for this plan', 400));
  }

  // Calculate price using the same logic as frontend
  let price;
  try {
    if (plan.type === 'custom' && customPlan) {
      // For custom plans, use the custom plan data
      price = calculatePrice(plan, customPlan.size, customPlan.frequency, customPlan.subscriptionPeriod);
    } else if (plan.type === 'one-time') {
      // For one-time plans, use One-Time frequency and 1 month period
      price = calculatePrice(plan, size, "One-Time", 1);
    } else if (plan.type === 'emergency') {
      // For emergency plans, use One-Time frequency and 1 month period
      price = calculatePrice(plan, size, "One-Time", 1);
    } else {
      // For standard plans, use the provided parameters
      price = calculatePrice(plan, size, frequency, subscriptionPeriod);
    }
  } catch (error) {
    return next(new ErrorResponse('Error calculating price: ' + error.message, 400));
  }

  const startDate = new Date();
  
  // Calculate end date based on frequency and subscription period
  const calculateEndDate = (frequency, subscriptionPeriod = 1, planType = 'standard') => {
    const endDate = new Date(startDate);
    const periodMonths = subscriptionPeriod || 1;
    
    // For one-time and emergency plans, end date is the same as start date
    if (frequency === "One-Time" || planType === "one-time" || planType === "emergency") {
      return startDate;
    }
    
    // For all other plans, calculate based on frequency and subscription period
    switch (frequency) {
      case "Daily":
        endDate.setDate(endDate.getDate() + (30 * periodMonths)); // 30 days per month
        break;
      case "Weekly":
        endDate.setDate(endDate.getDate() + (7 * 4 * periodMonths)); // 4 weeks per month
        break;
      case "Bi-Weekly":
        endDate.setDate(endDate.getDate() + (7 * 2 * 4 * periodMonths)); // 2 weeks * 4 weeks per month
        break;
      case "Monthly":
      default:
        endDate.setMonth(endDate.getMonth() + periodMonths);
        break;
    }
    
    return endDate;
  };

  // Determine frequency for end date calculation
  let frequencyForEndDate = frequency;
  if (plan.type === 'one-time' || plan.type === 'emergency') {
    frequencyForEndDate = "One-Time";
  } else if (plan.type === 'custom' && customPlan) {
    frequencyForEndDate = customPlan.frequency;
  }

  const endDate = calculateEndDate(frequencyForEndDate, subscriptionPeriod, plan.type);

  // Initialize payment with Paystack
  let response;
  try {
    response = await paystack.post('/transaction/initialize', {
      email: req.user.email,
      amount: Math.round(price * 100), // Convert to kobo and ensure integer
      metadata: { 
        userId, 
        planId, 
        size: size,
        frequency,
        subscriptionPeriod: subscriptionPeriod || 1,
        planType: plan.type,
        customPlan: plan.type === 'custom' ? customPlan : undefined,
        type: 'subscription' 
      },
      callback_url: `${process.env.FRONTEND_URL}/subscriptions/verify`,
      webhook_url: `${process.env.BASE_URL}/api/v1/subscriptions/webhook`
    });
  } catch (error) {
    console.error('Paystack Error:', error.response?.data || error.message);
    return next(new ErrorResponse('Payment initialization failed: ' + (error.response?.data?.message || error.message), 500));
  }

  const { authorization_url, reference } = response.data.data;

  // Create pending subscription
  const subscriptionData = {
    userId,
    planName: plan.name,
    plan: planId,
    planType: plan.type,
    size: typeof size === 'string' && size.includes('kg') ? size : size + 'kg',
    frequency,
    subscriptionPeriod: subscriptionPeriod || 1,
    price,
    reference,
    status: 'pending',
    startDate,
    endDate
  };

  // Add custom plan details if it's a custom plan
  if (plan.type === 'custom' && customPlan) {
    subscriptionData.customPlanDetails = customPlan;
  }

  const subscription = await Subscription.create(subscriptionData);

  res.status(200).json({
    success: true,
    authorization_url,
    reference,
    data: subscription
  });
});

// Exact same pricing logic as frontend
const calculatePrice = (plan, size, frequency, subscriptionPeriod = 1) => {
  if (!plan) return 0;
  
  // Extract numeric size value - handle both "6kg" and "6" formats
  const sizeKg = parseInt(String(size).replace("kg", ""), 10) || parseInt(size, 10);
  
  // Calculate base price
  let baseAmount = sizeKg * (plan.pricePerKg || 0);
  
  // Apply frequency multiplier
  let frequencyMultiplier = 1;
  switch (frequency) {
    case "Daily": frequencyMultiplier = 30; break;
    case "Weekly": frequencyMultiplier = 4; break;
    case "Bi-Weekly": frequencyMultiplier = 2; break;
    default: frequencyMultiplier = 1; // Monthly or One-Time
  }
  
  // Apply subscription period (months)
  const totalAmount = baseAmount * frequencyMultiplier * subscriptionPeriod;
  
  return Math.round(totalAmount);
};

// Helper functions matching your frontend pattern
const getCustomPlanPrice = (plan, customPlanData) => {
  if (!plan) return 0;
  return calculatePrice(plan, customPlanData.size, customPlanData.frequency, customPlanData.subscriptionPeriod);
};

const getOneTimePlanPrice = (plan, size) => {
  if (!plan) return 0;
  return calculatePrice(plan, size, "One-Time", 1);
};

const getEmergencyPlanPrice = (plan, size) => {
  if (!plan) return 0;
  return calculatePrice(plan, size, "One-Time", 1);
};

// @desc    Verify subscription payment
// @route   GET /api/v1/subscriptions/verify
// @access  Private
exports.verifySubscriptionPayment = asyncHandler(async (req, res, next) => {
  const { reference } = req.query; // ✅ extract the actual reference string
  if (!reference) return next(new ErrorResponse('Reference missing', 400));

  let response;
  try {
    // ✅ Verify transaction with Paystack
    response = await paystack.get(`/transaction/verify/${reference}`);
  } catch (error) {
    console.error('Paystack Verification Error:', error.response?.data || error.message);
    return next(new ErrorResponse('Payment verification failed', 500));
  }

  const data = response.data.data;

  // ✅ Ensure payment was successful
  if (data.status !== 'success') {
    return next(new ErrorResponse('Payment not successful', 400));
  }

  // ✅ Mark subscription active / handle success
  await processSuccessfulPayment(data);

  // ✅ Fetch updated subscription
  const subscription = await Subscription.findOne({ reference })
    // .populate('plan')
    .populate('userId', 'firstName lastName email phone');

  if (!subscription) {
    return next(new ErrorResponse('Subscription not found after verification', 404));
  }

  // ✅ Always respond with JSON to avoid CORS redirect issues
  return res.status(200).json({
    success: true,
    message: "Payment verified successfully",
    subscriptionId: subscription._id,
    data: subscription,
  });
});


// @desc    Paystack Webhook Handler
// @route   POST /api/v1/subscriptions/webhook
// @access  Public (called by Paystack)

exports.handleWebhook = asyncHandler(async (req, res, next) => {
  // Validate webhook signature
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    console.error('Webhook signature missing');
    return res.status(400).json({ status: false, message: 'Signature missing' });
  }

  // Verify webhook signature
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== signature) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ status: false, message: 'Invalid signature' });
  }

  const event = req.body;
  console.log('Webhook received:', event.event, 'Reference:', event.data?.reference);

  // Immediately respond to Paystack to prevent timeout
  res.status(200).json({ status: true, message: 'Webhook received' });

  // Process the webhook event asynchronously
  try {
    switch (event.event) {
      case 'charge.success':
        await handleSuccessfulCharge(event.data);
        break;
      
      case 'subscription.create':
        await handleSubscriptionCreate(event.data);
        break;
      
      case 'subscription.disable':
        await handleSubscriptionDisable(event.data);
        break;
      
      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;
      
      case 'transfer.failed':
        await handleTransferFailed(event.data);
        break;
      
      case 'transfer.reversed':
        await handleTransferReversed(event.data);
        break;
      
      default:
        console.log('Unhandled webhook event:', event.event);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
});

// Handle successful charge event
const handleSuccessfulCharge = async (data) => {
  try {
    const { reference, metadata, status } = data;
    
    if (status === 'success') {
      await processSuccessfulPayment(data);
    }
  } catch (error) {
    console.error('Error handling successful charge:', error);
  }
};

// ✅ CHANGED: REMOVED OLD generateDeliverySchedules function
// The function has been moved to deliveryHelper.js

// Process successful payment
const processSuccessfulPayment = async (data) => {
  const { reference, metadata, amount } = data;
  const { userId, planId, size, frequency, subscriptionPeriod, type, subscriptionId } = metadata;

  // Handle renewal payments
  if (type === "renewal" && subscriptionId) {
    return await processRenewalPayment(subscriptionId, reference);
  }

  // ✅ Try to find subscription by ID first, fallback to reference
  let subscription = null;

  if (subscriptionId) {
    subscription = await Subscription.findById(subscriptionId);
  }

  if (!subscription) {
    subscription = await Subscription.findOne({
      $or: [{ reference }, { paystackReference: reference }],
      status: "pending",
    });
  }

  if (!subscription) {
    console.error("Subscription not found for ID or reference:", subscriptionId || reference);
    return;
  }

  // ✅ Activate the subscription
  subscription.status = "active";
  subscription.paidAt = new Date();
  await subscription.save();

  console.log("Subscription activated successfully:", subscription._id);

  // ✅ CHANGED: Use delivery helper instead of inline function
  try {
    const deliveryResult = await generateDeliverySchedules(subscription, {
      logProgress: true,
      overrideExisting: false // Don't override existing deliveries
    });
    
    console.log(`✅ ${deliveryResult.count} delivery schedules generated for subscription:`, subscription._id);
  } catch (scheduleError) {
    console.error("❌ Delivery schedule generation failed:", scheduleError);
    // Don't fail the whole process if schedule generation fails
  }

  // ✅ Create initial order for the subscription
  try {
    const User = require("../models/User");
    const user = await User.findById(userId).lean();

    const order = await Order.create({
      orderId: `ORD-${Date.now()}`,
      user: userId,
      products: [
        {
          product: planId,
          productName: subscription.planName,
          quantity: 1,
          price: subscription.price,
        },
      ],
      totalAmount: subscription.price,
      deliveryAddress: user?.address || "Not provided",
      deliveryOption: "standard",
      paymentMethod: "card",
      paymentStatus: "completed",
      orderStatus: "processing",
      subscription: subscription._id,
      reference,
      paymentDetails: {
        gateway: "paystack",
        amount: amount / 100,
        currency: "NGN",
        paidAt: new Date(),
      },
    });

    // Link order to subscription
    subscription.order = order._id;
    await subscription.save();

    console.log("Order created for subscription:", subscription._id);
  } catch (orderError) {
    console.error("Order creation error:", orderError);
  }

  // Send confirmation email or notification here
  // await sendSubscriptionConfirmation(subscription);
};

// Process renewal payment
const processRenewalPayment = async (subscriptionId, reference) => {
  try {
    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
      console.error('Renewal subscription not found:', subscriptionId);
      return;
    }

    // Update subscription status to active
    subscription.status = 'active';
    subscription.paidAt = new Date();
    subscription.reference = reference;
    await subscription.save();

    // ✅ CHANGED: Use delivery helper for renewal
    try {
      const deliveryResult = await generateDeliverySchedules(subscription, {
        logProgress: true
      });
      console.log("✅ Delivery schedules generated for renewal:", deliveryResult);
    } catch (scheduleError) {
      console.error("❌ Error generating delivery schedules for renewal:", scheduleError);
    }

    // Create order for renewal
    try {
      // Fetch user profile to get their delivery address (if applicable)
      const User = require("../models/User");
      const user = await User.findById(subscription.userId).lean();

      const order = await Order.create({
        orderId: `ORD-${Date.now()}`, // generate a unique order ID
        user: subscription.userId,
        products: [
          {
            product: subscription.plan,
            productName: subscription.planName,
            quantity: 1,
            price: subscription.price,
          },
        ],
        totalAmount: subscription.price,
        deliveryAddress: user?.address || "Not provided", // fallback if address not stored
        deliveryOption: "standard",
        paymentMethod: "card",
        paymentStatus: "completed",
        orderStatus: "processing",
        subscription: subscription._id,
        reference: reference,
        isRenewalOrder: true,
        paymentDetails: {
          gateway: "paystack",
          amount: subscription.price,
          currency: "NGN",
          paidAt: new Date(),
        },
      });

      subscription.order = order._id;
      await subscription.save();
    } catch (orderError) {
      console.error('Renewal order creation error:', orderError);
    }

    console.log('Subscription renewed successfully:', subscription._id);
    
    // Send renewal confirmation
    // await sendRenewalConfirmation(subscription);
  } catch (error) {
    console.error('Renewal processing failed:', error);
    throw error;
  }
};

// Handle subscription creation (for recurring payments)
const handleSubscriptionCreate = async (data) => {
  try {
    console.log('Subscription created in Paystack:', data);
    // This would be used if you implement recurring payments through Paystack
  } catch (error) {
    console.error('Error handling subscription create:', error);
  }
};

// Handle subscription disable
const handleSubscriptionDisable = async (data) => {
  try {
    const { subscription_code } = data;
    // Find and cancel the subscription in your system
    const subscription = await Subscription.findOne({ 
      paystackSubscriptionCode: subscription_code 
    });
    
    if (subscription) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      await subscription.save();
      console.log('Subscription cancelled via webhook:', subscription._id);
    }
  } catch (error) {
    console.error('Error handling subscription disable:', error);
  }
};

// Handle transfer success
const handleTransferSuccess = async (data) => {
  try {
    console.log('Transfer successful:', data);
    // Handle successful transfers to vendors or partners
  } catch (error) {
    console.error('Error handling transfer success:', error);
  }
};

// Handle transfer failed
const handleTransferFailed = async (data) => {
  try {
    console.log('Transfer failed:', data);
    // Handle failed transfers
  } catch (error) {
    console.error('Error handling transfer failed:', error);
  }
};

// Handle transfer reversed
const handleTransferReversed = async (data) => {
  try {
    console.log('Transfer reversed:', data);
    // Handle reversed transfers
  } catch (error) {
    console.error('Error handling transfer reversed:', error);
  }
};
// Send subscription confirmation (placeholder)
// const sendSubscriptionConfirmation = async (subscription) => {
//   try {
//     // Implement email sending logic here
//     console.log('Sending subscription confirmation for:', subscription._id);
//     // await sendEmail({
//     //   to: subscription.userId.email,
//     //   subject: 'Subscription Confirmed',
//     //   template: 'subscription-confirmation',
//     //   data: { subscription }
//     // });
//   } catch (error) {
//     console.error('Error sending confirmation email:', error);
//   }
// };

// Send renewal confirmation (placeholder)
// const sendRenewalConfirmation = async (subscription) => {
//   try {
//     // Implement email sending logic here
//     console.log('Sending renewal confirmation for:', subscription._id);
//     // await sendEmail({
//     //   to: subscription.userId.email,
//     //   subject: 'Subscription Renewed',
//     //   template: 'subscription-renewal',
//     //   data: { subscription }
//     // });
//   } catch (error) {
//     console.error('Error sending renewal email:', error);
//   }
// };

// @desc    Update subscription
// @route   PUT /api/v1/subscriptions/:id
// @access  Private
exports.updateSubscription = asyncHandler(async (req, res, next) => {
  let subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is subscription owner or admin
  if (
    subscription.userId.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to update this subscription`,
        401
      )
    );
  }

  // Don't allow updating active subscriptions to pending
  if (req.body.status === 'pending' && subscription.status === 'active') {
    return next(new ErrorResponse('Cannot change active subscription to pending', 400));
  }

  // Don't allow updating certain fields directly
  const allowedUpdates = ['status', 'frequency', 'size'];
  const updates = Object.keys(req.body);
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));
  
  if (!isValidOperation) {
    return next(new ErrorResponse('Invalid updates!', 400));
  }

  subscription = await Subscription.findByIdAndUpdate(
    req.params.id, 
    req.body, 
    {
      new: true,
      runValidators: true
    }
  ).populate('plan').populate('userId', 'firstName lastName email phone');

  res.status(200).json({
    success: true,
    data: subscription
  });
});


// @desc    Pause a subscription
// @route   PUT /api/v1/subscriptions/:id/pause
// @access  Private
exports.pauseSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!subscription) {
    return next(new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404));
  }

  if (subscription.status !== 'active') {
    return next(new ErrorResponse('Only active subscriptions can be paused', 400));
  }

  const now = new Date();
  const remainingTimeMs = subscription.endDate - now;

  // ✅ Calculate remaining time in days (rounded down)
  const remainingDays = Math.max(Math.floor(remainingTimeMs / (1000 * 60 * 60 * 24)), 0);

  subscription.remainingDuration = Math.max(remainingTimeMs, 0); // keep milliseconds for accuracy
  subscription.remainingDays = remainingDays; // store in days for frontend
  subscription.pausedAt = now;
  subscription.status = 'paused';

  // ✅ Ensure planType is set before saving (prevents validation error)
  if (!subscription.planType && subscription.plan?.type) {
    subscription.planType = subscription.plan.type;
  }

  await subscription.save({ validateBeforeSave: false }); // skip validation for missing fields

  res.status(200).json({
    success: true,
    message: `Subscription paused successfully with ${remainingDays} day(s) remaining.`,
    data: {
      id: subscription._id,
      status: subscription.status,
      remainingDays,
      pausedAt: subscription.pausedAt,
      endDate: subscription.endDate
    }
  });
});


// @desc    Resume a paused subscription
// @route   PUT /api/v1/subscriptions/:id/resume
// @access  Private
exports.resumeSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!subscription) {
    return next(new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404));
  }

  if (subscription.status !== 'paused') {
    return next(new ErrorResponse('Only paused subscriptions can be resumed', 400));
  }

  if (!subscription.remainingDuration) {
    return next(new ErrorResponse('No remaining duration stored. Cannot resume.', 400));
  }

  const now = new Date();
  const pausedDurationMs = now - subscription.pausedAt;

  // Extend endDate by the remaining duration
  const newEndDate = new Date(now.getTime() + subscription.remainingDuration);

  if (!subscription.pauseHistory) subscription.pauseHistory = [];
  subscription.pauseHistory.push({
    pausedAt: subscription.pausedAt,
    resumedAt: now,
    durationMs: pausedDurationMs
  });

  subscription.status = 'active';
  subscription.pausedAt = null;
  subscription.remainingDuration = null;
  subscription.remainingDays = null;
  subscription.startDate = now;
  subscription.endDate = newEndDate;

  // ✅ Ensure planType is set before saving
  if (!subscription.planType && subscription.plan?.type) {
    subscription.planType = subscription.plan.type;
  }

  await subscription.save({ validateBeforeSave: false });

  const daysRemaining = Math.max(
    Math.floor((subscription.endDate - now) / (1000 * 60 * 60 * 24)),
    0
  );

  res.status(200).json({
    success: true,
    message: `Subscription resumed successfully. ${daysRemaining} day(s) remaining.`,
    data: {
      id: subscription._id,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      remainingDays: daysRemaining
    }
  });
});


// @desc    Cancel subscription (Admin only)
// @route   PUT /api/v1/subscriptions/:id/cancel
// @access  Private/Admin
exports.cancelSubscription = asyncHandler(async (req, res, next) => {
  let subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  if (subscription.status === 'cancelled') {
    return next(new ErrorResponse('Subscription is already cancelled', 400));
  }

  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  await subscription.save();
  
  // await subscription.populate('plan');
  // await subscription.populate('userId', 'firstName lastName email phone');

  res.status(200).json({
    success: true,
    data: subscription,
    message: 'Subscription cancelled successfully'
  });
});

// @desc    Get logged-in user's subscriptions
// @route   GET /api/v1/subscriptions/my-subscriptions
// @access  Private
exports.getMySubscriptions = asyncHandler(async (req, res, next) => {
  const subscriptions = await Subscription.find({
    userId: req.user.id,
    status: { $in: ["active", "paused"] } // ✅ Fetch only active and paused subscriptions
  })
    // .populate('plan')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions
  });
});

// @desc    Cancel user's own subscription
// @route   PUT /api/v1/subscriptions/:id/cancel-my
// @access  Private
exports.cancelMySubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404)
    );
  }

  if (subscription.status === 'cancelled') {
    return next(new ErrorResponse('Subscription is already cancelled', 400));
  }

  subscription.status = 'cancelled';
  subscription.cancelledAt = new Date();
  await subscription.save();

  res.status(200).json({
    success: true,
    data: subscription,
    message: 'Subscription cancelled successfully'
  });
});

// @desc    Renew subscription
// @route   POST /api/v1/subscriptions/:id/renew
// @access  Private
exports.renewSubscription = asyncHandler(async (req, res, next) => {
  const oldSubscription = await Subscription.findOne({
    _id: req.params.id,
    userId: req.user.id
  }).populate('plan');

  if (!oldSubscription) {
    return next(
      new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404)
    );
  }

  if (!['cancelled', 'expired'].includes(oldSubscription.status)) {
    return next(
      new ErrorResponse('Only cancelled or expired subscriptions can be renewed', 400)
    );
  }

  // Check if plan is still active
  if (!oldSubscription.plan.isActive) {
    return next(new ErrorResponse('This plan is no longer available', 400));
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1); // Default to 1 month renewal

  // Create new subscription based on old one
  const newSubscription = await Subscription.create({
    userId: req.user.id,
    planName: oldSubscription.planName,
    plan: oldSubscription.plan._id,
    size: oldSubscription.size,
    frequency: oldSubscription.frequency,
    price: oldSubscription.price,
    status: 'pending', // Will be activated after payment
    startDate,
    endDate
  });

  // Initialize payment for renewal
  let response;
  try {
    response = await paystack.post('/transaction/initialize', {
      email: req.user.email,
      amount: Math.round(oldSubscription.price * 100),
      metadata: { 
        userId: req.user.id,
        planId: oldSubscription.plan._id,
        subscriptionId: newSubscription._id,
        type: 'renewal' 
      },
      callback_url: `${process.env.FRONTEND_URL}/subscriptions/verify`,
      webhook_url: `${process.env.BASE_URL}/api/v1/subscriptions/webhook`
    });
  } catch (error) {
    console.error('Paystack Renewal Error:', error.response?.data || error.message);
    // Delete the pending subscription if payment fails
    await Subscription.findByIdAndDelete(newSubscription._id);
    return next(new ErrorResponse('Renewal payment initialization failed: ' + (error.response?.data?.message || error.message), 500));
  }

  const { authorization_url, reference } = response.data.data;

  // Update subscription with payment reference
  newSubscription.reference = reference;
  await newSubscription.save();

  res.status(200).json({
    success: true,
    authorization_url,
    reference,
    data: newSubscription,
    message: 'Subscription renewal initiated'
  });
});

// @desc    Process subscription deliveries
// @route   GET /api/v1/subscriptions/process
// @access  Private/Admin
exports.processSubscriptions = asyncHandler(async (req, res, next) => {
  const today = new Date();

  // Get all active subscriptions still within validity period
  const subscriptions = await Subscription.find({
    status: { $in: ['active'] },
    endDate: { $gte: today },
  })
    .populate('plan')
    .populate('userId');

  if (subscriptions.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No active subscriptions to process',
    });
  }

  const results = [];
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      // ⛔ Skip paused subscriptions (extra safety)
      if (subscription.status === 'paused') {
        console.log(`Skipping paused subscription: ${subscription._id}`);
        continue;
      }

      // Check if delivery is due
      const shouldDeliver = await checkDeliveryDue(subscription, today);
      if (!shouldDeliver) continue;

      // ✅ Create delivery order + log delivery history
      const order = await createOrderForSubscription(subscription);

      results.push({
        subscription: subscription._id,
        order: order._id,
        message: `Delivery order created for ${subscription.plan.planName || subscription.plan.name}`,
      });

    } catch (error) {
      console.error(`Error processing subscription ${subscription._id}:`, error.message);
      errors.push({
        subscription: subscription._id,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    processed: results.length,
    errors: errors.length,
    data: results,
    errorsList: errors,
  });
});



/**
 * Creates an order for a given subscription delivery.
 */
/**
 * Creates an order for a given subscription delivery and records it in the subscription's delivery history.
 */
const createOrderForSubscription = async (subscription) => {
  const order = await Order.create({
    user: subscription.userId._id,
    products: [
      {
        product: subscription.plan._id,
        productName: subscription.plan.planName || subscription.plan.name,
        quantity: 1,
        price: subscription.price,
      },
    ],
    deliveryAddress: subscription.userId.address || 'Address not specified',
    deliveryOption: 'standard',
    totalAmount: subscription.price,
    paymentMethod: 'wallet',
    paymentStatus: 'completed',
    orderStatus: 'processing',
    subscription: subscription._id,
    isSubscriptionOrder: true,
  });

  // 🔁 Record this delivery in subscription history
  subscription.deliveries = subscription.deliveries || [];
  subscription.deliveries.push(order._id);
  await subscription.save();

  console.log(`✅ Created order ${order._id} for subscription ${subscription._id}`);

  return order;
};



/**
 * Checks whether a delivery is due for a given subscription today.
 * Skips paused subscriptions and ignores paused duration in calculations.
 */
/**
 * Checks whether a delivery is due for a given subscription today.
 * Skips paused subscriptions and ignores paused duration in calculations.
 */
const checkDeliveryDue = async (subscription, today) => {
  // ⛔ Skip paused subscriptions
  if (subscription.status === 'paused') return false;

  // Get last delivery date (from subscription history or last order)
  let lastOrder;
  if (subscription.deliveries?.length > 0) {
    lastOrder = await Order.findById(subscription.deliveries.at(-1));
  } else {
    lastOrder = await Order.findOne({ subscription: subscription._id }).sort({ createdAt: -1 });
  }

  const lastDeliveryDate = lastOrder ? lastOrder.createdAt : subscription.startDate;
  let effectiveLastDeliveryDate = new Date(lastDeliveryDate);

  // 🧠 Exclude paused durations
  if (subscription.pauseHistory && subscription.pauseHistory.length > 0) {
    subscription.pauseHistory.forEach((pause) => {
      if (pause.pausedAt >= effectiveLastDeliveryDate) {
        const resumedAt = pause.resumedAt || today; // if still paused
        const pauseDuration = resumedAt - pause.pausedAt;
        effectiveLastDeliveryDate = new Date(
          effectiveLastDeliveryDate.getTime() + pauseDuration
        );
      }
    });
  }

  // 🔁 Determine frequency interval
  let frequencyDays = 7; // default weekly
  switch (subscription.plan.frequency) {
    case 'daily':
      frequencyDays = 1;
      break;
    case 'weekly':
      frequencyDays = 7;
      break;
    case 'biweekly':
      frequencyDays = 14;
      break;
    case 'monthly':
      frequencyDays = 30;
      break;
  }

  const nextDeliveryDate = new Date(effectiveLastDeliveryDate);
  nextDeliveryDate.setDate(nextDeliveryDate.getDate() + frequencyDays);

  // ✅ Delivery is due if today >= next scheduled date
  return today >= nextDeliveryDate;
};




// @desc    Get all deliveries (orders) for a subscription
// @route   GET /api/v1/subscriptions/:id/deliveries
// @access  Private (user or admin)
exports.getSubscriptionDeliveries = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, startDate, endDate } = req.query;
  const subscriptionId = req.params.id;

  // ✅ Ensure subscription exists and belongs to user (unless admin)
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) {
    return next(new ErrorResponse('Subscription not found', 404));
  }

  // Only allow owner or admin
  if (req.user.role !== 'admin' && subscription.userId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to view this subscription', 403));
  }

  // 🗓️ Optional date filtering
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // 🔍 Query deliveries
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = { _id: { $in: subscription.deliveries }, ...dateFilter };

  const deliveries = await Order.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalDeliveries = await Order.countDocuments(query);

  res.status(200).json({
    success: true,
    count: deliveries.length,
    totalDeliveries,
    totalPages: Math.ceil(totalDeliveries / limit),
    currentPage: parseInt(page),
    data: deliveries,
  });
});




// @desc    Get subscription analytics
// @route   GET /api/v1/subscriptions/analytics
// @access  Private/Admin
exports.getSubscriptionAnalytics = asyncHandler(async (req, res, next) => {
  const totalSubscriptions = await Subscription.countDocuments();
  const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
  const cancelledSubscriptions = await Subscription.countDocuments({ status: 'cancelled' });
  const expiredSubscriptions = await Subscription.countDocuments({ status: 'expired' });
  
  const revenuePipeline = await Subscription.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, total: { $sum: '$price' } } }
  ]);

  const totalRevenue = revenuePipeline.length > 0 ? revenuePipeline[0].total : 0;

  res.status(200).json({
    success: true,
    data: {
      totalSubscriptions,
      activeSubscriptions,
      cancelledSubscriptions,
      expiredSubscriptions,
      totalRevenue
    }
  });
});






// @desc    Pause subscription (admin)
// @route   PUT /api/v1/subscriptions/:id/admin-pause
// @access  Private/Admin
exports.adminPauseSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) return next(new ErrorResponse('Subscription not found', 404));
  if (subscription.status !== 'active')
    return next(new ErrorResponse('Only active subscriptions can be paused', 400));

  subscription.remainingDuration = Math.max(subscription.endDate - new Date(), 0);
  subscription.pausedAt = new Date();
  subscription.status = 'paused';
  await subscription.save();

  res.status(200).json({ success: true, message: 'Subscription paused by admin', data: subscription });
});

// @desc    Resume subscription (admin)
// @route   PUT /api/v1/subscriptions/:id/admin-resume
// @access  Private/Admin
exports.adminResumeSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) return next(new ErrorResponse('Subscription not found', 404));
  if (subscription.status !== 'paused')
    return next(new ErrorResponse('Only paused subscriptions can be resumed', 400));

  const now = new Date();
  subscription.endDate = new Date(now.getTime() + subscription.remainingDuration);
  subscription.status = 'active';
  subscription.pausedAt = null;
  subscription.remainingDuration = null;
  await subscription.save();

  res.status(200).json({ success: true, message: 'Subscription resumed by admin', data: subscription });
});



// @desc    Admin: Get all subscription deliveries (orders)
// @route   GET /api/v1/subscriptions/deliveries/all
// @access  Private/Admin
exports.getAllSubscriptionDeliveries = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    startDate,
    endDate,
    user,
    plan,
    status,
    search
  } = req.query;

  const filters = { isSubscriptionOrder: true }; // ✅ only subscription orders

  // Optional date filter
  if (startDate || endDate) {
    filters.createdAt = {};
    if (startDate) filters.createdAt.$gte = new Date(startDate);
    if (endDate) filters.createdAt.$lte = new Date(endDate);
  }

  // Optional user filter
  if (user) filters.user = user;

  // Optional plan/product filter
  if (plan) filters['products.product'] = plan;

  // Optional delivery status filter
  if (status) filters.orderStatus = status;

  // Optional search (by plan name, user email, etc.)
  if (search) {
    filters.$or = [
      { 'products.productName': { $regex: search, $options: 'i' } },
      { 'user.name': { $regex: search, $options: 'i' } },
      { 'user.email': { $regex: search, $options: 'i' } },
      { 'deliveryAddress': { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const deliveries = await Order.find(filters)
    .populate('user', 'name email')
    .populate('products.product', 'name frequency')
    .populate('subscription', 'planName frequency')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalDeliveries = await Order.countDocuments(filters);

  res.status(200).json({
    success: true,
    count: deliveries.length,
    totalDeliveries,
    totalPages: Math.ceil(totalDeliveries / limit),
    currentPage: parseInt(page),
    data: deliveries,
  });
});
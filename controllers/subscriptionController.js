const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const paystack = require('../utils/paystack');
const crypto = require('crypto');

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

  const { plan: planId, size, frequency, subscriptionPeriod } = req.body;
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

  // Parse size to handle both "6kg" and "6" formats
  const sizeValue = parseInt(size.toString().replace('kg', '').trim());
  if (isNaN(sizeValue)) {
    return next(new ErrorResponse('Invalid cylinder size format', 400));
  }

  // Validate cylinder size against plan
  if (!plan.supportsCylinderSize(sizeValue)) {
    return next(new ErrorResponse(`Cylinder size ${size} is not supported by this plan`, 400));
  }

  // Validate frequency against plan
  if (!plan.supportsFrequency(frequency)) {
    return next(new ErrorResponse(`Frequency ${frequency} is not supported by this plan`, 400));
  }

  // Validate subscription period for non one-time plans
  if (plan.type !== 'one-time') {
    if (!subscriptionPeriod) {
      return next(new ErrorResponse('Subscription period is required for this plan type', 400));
    }
    if (!plan.supportsSubscriptionPeriod(parseInt(subscriptionPeriod))) {
      return next(new ErrorResponse(`Subscription period ${subscriptionPeriod} months is not supported by this plan`, 400));
    }
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

  // Calculate price based on plan
  let price;
  try {
    price = plan.calculatePrice(sizeValue);
  } catch (error) {
    return next(new ErrorResponse('Error calculating price: ' + error.message, 400));
  }

  const startDate = new Date();
  
  // Calculate end date based on subscription period (default to 1 month if not provided)
  const periodMonths = subscriptionPeriod || 1;
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + periodMonths);

  // Initialize payment with Paystack
  let response;
  try {
    response = await paystack.post('/transaction/initialize', {
      email: req.user.email,
      amount: Math.round(price * 100), // Convert to kobo and ensure integer
      metadata: { 
        userId, 
        planId, 
        size: sizeValue, 
        frequency, 
        subscriptionPeriod: periodMonths,
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
  const subscription = await Subscription.create({
    userId,
    planName: plan.name,
    plan: planId,
    size: sizeValue + 'kg',
    frequency,
    price,
    reference,
    status: 'pending',
    startDate,
    endDate
  });

  res.status(200).json({
    success: true,
    authorization_url,
    reference,
    data: subscription
  });
});

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

  // ✅ If API request (e.g. from Postman or frontend axios)
  if (req.headers['content-type'] === 'application/json') {
    return res.status(200).json({
      success: true,
      data: subscription,
      message: 'Subscription activated successfully',
    });
  }

  // ✅ Otherwise redirect to success page on frontend
  res.redirect(`${process.env.FRONTEND_URL}/subscriptions/success?subscriptionId=${subscription._id}`);
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

// Process successful payment
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
  
  await subscription.populate('plan');
  await subscription.populate('userId', 'firstName lastName email phone');

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
  const subscriptions = await Subscription.find({ userId: req.user.id })
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

  await subscription.populate('plan');

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
  // Get all active subscriptions that need delivery
  const today = new Date();
  const subscriptions = await Subscription.find({
    status: 'active',
    endDate: { $gte: today } // Only process subscriptions that haven't expired
  }).populate('plan').populate('userId');

  if (subscriptions.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No active subscriptions to process'
    });
  }

  const results = [];
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      // Check if delivery is due based on frequency
      const shouldDeliver = await checkDeliveryDue(subscription, today);
      
      if (shouldDeliver) {
        // Create order for subscription delivery
        const order = await Order.create({
          user: subscription.userId._id,
          products: [{
            product: subscription.plan._id,
            productName: subscription.planName,
            quantity: 1,
            price: subscription.price
          }],
          deliveryAddress: subscription.userId.address || 'Address not specified',
          deliveryOption: 'standard',
          totalAmount: subscription.price,
          paymentMethod: 'wallet',
          paymentStatus: 'completed',
          orderStatus: 'processing',
          subscription: subscription._id,
          isSubscriptionOrder: true
        });

        results.push({
          subscription: subscription._id,
          order: order._id,
          message: `Delivery order created for ${subscription.planName}`
        });
      }
    } catch (error) {
      errors.push({
        subscription: subscription._id,
        error: error.message
      });
    }
  }

  res.status(200).json({
    success: true,
    processed: results.length,
    errors: errors.length,
    data: results,
    errorsList: errors
  });
});

// Helper function to check if delivery is due
const checkDeliveryDue = async (subscription, today) => {
  try {
    const lastOrder = await Order.findOne({
      subscription: subscription._id,
      isSubscriptionOrder: true
    }).sort({ createdAt: -1 });

    if (!lastOrder) {
      return true; // First delivery
    }

    const lastDeliveryDate = new Date(lastOrder.createdAt);
    const daysSinceLastDelivery = Math.floor((today - lastDeliveryDate) / (1000 * 60 * 60 * 24));

    switch (subscription.frequency) {
      case 'Daily':
        return daysSinceLastDelivery >= 1;
      case 'Weekly':
        return daysSinceLastDelivery >= 7;
      case 'Bi-weekly':
        return daysSinceLastDelivery >= 14;
      case 'Monthly':
        return daysSinceLastDelivery >= 30;
      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking delivery due:', error);
    return false;
  }
};

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
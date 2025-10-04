const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all subscriptions
// @route   GET /api/v1/subscriptions
// @route   GET /api/v1/users/:userId/subscriptions
// @access  Private
exports.getSubscriptions = asyncHandler(async (req, res, next) => {
  if (req.params.userId) {
    const subscriptions = await Subscription.find({ user: req.params.userId })
      .populate('product')
      .populate('plan')
      .populate('user', 'firstName lastName email phone');

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
    .populate('product')
    .populate('plan')
    .populate('user', 'firstName lastName email phone');

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is subscription owner or admin
  if (
    subscription.user._id.toString() !== req.user.id &&
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
  // Add user to req.body
  req.body.user = req.user.id;

  // Check if product exists
  const product = await Product.findById(req.body.product);

  if (!product) {
    return next(
      new ErrorResponse(`No product with the id of ${req.body.product}`, 404)
    );
  }

  // Check if user already has an active subscription for this product
  const existingSubscription = await Subscription.findOne({
    user: req.user.id,
    product: req.body.product,
    status: 'active'
  });

  if (existingSubscription) {
    return next(
      new ErrorResponse(
        `User already has an active subscription for this product`,
        400
      )
    );
  }

  const subscription = await Subscription.create(req.body);

  // Populate the created subscription before returning it
  await subscription.populate('product');
  await subscription.populate('plan');
  await subscription.populate('user', 'firstName lastName email phone');

  res.status(201).json({
    success: true,
    data: subscription
  });
});

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
    subscription.user.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to update this subscription`,
        401
      )
    );
  }

  subscription = await Subscription.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  })
    .populate('product')
    .populate('plan')
    .populate('user', 'firstName lastName email phone');

  res.status(200).json({
    success: true,
    data: subscription
  });
});

// @desc    Cancel subscription
// @route   PUT /api/v1/subscriptions/:id/cancel
// @access  Private
exports.cancelSubscription = asyncHandler(async (req, res, next) => {
  let subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is subscription owner or admin
  if (
    subscription.user.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to cancel this subscription`,
        401
      )
    );
  }

  subscription.status = 'cancelled';
  await subscription.save();
  
  // Populate the updated subscription before returning it
  await subscription.populate('product');
  await subscription.populate('plan');
  await subscription.populate('user', 'firstName lastName email phone');

  res.status(200).json({
    success: true,
    data: subscription
  });
});

// ✅ Get logged-in user's subscriptions
exports.getMySubscriptions = asyncHandler(async (req, res, next) => {
  const subscriptions = await Subscription.find({ userId: req.user._id })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions
  });
});


// ✅ Cancel a subscription (user's own)
exports.cancelMySubscription = asyncHandler(async (req, res, next) => {
  // Find subscription by ID and make sure it belongs to the logged-in user
  const subscription = await Subscription.findOne({
    _id: req.params.planId,   
    userId: req.userId    
  });

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404)
    );
  }

  // Update status
  subscription.status = 'cancelled';
  await subscription.save();

  res.status(200).json({
    success: true,
    data: subscription,
    message: 'Subscription cancelled successfully'
  });
});


// ✅ Subscribe Again (renew subscription)
exports.renewSubscription = asyncHandler(async (req, res, next) => {
  const oldSub = await Subscription.findOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!oldSub) {
    return next(
      new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404)
    );
  }

  if (!['completed', 'cancelled'].includes(oldSub.status)) {
    return next(
      new ErrorResponse('Only completed or cancelled subscriptions can be renewed', 400)
    );
  }

  // ✅ Create new subscription based on old one
  const newSubData = {
    user: req.user._id,
    product: oldSub.product,
    plan: oldSub.plan,
    price: oldSub.price,
    frequency: oldSub.frequency,
    status: 'active',
    startDate: new Date(),
    nextDelivery: calculateNextDelivery(oldSub.frequency)
  };

  const newSub = await Subscription.create(newSubData);

  await newSub.populate('product');
  await newSub.populate('plan');
  await newSub.populate('user', 'firstName lastName email phone');

  res.status(201).json({
    success: true,
    data: newSub,
    message: 'Subscription renewed successfully'
  });
});

// ✅ Helper: calculate next delivery date based on frequency
const calculateNextDelivery = (frequency) => {
  const now = new Date();
  switch (frequency) {
    case 'weekly':
      return new Date(now.setDate(now.getDate() + 7));
    case 'bi-weekly':
      return new Date(now.setDate(now.getDate() + 14));
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'quarterly':
      return new Date(now.setMonth(now.getMonth() + 3));
    default:
      return null;
  }
};

// @desc    Process subscription deliveries
// @route   GET /api/v1/subscriptions/process
// @access  Private/Admin
exports.processSubscriptions = asyncHandler(async (req, res, next) => {
  // Get all active subscriptions with next delivery date <= today
  const subscriptions = await Subscription.find({
    status: 'active',
    nextDelivery: { $lte: new Date() }
  }).populate('product').populate('user');

  if (subscriptions.length === 0) {
    return res.status(200).json({
      success: true,
      data: 'No subscriptions to process'
    });
  }

  const results = [];
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      // Create order for subscription
      const order = await Order.create({
        user: subscription.user._id,
        products: [
          {
            product: subscription.product._id,
            quantity: 1,
            price: subscription.price
          }
        ],
        deliveryAddress: subscription.deliveryAddress || subscription.user.address,
        deliveryOption: 'standard',
        totalAmount: subscription.price,
        paymentMethod: 'wallet',
        paymentStatus: 'completed',
        orderStatus: 'processing',
        subscription: subscription._id
      });

      // Update next delivery date
      subscription.nextDelivery = calculateNextDelivery(subscription.frequency);
      await subscription.save();

      results.push({
        subscription: subscription._id,
        order: order._id
      });
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
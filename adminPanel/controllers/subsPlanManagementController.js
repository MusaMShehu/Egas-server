const SubscriptionPlan = require('../../models/SubscriptionPlan');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

// @desc    Get all subscription plans with advanced filtering
// @route   GET /api/v1/admin/subscription-plans
// @access  Private/Admin
exports.getSubscriptionPlans = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single subscription plan
// @route   GET /api/v1/admin/subscription-plans/:id
// @access  Private/Admin
exports.getSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: plan
  });
});

// @desc    Create subscription plan
// @route   POST /api/v1/admin/subscription-plans
// @access  Private/Admin
exports.createSubscriptionPlan = asyncHandler(async (req, res, next) => {
  // Add createdBy user
  req.body.createdBy = req.user.id;
  
  const plan = await SubscriptionPlan.create(req.body);

  // Log the action
  console.log(`Subscription plan created by admin ${req.user.id}: ${plan.name}`);

  res.status(201).json({
    success: true,
    data: plan
  });
});

// @desc    Update subscription plan
// @route   PUT /api/v1/admin/subscription-plans/:id
// @access  Private/Admin
exports.updateSubscriptionPlan = asyncHandler(async (req, res, next) => {
  let plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  // Add updatedBy user
  req.body.updatedBy = req.user.id;

  plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Log the action
  console.log(`Subscription plan updated by admin ${req.user.id}: ${plan.name}`);

  res.status(200).json({
    success: true,
    data: plan
  });
});

// @desc    Delete subscription plan
// @route   DELETE /api/v1/admin/subscription-plans/:id
// @access  Private/Admin
exports.deleteSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  await plan.remove();

  // Log the action
  console.log(`Subscription plan deleted by admin ${req.user.id}: ${plan.name}`);

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Toggle plan status (active/inactive)
// @route   PATCH /api/v1/admin/subscription-plans/:id/toggle-status
// @access  Private/Admin
exports.togglePlanStatus = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  plan.isActive = !plan.isActive;
  plan.updatedBy = req.user.id;

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.isActive ? 'activated' : 'deactivated'} successfully`
  });
});

// @desc    Toggle plan popularity
// @route   PATCH /api/v1/admin/subscription-plans/:id/toggle-popular
// @access  Private/Admin
exports.togglePlanPopular = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  plan.isPopular = !plan.isPopular;
  plan.updatedBy = req.user.id;

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: `Plan ${plan.isPopular ? 'marked as popular' : 'removed from popular'}`
  });
});

// @desc    Update plan display order
// @route   PATCH /api/v1/admin/subscription-plans/:id/display-order
// @access  Private/Admin
exports.updateDisplayOrder = asyncHandler(async (req, res, next) => {
  const { displayOrder } = req.body;

  if (typeof displayOrder !== 'number' || displayOrder < 0) {
    return next(new ErrorResponse('Please provide a valid display order number', 400));
  }

  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  plan.displayOrder = displayOrder;
  plan.updatedBy = req.user.id;

  await plan.save();

  res.status(200).json({
    success: true,
    data: plan,
    message: 'Display order updated successfully'
  });
});

// @desc    Bulk update plan display orders
// @route   PATCH /api/v1/admin/subscription-plans/bulk-display-order
// @access  Private/Admin
exports.bulkUpdateDisplayOrders = asyncHandler(async (req, res, next) => {
  const { orders } = req.body; // [{ planId: '...', displayOrder: 1 }, ...]

  if (!Array.isArray(orders) || orders.length === 0) {
    return next(new ErrorResponse('Please provide an array of orders', 400));
  }

  const bulkOperations = orders.map(order => ({
    updateOne: {
      filter: { _id: order.planId },
      update: { 
        displayOrder: order.displayOrder,
        updatedBy: req.user.id
      }
    }
  }));

  await SubscriptionPlan.bulkWrite(bulkOperations);

  res.status(200).json({
    success: true,
    data: {
      updatedCount: orders.length
    },
    message: 'Display orders updated successfully'
  });
});

// @desc    Calculate price for a plan
// @route   POST /api/v1/admin/subscription-plans/:id/calculate-price
// @access  Private/Admin
exports.calculatePrice = asyncHandler(async (req, res, next) => {
  const { cylinderSize, months, frequency } = req.body;

  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  // Validate cylinder size support
  if (!plan.supportsCylinderSize(cylinderSize)) {
    return next(new ErrorResponse('Cylinder size not supported by this plan', 400));
  }

  // Validate subscription period for non one-time plans
  if (plan.type !== 'one-time' && !plan.supportsSubscriptionPeriod(months)) {
    return next(new ErrorResponse('Subscription period not supported by this plan', 400));
  }

  // Validate frequency
  if (!plan.supportsFrequency(frequency)) {
    return next(new ErrorResponse('Delivery frequency not supported by this plan', 400));
  }

  const price = plan.calculatePrice(cylinderSize);
  const totalPrice = plan.type !== 'one-time' ? price * months : price;

  res.status(200).json({
    success: true,
    data: {
      cylinderSize,
      months: plan.type !== 'one-time' ? months : null,
      frequency,
      pricePerKg: plan.totalPricePerKg,
      basePrice: price,
      totalPrice,
      currency: 'NGN',
      formattedTotalPrice: `₦${totalPrice.toLocaleString()}`
    }
  });
});

// @desc    Get subscription plan analytics
// @route   GET /api/v1/admin/subscription-plans/analytics/overview
// @access  Private/Admin
exports.getPlanAnalytics = asyncHandler(async (req, res, next) => {
  const analytics = await SubscriptionPlan.aggregate([
    {
      $group: {
        _id: null,
        totalPlans: { $sum: 1 },
        activePlans: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        popularPlans: {
          $sum: { $cond: ['$isPopular', 1, 0] }
        },
        plansByType: {
          $push: {
            type: '$type',
            isActive: '$isActive'
          }
        }
      }
    }
  ]);

  const typeStats = await SubscriptionPlan.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        activeCount: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        popularCount: {
          $sum: { $cond: ['$isPopular', 1, 0] }
        },
        averageBasePrice: { $avg: '$basePrice' },
        averagePricePerKg: { $avg: '$pricePerKg' }
      }
    }
  ]);

  const priceStats = await SubscriptionPlan.aggregate([
    {
      $group: {
        _id: null,
        averageBasePrice: { $avg: '$basePrice' },
        maxBasePrice: { $max: '$basePrice' },
        minBasePrice: { $min: '$basePrice' },
        averagePricePerKg: { $avg: '$pricePerKg' },
        totalAdditionalFees: { $sum: '$additionalFeePerKg' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: analytics[0] || {},
      typeStats,
      priceStats: priceStats[0] || {},
      timestamp: new Date().toISOString()
    }
  });
});

// @desc    Duplicate subscription plan
// @route   POST /api/v1/admin/subscription-plans/:id/duplicate
// @access  Private/Admin
exports.duplicatePlan = asyncHandler(async (req, res, next) => {
  const plan = await SubscriptionPlan.findById(req.params.id);

  if (!plan) {
    return next(
      new ErrorResponse(`No subscription plan with the id of ${req.params.id}`, 404)
    );
  }

  // Create a duplicate with "Copy" in name
  const planData = plan.toObject();
  delete planData._id;
  delete planData.createdAt;
  delete planData.updatedAt;
  
  planData.name = `${plan.name} (Copy)`;
  planData.createdBy = req.user.id;
  planData.isActive = false; // Keep duplicated plan inactive by default

  const duplicatedPlan = await SubscriptionPlan.create(planData);

  res.status(201).json({
    success: true,
    data: duplicatedPlan,
    message: 'Plan duplicated successfully'
  });
});
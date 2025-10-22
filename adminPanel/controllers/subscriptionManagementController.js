// controllers/adminSubscriptionController.js
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');
const Order = require('../../models/Order');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const mongoose = require('mongoose');

// @desc    Get all subscriptions (Admin)
// @route   GET /api/v1/admin/subscriptions
// @access  Private/Admin
exports.getSubscriptions = asyncHandler(async (req, res, next) => {
  // Build query
  let query;
  let queryStr = JSON.stringify({ ...req.query });
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
  
  query = Subscription.find(JSON.parse(queryStr))
    .populate('userId', 'firstName lastName email phone address')
    .populate('order', 'orderId orderStatus totalAmount')
    .populate('deliveries', 'orderId orderStatus createdAt');

  // Select fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Subscription.countDocuments(JSON.parse(queryStr));

  query = query.skip(startIndex).limit(limit);

  // Execute query
  const subscriptions = await query;

  // Pagination result
  const pagination = {};
  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }
  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  // Advanced filtering for search
  let filteredSubscriptions = subscriptions;
  
  // Search functionality
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    filteredSubscriptions = subscriptions.filter(sub => 
      sub.planName?.match(searchRegex) ||
      sub.userId?.firstName?.match(searchRegex) ||
      sub.userId?.lastName?.match(searchRegex) ||
      sub.userId?.email?.match(searchRegex) ||
      sub.reference?.match(searchRegex) ||
      sub._id.toString().match(searchRegex)
    );
  }

  // Status filter
  if (req.query.status && req.query.status !== 'all') {
    filteredSubscriptions = filteredSubscriptions.filter(
      sub => sub.status === req.query.status
    );
  }

  // Plan type filter
  if (req.query.planType && req.query.planType !== 'all') {
    filteredSubscriptions = filteredSubscriptions.filter(
      sub => sub.planType === req.query.planType
    );
  }

  // Frequency filter
  if (req.query.frequency && req.query.frequency !== 'all') {
    filteredSubscriptions = filteredSubscriptions.filter(
      sub => sub.frequency === req.query.frequency
    );
  }

  // Size filter
  if (req.query.size && req.query.size !== 'all') {
    filteredSubscriptions = filteredSubscriptions.filter(
      sub => sub.size === req.query.size
    );
  }

  // Date range filter
  if (req.query.startDate || req.query.endDate) {
    filteredSubscriptions = filteredSubscriptions.filter(sub => {
      const subDate = new Date(sub.createdAt);
      let valid = true;
      
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        valid = valid && subDate >= startDate;
      }
      
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        valid = valid && subDate <= endDate;
      }
      
      return valid;
    });
  }

  res.status(200).json({
    success: true,
    count: filteredSubscriptions.length,
    pagination,
    total,
    data: filteredSubscriptions
  });
});

// @desc    Get single subscription (Admin)
// @route   GET /api/v1/admin/subscriptions/:id
// @access  Private/Admin
exports.getSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id)
    .populate('userId', 'firstName lastName email phone address')
    .populate('order', 'orderId orderStatus totalAmount paymentStatus')
    .populate('deliveries', 'orderId orderStatus totalAmount createdAt deliveredAt');

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: subscription
  });
});

// @desc    Create subscription (Admin)
// @route   POST /api/v1/admin/subscriptions
// @access  Private/Admin
exports.createSubscription = asyncHandler(async (req, res, next) => {
  // Add admin who created the subscription
  req.body.createdBy = req.user.id;

  // Validate required fields
  const requiredFields = ['userId', 'planName', 'frequency', 'price', 'startDate'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return next(
      new ErrorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400)
    );
  }

  // Validate user exists
  const user = await User.findById(req.body.userId);
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.body.userId}`, 404));
  }

  // Calculate end date if not provided
  if (!req.body.endDate && req.body.startDate) {
    req.body.endDate = calculateEndDate(req.body.startDate, req.body.frequency, req.body.subscriptionPeriod);
  }

  // Set status to active for admin-created subscriptions
  req.body.status = 'active';

  const subscription = await Subscription.create(req.body);

  // Populate the created subscription
  await subscription.populate('userId', 'firstName lastName email phone');
  await subscription.populate('createdBy', 'name email');

  res.status(201).json({
    success: true,
    data: subscription
  });
});

// @desc    Update subscription (Admin)
// @route   PUT /api/v1/admin/subscriptions/:id
// @access  Private/Admin
exports.updateSubscription = asyncHandler(async (req, res, next) => {
  let subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Update allowed fields
  const allowedUpdates = [
    'planName', 'planType', 'size', 'frequency', 'subscriptionPeriod', 
    'price', 'status', 'startDate', 'endDate', 'customPlanDetails'
  ];
  
  const updates = Object.keys(req.body);
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));
  
  if (!isValidOperation) {
    return next(new ErrorResponse('Invalid updates!', 400));
  }

  // Recalculate end date if frequency or start date changes
  if ((req.body.frequency || req.body.startDate) && !req.body.endDate) {
    const frequency = req.body.frequency || subscription.frequency;
    const startDate = req.body.startDate || subscription.startDate;
    const subscriptionPeriod = req.body.subscriptionPeriod || subscription.subscriptionPeriod;
    
    req.body.endDate = calculateEndDate(startDate, frequency, subscriptionPeriod);
  }

  // Add updated by info
  req.body.updatedBy = req.user.id;
  req.body.updatedAt = Date.now();

  subscription = await Subscription.findByIdAndUpdate(
    req.params.id, 
    req.body, 
    {
      new: true,
      runValidators: true
    }
  )
    .populate('userId', 'firstName lastName email phone')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    data: subscription
  });
});

// @desc    Delete subscription (Admin)
// @route   DELETE /api/v1/admin/subscriptions/:id
// @access  Private/Admin
exports.deleteSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(
      new ErrorResponse(`No subscription with the id of ${req.params.id}`, 404)
    );
  }

  // Check if there are associated orders
  const orderCount = await Order.countDocuments({ subscription: req.params.id });
  if (orderCount > 0) {
    return next(
      new ErrorResponse('Cannot delete subscription with associated orders. Cancel instead.', 400)
    );
  }

  await Subscription.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    data: {},
    message: 'Subscription deleted successfully'
  });
});

// @desc    Bulk update subscriptions (Admin)
// @route   PUT /api/v1/admin/subscriptions/bulk/update
// @access  Private/Admin
exports.bulkUpdateSubscriptions = asyncHandler(async (req, res, next) => {
  const { ids, updateData } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorResponse('Subscription IDs array is required', 400));
  }

  if (!updateData || typeof updateData !== 'object') {
    return next(new ErrorResponse('Update data object is required', 400));
  }

  // Validate subscription IDs
  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length !== ids.length) {
    return next(new ErrorResponse('Invalid subscription IDs provided', 400));
  }

  // Check if subscriptions exist
  const existingSubscriptions = await Subscription.find({ _id: { $in: validIds } });
  if (existingSubscriptions.length !== validIds.length) {
    return next(new ErrorResponse('Some subscriptions not found', 404));
  }

  // Add update metadata
  const updateWithMetadata = {
    ...updateData,
    updatedBy: req.user.id,
    updatedAt: Date.now()
  };

  // Perform bulk update
  const result = await Subscription.updateMany(
    { _id: { $in: validIds } },
    updateWithMetadata,
    { runValidators: true }
  );

  // Fetch updated subscriptions
  const updatedSubscriptions = await Subscription.find({ _id: { $in: validIds } })
    .populate('userId', 'firstName lastName email phone')
    .populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    data: updatedSubscriptions,
    message: `Successfully updated ${result.modifiedCount} subscriptions`
  });
});

// @desc    Bulk delete subscriptions (Admin)
// @route   DELETE /api/v1/admin/subscriptions/bulk/delete
// @access  Private/Admin
exports.bulkDeleteSubscriptions = asyncHandler(async (req, res, next) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorResponse('Subscription IDs array is required', 400));
  }

  // Validate subscription IDs
  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  // Check for subscriptions with orders
  const subscriptionsWithOrders = await Order.find({ 
    subscription: { $in: validIds } 
  }).distinct('subscription');

  if (subscriptionsWithOrders.length > 0) {
    return next(
      new ErrorResponse(
        `Cannot delete ${subscriptionsWithOrders.length} subscriptions with associated orders`,
        400
      )
    );
  }

  const result = await Subscription.deleteMany({ _id: { $in: validIds } });

  res.status(200).json({
    success: true,
    data: {},
    message: `Successfully deleted ${result.deletedCount} subscriptions`
  });
});

// @desc    Pause subscription (Admin)
// @route   PUT /api/v1/admin/subscriptions/:id/pause
// @access  Private/Admin
exports.pauseSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return next(new ErrorResponse(`No subscription found with id of ${req.params.id}`, 404));
  }

  if (subscription.status !== 'active') {
    return next(new ErrorResponse('Only active subscriptions can be paused', 400));
  }

  const now = new Date();
  const remainingTimeMs = subscription.endDate - now;

  // Calculate remaining time in days
  const remainingDays = Math.max(Math.floor(remainingTimeMs / (1000 * 60 * 60 * 24)), 0);

  subscription.remainingDuration = Math.max(remainingTimeMs, 0);
  subscription.remainingDays = remainingDays;
  subscription.pausedAt = now;
  subscription.status = 'paused';
  subscription.updatedBy = req.user.id;
  subscription.updatedAt = now;

  await subscription.save({ validateBeforeSave: false });

  await subscription.populate('userId', 'firstName lastName email phone');
  await subscription.populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    message: `Subscription paused successfully with ${remainingDays} day(s) remaining.`,
    data: subscription
  });
});

// @desc    Resume subscription (Admin)
// @route   PUT /api/v1/admin/subscriptions/:id/resume
// @access  Private/Admin
exports.resumeSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);

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
  subscription.updatedBy = req.user.id;
  subscription.updatedAt = now;

  await subscription.save({ validateBeforeSave: false });

  await subscription.populate('userId', 'firstName lastName email phone');
  await subscription.populate('updatedBy', 'name email');

  const daysRemaining = Math.max(
    Math.floor((subscription.endDate - now) / (1000 * 60 * 60 * 24)),
    0
  );

  res.status(200).json({
    success: true,
    message: `Subscription resumed successfully. ${daysRemaining} day(s) remaining.`,
    data: subscription
  });
});

// @desc    Cancel subscription (Admin)
// @route   PUT /api/v1/admin/subscriptions/:id/cancel
// @access  Private/Admin
exports.cancelSubscription = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findById(req.params.id);

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
  subscription.updatedBy = req.user.id;
  subscription.updatedAt = new Date();
  
  await subscription.save();

  await subscription.populate('userId', 'firstName lastName email phone');
  await subscription.populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    data: subscription,
    message: 'Subscription cancelled successfully'
  });
});

// @desc    Get subscription analytics (Admin)
// @route   GET /api/v1/admin/subscriptions/analytics/overview
// @access  Private/Admin
exports.getSubscriptionAnalytics = asyncHandler(async (req, res, next) => {
  // Total counts by status
  const statusCounts = await Subscription.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Revenue analytics
  const revenuePipeline = await Subscription.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, total: { $sum: '$price' } } }
  ]);

  // Plan type distribution
  const planTypeDistribution = await Subscription.aggregate([
    {
      $group: {
        _id: '$planType',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$price' }
      }
    }
  ]);

  // Frequency distribution
  const frequencyDistribution = await Subscription.aggregate([
    {
      $group: {
        _id: '$frequency',
        count: { $sum: 1 }
      }
    }
  ]);

  // Monthly subscription growth
  const monthlyGrowth = await Subscription.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 },
        revenue: { $sum: '$price' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    { $limit: 12 }
  ]);

  // Convert status counts to object
  const statusCountsObj = {};
  statusCounts.forEach(item => {
    statusCountsObj[item._id] = item.count;
  });

  const totalRevenue = revenuePipeline.length > 0 ? revenuePipeline[0].total : 0;

  res.status(200).json({
    success: true,
    data: {
      totals: {
        total: statusCountsObj.active + statusCountsObj.paused + statusCountsObj.cancelled + statusCountsObj.expired + statusCountsObj.pending,
        active: statusCountsObj.active || 0,
        paused: statusCountsObj.paused || 0,
        cancelled: statusCountsObj.cancelled || 0,
        expired: statusCountsObj.expired || 0,
        pending: statusCountsObj.pending || 0
      },
      revenue: {
        total: totalRevenue,
        formatted: `₦${totalRevenue.toLocaleString()}`
      },
      distributions: {
        planType: planTypeDistribution,
        frequency: frequencyDistribution
      },
      growth: monthlyGrowth
    }
  });
});

// @desc    Get subscription statistics (Admin)
// @route   GET /api/v1/admin/subscriptions/statistics
// @access  Private/Admin
exports.getSubscriptionStatistics = asyncHandler(async (req, res, next) => {
  const { period = 'month' } = req.query; // day, week, month, year

  // Calculate date range based on period
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'day':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setMonth(now.getMonth() - 1));
  }

  // New subscriptions in period
  const newSubscriptions = await Subscription.countDocuments({
    createdAt: { $gte: startDate }
  });

  // Active subscriptions count
  const activeSubscriptions = await Subscription.countDocuments({
    status: 'active'
  });

  // Revenue in period
  const revenueResult = await Subscription.aggregate([
    {
      $match: {
        status: 'active',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$price' }
      }
    }
  ]);

  // Most popular plan types
  const popularPlans = await Subscription.aggregate([
    {
      $group: {
        _id: '$planType',
        count: { $sum: 1 },
        revenue: { $sum: '$price' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  // Subscription status distribution
  const statusDistribution = await Subscription.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const periodRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

  res.status(200).json({
    success: true,
    data: {
      period: {
        type: period,
        startDate,
        endDate: new Date()
      },
      overview: {
        newSubscriptions,
        activeSubscriptions,
        periodRevenue,
        totalSubscriptions: await Subscription.countDocuments()
      },
      popularPlans,
      statusDistribution
    }
  });
});

// @desc    Export subscriptions data (Admin)
// @route   GET /api/v1/admin/subscriptions/export
// @access  Private/Admin
exports.exportSubscriptions = asyncHandler(async (req, res, next) => {
  const { format = 'json', ...filters } = req.query;

  // Build base query
  let query = Subscription.find(filters)
    .populate('userId', 'firstName lastName email phone')
    .populate('order', 'orderId totalAmount')
    .sort('-createdAt');

  const subscriptions = await query;

  if (format === 'csv') {
    // Convert to CSV
    const csvData = convertSubscriptionsToCSV(subscriptions);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
    return res.send(csvData);
  }

  // Default JSON response
  res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions,
    exportedAt: new Date().toISOString()
  });
});

// Helper function to calculate end date
const calculateEndDate = (startDate, frequency, subscriptionPeriod = 1) => {
  const endDate = new Date(startDate);
  const periodMonths = subscriptionPeriod || 1;

  if (frequency === "One-Time") {
    return startDate;
  }

  switch (frequency) {
    case "Daily":
      endDate.setDate(endDate.getDate() + (30 * periodMonths));
      break;
    case "Weekly":
      endDate.setDate(endDate.getDate() + (7 * 4 * periodMonths));
      break;
    case "Bi-Weekly":
      endDate.setDate(endDate.getDate() + (7 * 2 * 4 * periodMonths));
      break;
    case "Monthly":
    default:
      endDate.setMonth(endDate.getMonth() + periodMonths);
      break;
  }

  return endDate;
};

// Helper function to convert subscriptions to CSV
const convertSubscriptionsToCSV = (subscriptions) => {
  const headers = [
    'ID', 'Customer Name', 'Customer Email', 'Plan Name', 'Plan Type',
    'Frequency', 'Size', 'Status', 'Price', 'Start Date', 'End Date',
    'Created At', 'Reference'
  ];

  const rows = subscriptions.map(sub => [
    sub._id,
    `${sub.userId?.firstName || ''} ${sub.userId?.lastName || ''}`.trim(),
    sub.userId?.email || '',
    sub.planName,
    sub.planType,
    sub.frequency,
    sub.size,
    sub.status,
    sub.price,
    new Date(sub.startDate).toLocaleDateString(),
    sub.endDate ? new Date(sub.endDate).toLocaleDateString() : 'N/A',
    new Date(sub.createdAt).toLocaleDateString(),
    sub.reference || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');

  return csvContent;
};
// controllers/deliveryController.js
const Delivery = require("../../models/Delivery");
const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const ErrorResponse = require("../../utils/errorResponse");
const asyncHandler = require("../../middleware/async");

// @desc    Get all delivery orders with filters
// @route   GET /api/v1/deliveries
// @access  Private/Admin
exports.getDeliveries = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    status,
    deliveryDate,
    deliveryAgent,
    subscriptionId,
    userId,
    search,
    sortBy = "deliveryDate",
    sortOrder = "asc",
  } = req.query;

  // Build filter object
  let filter = {};

  if (status && status !== "all") {
    filter.status = status;
  }

  if (deliveryDate) {
    const startDate = new Date(deliveryDate);
    const endDate = new Date(deliveryDate);
    endDate.setDate(endDate.getDate() + 1);
    filter.deliveryDate = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  if (deliveryAgent) {
    filter.deliveryAgent = deliveryAgent;
  }

  if (subscriptionId) {
    filter.subscriptionId = subscriptionId;
  }

  if (userId) {
    filter.userId = userId;
  }

  // Search functionality
  if (search) {
    filter.$or = [
      { "customerName": { $regex: search, $options: "i" } },
      { "customerPhone": { $regex: search, $options: "i" } },
      { "address": { $regex: search, $options: "i" } },
      { "planDetails.planName": { $regex: search, $options: "i" } },
    ];
  }

  // Sort configuration
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const deliveries = await Delivery.find(filter)
    .populate("subscriptionId", "planName size frequency status")
    .populate({
      path: "userId",
      select: "firstName lastName email phone address city state gpsCoordinates profilePic"
    })
    .populate("deliveryAgent", "firstName lastName email phone")
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Delivery.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: deliveries.length,
    total,
    pagination: {
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
    data: deliveries,
  });
});

// @desc    Assign delivery to agent
// @route   PUT /api/v1/deliveries/:id/assign
// @access  Private/Admin
exports.assignDeliveryAgent = asyncHandler(async (req, res, next) => {
  const { deliveryAgentId } = req.body;

  const delivery = await Delivery.findById(req.params.id);
  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found", 404));
  }

  // Check if agent exists and has delivery agent role
  const agent = await User.findById(deliveryAgentId);
  if (!agent || agent.role !== "delivery") {
    return next(new ErrorResponse("Invalid delivery agent", 400));
  }

  // Check if delivery is already assigned
  if (delivery.deliveryAgent && delivery.status !== "pending") {
    return next(new ErrorResponse("Delivery already assigned to an agent", 400));
  }

  delivery.deliveryAgent = deliveryAgentId;
  delivery.status = "assigned";
  delivery.assignedAt = new Date();

  await delivery.save();

  await delivery.populate("deliveryAgent", "firstName lastName email phone");
  await delivery.populate("userId", "firstName lastName email phone");

  res.status(200).json({
    success: true,
    message: "Delivery assigned successfully",
    data: delivery,
  });
});

// @desc    Get delivery agent's assigned orders
// @route   GET /api/v1/deliveries/agent/my-deliveries
// @access  Private/DeliveryAgent
exports.getAgentDeliveries = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { status, date } = req.query;

  // Base filter for the logged-in agent
  let filter = { deliveryAgent: agentId };

  // Handle status filter
  if (status && status !== "all") {
    // If multiple statuses (comma-separated) are sent, handle them properly
    const statuses = status.split(",").map(s => s.trim());
    filter.status = { $in: statuses };
  }

  // Handle date filter (if provided)
  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    filter.deliveryDate = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  // Fetch and populate deliveries
  const deliveries = await Delivery.find(filter)
    .populate("subscriptionId", "planName size frequency")
    .populate("userId", "firstName lastName phone address gpsCoordinates")
    .sort({ deliveryDate: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: deliveries.length,
    data: deliveries,
  });
});

// @desc    Accept delivery assignment
// @route   PUT /api/v1/deliveries/:id/accept
// @access  Private/DeliveryAgent
exports.acceptDelivery = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;

  const delivery = await Delivery.findOne({
    _id: req.params.id,
    deliveryAgent: agentId,
  });

  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
  }

  if (delivery.status !== "assigned") {
    return next(new ErrorResponse("Delivery is not in assigned status", 400));
  }

  delivery.status = "accepted";
  delivery.acceptedAt = new Date();

  await delivery.save();

  res.status(200).json({
    success: true,
    message: "Delivery accepted successfully",
    data: delivery,
  });
});

// @desc    Mark delivery as out for delivery
// @route   PUT /api/v1/deliveries/:id/out-for-delivery
// @access  Private/DeliveryAgent
exports.markOutForDelivery = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;

  const delivery = await Delivery.findOne({
    _id: req.params.id,
    deliveryAgent: agentId,
  });

  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
  }

  if (!["assigned", "accepted"].includes(delivery.status)) {
    return next(new ErrorResponse("Delivery must be assigned or accepted first", 400));
  }

  delivery.status = "out_for_delivery";

  await delivery.save();

  res.status(200).json({
    success: true,
    message: "Delivery marked as out for delivery",
    data: delivery,
  });
});

// @desc    Mark delivery as delivered
// @route   PUT /api/v1/deliveries/:id/delivered
// @access  Private/DeliveryAgent
exports.markAsDelivered = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { notes } = req.body;

  const delivery = await Delivery.findOne({
    _id: req.params.id,
    deliveryAgent: agentId,
  });

  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
  }

  if (delivery.status === "delivered") {
    return next(new ErrorResponse("Delivery already marked as delivered", 400));
  }

  delivery.status = "delivered";
  delivery.deliveredAt = new Date();
  delivery.agentNotes = notes;

  await delivery.save();

  // Update subscription delivery history
  await Subscription.findByIdAndUpdate(
    delivery.subscriptionId,
    {
      $push: { deliveries: delivery._id },
    }
  );

  res.status(200).json({
    success: true,
    message: "Delivery marked as successful",
    data: delivery,
  });
});

// @desc    Mark delivery as failed
// @route   PUT /api/v1/deliveries/:id/failed
// @access  Private/DeliveryAgent
exports.markAsFailed = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { reason, notes } = req.body;

  if (!reason) {
    return next(new ErrorResponse("Failure reason is required", 400));
  }

  const delivery = await Delivery.findOne({
    _id: req.params.id,
    deliveryAgent: agentId,
  }).populate("subscriptionId");

  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
  }

  if (delivery.status === "delivered") {
    return next(new ErrorResponse("Cannot mark delivered order as failed", 400));
  }

  // Mark current order as failed
  delivery.status = "failed";
  delivery.failedReason = reason;
  delivery.failedAt = new Date();
  delivery.agentNotes = notes;
  await delivery.save();

  // Create new delivery order for next day
  const newDeliveryDate = new Date();
  newDeliveryDate.setDate(newDeliveryDate.getDate() + 1);

  const newDelivery = new Delivery({
    subscriptionId: delivery.subscriptionId,
    userId: delivery.userId,
    deliveryAgent: agentId,
    deliveryDate: newDeliveryDate,
    scheduledDate: newDeliveryDate,
    status: "assigned",
    address: delivery.address,
    customerPhone: delivery.customerPhone,
    customerName: delivery.customerName,
    planDetails: delivery.planDetails,
    retryCount: (delivery.retryCount || 0) + 1,
    previousAttempt: delivery._id,
  });

  await newDelivery.save();

  res.status(200).json({
    success: true,
    message: "Delivery marked as failed and rescheduled",
    data: {
      failedOrder: delivery,
      rescheduledOrder: newDelivery,
    },
  });
});

// @desc    Customer confirms delivery
// @route   PUT /api/v1/deliveries/:id/confirm
// @access  Private
exports.confirmDelivery = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { notes } = req.body;

  const delivery = await Delivery.findOne({
    _id: req.params.id,
    userId: userId,
    status: "delivered",
  });

  if (!delivery) {
    return next(new ErrorResponse("Delivery order not found or not delivered", 404));
  }

  if (delivery.customerConfirmation.confirmed) {
    return next(new ErrorResponse("Delivery already confirmed", 400));
  }

  delivery.customerConfirmation = {
    confirmed: true,
    confirmedAt: new Date(),
    customerNotes: notes,
  };

  await delivery.save();

  res.status(200).json({
    success: true,
    message: "Delivery confirmed successfully",
    data: delivery,
  });
});

// @desc    Get customer's delivery history
// @route   GET /api/v1/deliveries/my-deliveries
// @access  Private
exports.getMyDeliveries = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { status, page = 1, limit = 10 } = req.query;

  let filter = { userId };

  if (status && status !== "all") {
    filter.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const deliveries = await Delivery.find(filter)
    .populate("subscriptionId", "planName size frequency")
    .populate("deliveryAgent", "firstName lastName phone")
    .sort({ deliveryDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Delivery.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: deliveries.length,
    total,
    pagination: {
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
    data: deliveries,
  });
});

// @desc    Get delivery statistics
// @route   GET /api/v1/deliveries/stats
// @access  Private/Admin
exports.getDeliveryStats = asyncHandler(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Today's stats
  const todayStats = await Delivery.aggregate([
    {
      $match: {
        deliveryDate: {
          $gte: today,
          $lt: tomorrow,
        },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Overall stats
  const overallStats = await Delivery.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Weekly successful deliveries
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weeklyDelivered = await Delivery.countDocuments({
    status: "delivered",
    deliveredAt: { $gte: weekAgo },
  });

  const stats = {
    today: {
      total: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
    },
    overall: {
      total: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
    },
    weeklyDelivered,
  };

  todayStats.forEach((stat) => {
    stats.today.total += stat.count;
    if (stat._id === "delivered") stats.today.delivered = stat.count;
    if (["pending", "assigned", "accepted", "out_for_delivery"].includes(stat._id)) {
      stats.today.pending += stat.count;
    }
    if (stat._id === "failed") stats.today.failed = stat.count;
  });

  overallStats.forEach((stat) => {
    stats.overall.total += stat.count;
    if (stat._id === "delivered") stats.overall.delivered = stat.count;
    if (["pending", "assigned", "accepted", "out_for_delivery"].includes(stat._id)) {
      stats.overall.pending += stat.count;
    }
    if (stat._id === "failed") stats.overall.failed = stat.count;
  });

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// @desc    Generate delivery schedules from subscriptions
// @route   POST /api/v1/deliveries/generate-schedules
// @access  Private/Admin
exports.generateDeliverySchedules = asyncHandler(async (req, res, next) => {
  const { daysAhead = 30 } = req.body; // Changed from 7 to 30 to capture monthly schedules

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + parseInt(daysAhead));

  // Get active subscriptions
  const activeSubscriptions = await Subscription.find({
    status: "active",
    endDate: { $gte: startDate },
  }).populate("userId", "firstName lastName phone address");

  let generatedCount = 0;
  const errors = [];

  for (const subscription of activeSubscriptions) {
    try {
      const deliveryDates = calculateDeliveryDates(
        subscription,
        startDate,
        endDate
      );

      for (const deliveryDate of deliveryDates) {
        // Check if delivery already exists for this date
        const startOfDay = new Date(deliveryDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(deliveryDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingDelivery = await Delivery.findOne({
          subscriptionId: subscription._id,
          deliveryDate: {
            $gte: startOfDay,
            $lt: endOfDay,
          },
        });

        if (!existingDelivery) {
          await Delivery.create({
            subscriptionId: subscription._id,
            userId: subscription.userId._id,
            deliveryDate: deliveryDate,
            scheduledDate: deliveryDate,
            status: "pending",
            address: subscription.userId.address,
            customerPhone: subscription.userId.phone,
            customerName: `${subscription.userId.firstName} ${subscription.userId.lastName}`,
            planDetails: {
              planName: subscription.planName,
              size: subscription.size,
              frequency: subscription.frequency,
              price: subscription.price,
            },
          });
          generatedCount++;
        }
      }
    } catch (error) {
      errors.push({
        subscriptionId: subscription._id,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Generated ${generatedCount} delivery schedules`,
    generatedCount,
    errors,
  });
});

// Helper function to calculate delivery dates
const calculateDeliveryDates = (subscription, startDate, endDate) => {
  const dates = [];
  let currentDate = new Date(subscription.startDate);
  
  // Adjust based on specific plan names if needed
  const isWeeklyPlan = subscription.planName && subscription.planName.toLowerCase().includes('weekly');
  const isBiWeeklyPlan = subscription.planName && subscription.planName.toLowerCase().includes('bi-weekly');
  const isMonthlyPlan = subscription.planName && subscription.planName.toLowerCase().includes('monthly');
  
  // If planName doesn't indicate frequency, fall back to frequency field
  const frequency = isWeeklyPlan ? 'Weekly-Plan' : 
                    isBiWeeklyPlan ? 'Bi-Weekly-Plan' : 
                    isMonthlyPlan ? 'Monthly-Plan' : 
                    subscription.frequency;

  while (currentDate <= endDate) {
    if (currentDate >= startDate) {
      dates.push(new Date(currentDate));
    }

    // Calculate next delivery date based on frequency
    switch (frequency) {
      case "Weekly-Plan": // 4 deliveries per month
        currentDate.setDate(currentDate.getDate() + 7); // Weekly
        break;
      case "Bi-Weekly-Plan": // 2 deliveries per month
        currentDate.setDate(currentDate.getDate() + 14); // Every 2 weeks
        break;
      case "Monthly-Plan": // 1 delivery per month
        currentDate.setMonth(currentDate.getMonth() + 1); // Monthly
        break;
      case "Daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "Weekly": // Original weekly (if different from Weekly-Plan)
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case "Bi-Weekly": // Original bi-weekly (if different from Bi-Weekly-Plan)
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case "Monthly": // Original monthly (if different from Monthly-Plan)
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "One-Time":
        currentDate = new Date(endDate); // Break loop for one-time
        break;
      default:
        currentDate.setMonth(currentDate.getMonth() + 1); // Default monthly
    }
  }

  return dates;
};
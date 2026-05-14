// controllers/deliveryController.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const Delivery = require("../models/Delivery");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");
const Remnant = require("../models/Remnant");
const Notification = require("../models/Notification");
const {
  validateObjectId,
  auditLog,
  rateLimiter,
} = require("../middleware/security");



// @desc    Get deliveries by subscription with pause status
// @route   GET /api/v1/deliveries/subscription/:subscriptionId
// @access  Private
exports.getDeliveriesBySubscription = asyncHandler(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const userId = req.user.id;
  const { includePaused = true } = req.query;

  // Verify subscription belongs to user (unless admin)
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) {
    return next(new ErrorResponse("Subscription not found", 404));
  }

  if (subscription.userId.toString() !== userId && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized", 403));
  }

  // Build query
  const query = { subscriptionId: subscriptionId };

  if (!includePaused) {
    query.status = { $ne: "paused" };
  }

  const deliveries = await Delivery.find(query)
    .populate("deliveryAgent", "firstName lastName phone")
    .sort({ deliveryDate: 1 });

  // Add subscription pause status to each delivery
  const deliveriesWithPauseStatus = deliveries.map((delivery) => {
    const deliveryObj = delivery.toObject();

    // Check if delivery falls within a subscription pause period
    deliveryObj.isSubscriptionPaused = false;
    deliveryObj.pauseHistory = [];

    if (subscription.pauseHistory && subscription.pauseHistory.length > 0) {
      subscription.pauseHistory.forEach((pause) => {
        if (pause.pausedAt && delivery.deliveryDate >= pause.pausedAt) {
          if (!pause.resumedAt || delivery.deliveryDate <= pause.resumedAt) {
            deliveryObj.isSubscriptionPaused = true;
          }
        }
      });
    }

    return deliveryObj;
  });

  res.status(200).json({
    success: true,
    count: deliveriesWithPauseStatus.length,
    data: deliveriesWithPauseStatus,
    subscriptionStatus: subscription.status,
    subscriptionPausedAt: subscription.pausedAt,
  });
});

// @desc    Get delivery pause/resume history
// @route   GET /api/v1/deliveries/:id/pause-history
// @access  Private
exports.getDeliveryPauseHistory = asyncHandler(async (req, res, next) => {
  const deliveryId = req.params.id;
  const userId = req.user.id;

  const delivery = await Delivery.findById(deliveryId).populate(
    "subscriptionId",
    "status pauseHistory pausedAt",
  );

  if (!delivery) {
    return next(new ErrorResponse("Delivery not found", 404));
  }

  // Verify authorization
  if (delivery.userId.toString() !== userId && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized", 403));
  }

  // Get pause history from delivery and subscription
  const pauseHistory = {
    deliveryPauses: delivery.pauseResumeHistory || [],
    subscriptionPauses: delivery.subscriptionId?.pauseHistory || [],
    currentStatus: {
      delivery: delivery.status,
      subscription: delivery.subscriptionId?.status,
      isInSync:
        delivery.status === "paused"
          ? delivery.subscriptionId?.status === "paused"
          : delivery.subscriptionId?.status === "active",
    },
  };

  res.status(200).json({
    success: true,
    data: pauseHistory,
  });
});

// @desc    Manual sync delivery with subscription status
// @route   POST /api/v1/deliveries/:id/sync-subscription
// @access  Private
exports.syncDeliveryWithSubscription = asyncHandler(async (req, res, next) => {
  const deliveryId = req.params.id;
  const userId = req.user.id;

  const delivery =
    await Delivery.findById(deliveryId).populate("subscriptionId");

  if (!delivery) {
    return next(new ErrorResponse("Delivery not found", 404));
  }

  // Verify authorization
  if (delivery.userId.toString() !== userId && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized", 403));
  }

  if (!delivery.subscriptionId) {
    return next(
      new ErrorResponse("Delivery has no associated subscription", 400),
    );
  }

  const subscription = delivery.subscriptionId;
  let syncResult = {};

  // Sync based on subscription status
  if (subscription.status === "paused" && delivery.status !== "paused") {
    // Pause delivery to match subscription
    delivery.status = "paused";
    delivery.pausedAt = subscription.pausedAt || new Date();
    delivery.originalDeliveryDate = delivery.deliveryDate;
    await delivery.save();

    syncResult = {
      action: "paused",
      reason: "Subscription is paused",
      newStatus: "paused",
      subscriptionStatus: subscription.status,
    };
  } else if (subscription.status === "active" && delivery.status === "paused") {
    // Resume delivery and extend date based on pause duration
    const totalPauseDurationMs = calculateTotalPauseDuration(
      subscription.pauseHistory,
    );
    const newDeliveryDate = new Date(
      delivery.originalDeliveryDate.getTime() + totalPauseDurationMs,
    );

    delivery.status = "pending";
    delivery.deliveryDate = newDeliveryDate;
    delivery.scheduledDate = newDeliveryDate;
    delivery.resumedAt = new Date();
    delivery.pausedAt = null;
    await delivery.save();

    syncResult = {
      action: "resumed",
      reason: "Subscription is active",
      newStatus: "pending",
      newDeliveryDate: newDeliveryDate,
      daysExtended: Math.round(totalPauseDurationMs / (1000 * 60 * 60 * 24)),
      subscriptionStatus: subscription.status,
    };
  } else {
    syncResult = {
      action: "none",
      reason: "Delivery status already in sync with subscription",
      currentStatus: delivery.status,
      subscriptionStatus: subscription.status,
    };
  }

  res.status(200).json({
    success: true,
    message: "Delivery synced with subscription",
    data: syncResult,
    deliveryId: delivery._id,
    subscriptionId: subscription._id,
  });
});


// @desc    Customer confirms delivery
// @route   PUT /api/v1/deliveries/:id/confirm
// @access  Private

exports.confirmDelivery = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { notes } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      userId: userId,
      status: "delivered",
      "customerConfirmation.confirmed": false,
    }).session(session);

    if (!delivery) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("Delivery not found or already confirmed", 404),
      );
    }

    // Update delivery confirmation
    delivery.customerConfirmation = {
      confirmed: true,
      confirmedAt: new Date(),
      customerNotes: notes,
    };

    // Handle remnant deliveries on confirmation
    if (delivery.isOneTimeRemnantDelivery && delivery.remnantId) {
      const remnant = await Remnant.findById(delivery.remnantId).session(
        session,
      );
      if (remnant) {
        // Mark delivery request as fully confirmed
        remnant.deliveryRequests = remnant.deliveryRequests.map((request) => {
          if (request.deliveryId.toString() === delivery._id.toString()) {
            request.status = "confirmed";
            request.confirmedAt = new Date();
            request.customerConfirmed = true;
          }
          return request;
        });

        // Mark remnant subscription as expired (fulfilled)
        if (delivery.subscriptionId) {
          delivery.subscriptionId.status = "expired";
          delivery.subscriptionId.expiredAt = new Date();
          delivery.subscriptionId.endDate = new Date(); // Set to delivered date
          await delivery.subscriptionId.save({ session });
        }

        await remnant.save({ session });
      }
    }

    await delivery.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Delivery confirmed successfully",
      data: delivery,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(
      new ErrorResponse("Error confirming delivery: " + error.message, 500),
    );
  }
});


exports.getMyDeliveries = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { 
    status, 
    page = 1, 
    limit = 10,
    sortBy = 'deliveryDate',
    sortOrder = 'desc',
    tab, 
    deliveryDate
  } = req.query;

  let filter = { userId };

  // Handle tab-based filtering - each tab returns ONLY its specific data
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (tab) {
    switch (tab) {
      case 'upcoming':
        // Upcoming: ONLY future deliveries that are not completed
        filter.deliveryDate = { $gte: now };
        filter.status = { $nin: ['delivered', 'cancelled', 'failed'] };
        break;
      
      case 'delivered':
        // Delivered: ONLY deliveries with status 'delivered'
        filter.status = 'delivered';
        // Don't filter by date for delivered - show all delivered orders
        break;
      
      case 'overdue':
        // Overdue: ONLY past deliveries that are not completed
        filter.deliveryDate = { $lt: now };
        filter.status = { $nin: ['delivered', 'cancelled', 'failed'] };
        break;
      
      default:
        break;
    }
  }

  // Apply additional status filter only if provided AND not using a tab that already filters status
  if (status && status !== 'all' && !tab) {
    if (status.includes(',')) {
      filter.status = { $in: status.split(',') };
    } else {
      filter.status = status;
    }
  }

  // Apply specific date filter if provided (overrides tab date filtering)
  if (deliveryDate) {
    const startDate = new Date(deliveryDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(deliveryDate);
    endDate.setHours(23, 59, 59, 999);
    
    filter.deliveryDate = {
      $gte: startDate,
      $lte: endDate
    };
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build sort object - FIXED sorting implementation
  let sort = {};
  
  // Explicitly handle different sort fields
  if (sortBy === 'deliveryDate') {
    // For deliveryDate, we sort by the actual date
    sort.deliveryDate = sortOrder === 'asc' ? 1 : -1;
  } else if (sortBy === 'createdAt') {
    sort.createdAt = sortOrder === 'asc' ? 1 : -1;
  } else if (sortBy === 'status') {
    // For status, we sort alphabetically
    sort.status = sortOrder === 'asc' ? 1 : -1;
  } else {
    // Default sort by deliveryDate descending (newest first)
    sort.deliveryDate = -1;
  }

  console.log('Filter:', JSON.stringify(filter));
  console.log('Sort:', sort);
  console.log('Tab:', tab);

  // Execute query with population
  const deliveries = await Delivery.find(filter)
    .populate('subscriptionId', 'planName size frequency status')
    .populate('deliveryAgent', 'firstName lastName phone')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count for pagination
  const total = await Delivery.countDocuments(filter);

  // Get counts for each tab separately (for UI badges)
  const [upcomingCount, deliveredCount, overdueCount] = await Promise.all([
    // Upcoming count
    Delivery.countDocuments({
      userId,
      deliveryDate: { $gte: now },
      status: { $nin: ['delivered', 'cancelled', 'failed'] }
    }),
    
    // Delivered count
    Delivery.countDocuments({
      userId,
      status: 'delivered'
    }),
    
    // Overdue count
    Delivery.countDocuments({
      userId,
      deliveryDate: { $lt: now },
      status: { $nin: ['delivered', 'cancelled', 'failed'] }
    })
  ]);

  res.status(200).json({
    success: true,
    count: deliveries.length,
    total,
    counts: {
      upcoming: upcomingCount,
      delivered: deliveredCount,
      overdue: overdueCount
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
      total
    },
    data: deliveries,
  });
});


// @desc    Customer confirms remnant entry
// @route   PUT /api/v1/deliveries/remnant/:id/confirm
// @access  Private
exports.confirmRemnantEntry = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { notes } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const remnant = await Remnant.findOne({
      _id: req.params.id,
      userId: userId,
    }).session(session);

    if (!remnant) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Remnant record not found", 404));
    }

    if (
      remnant.status === "active" &&
      remnant.customerConfirmation?.confirmed
    ) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Remnant already confirmed", 400));
    }

    // Mark all pending partial deliveries as confirmed
    let totalConfirmedKg = 0;
    remnant.partialDeliveries.forEach((pd) => {
      if (!pd.confirmed) {
        pd.confirmed = true;
        pd.confirmedAt = new Date();
        totalConfirmedKg += pd.remaining;
      }
    });

    // Update customer confirmation
    remnant.customerConfirmation = {
      confirmed: true,
      confirmedAt: new Date(),
      customerNotes: notes || "",
      confirmedBy: userId,
    };

    // Update status to active
    remnant.status = "active";

    await remnant.save({ session });

    // Update associated deliveries to mark remnant as confirmed
    const deliveryIds = remnant.partialDeliveries.map((pd) => pd.deliveryId);
    await Delivery.updateMany(
      { _id: { $in: deliveryIds } },
      {
        $set: {
          remnantConfirmed: true,
          "customerConfirmation.confirmed": true,
          "customerConfirmation.confirmedAt": new Date(),
        },
      },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Remnant entry confirmed successfully",
      data: {
        ...remnant.toObject(),
        totalConfirmedKg,
        note: "Remnant now available for delivery requests",
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(
      new ErrorResponse("Error confirming remnant: " + error.message, 500),
    );
  }
});


// @desc    Request delivery of accumulated remnant
// @route   POST /api/v1/deliveries/remnant/request-delivery
// @access  Private
exports.requestRemnantDelivery = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  let { requestedKg, deliveryDate, address, notes } = req.body;

  requestedKg = Number(requestedKg);

  if (Number.isNaN(requestedKg)) {
    return next(new ErrorResponse("requestedKg must be a number", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const remnant = await Remnant.findOne({
      userId: userId,
      status: "active",
    }).session(session);

    if (!remnant) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("No active remnant record found", 404));
    }

    // Check if remnant is confirmed by customer
    if (!remnant.customerConfirmation?.confirmed) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("Please confirm your remnant entries first", 400),
      );
    }

    // Check for unconfirmed partial deliveries
    const unconfirmedDeliveries = remnant.partialDeliveries.filter(
      (pd) => !pd.confirmed,
    );
    if (unconfirmedDeliveries.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          `Please confirm ${unconfirmedDeliveries.length} pending remnant entries first`,
          400,
        ),
      );
    }

    if (remnant.accumulatedKg < 6) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          `Minimum 6kg required. You have ${remnant.accumulatedKg}kg accumulated`,
          400,
        ),
      );
    }

    if (requestedKg > remnant.accumulatedKg) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          `Cannot request more than ${remnant.accumulatedKg}kg available`,
          400,
        ),
      );
    }

    // Get user details
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("User not found", 404));
    }

    // Create subscription for remnant delivery
    const reference = `REMNANT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const oneTimeSubscription = await Subscription.create(
      [
        {
          userId: userId,
          planName: `Remnant Gas Delivery - ${requestedKg}kg`,
          planType: "one-time",
          size: `${requestedKg}kg`,
          frequency: "One-Time",
          subscriptionPeriod: 1,
          price: 0,
          reference: reference,
          status: "active",
          paymentStatus: "completed",
          isPaid: true,
          paidAt: new Date(),
          paymentMethod: "remnant",
          startDate: new Date(),
          endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          isRemnantSubscription: true,
          remnantId: remnant._id,
        },
      ],
      { session },
    );

    const subscription = oneTimeSubscription[0];

    // Create delivery order (status: assigned, not delivered)
    const delivery = await Delivery.create(
      [
        {
          subscriptionId: subscription._id,
          userId: userId,
          deliveryDate: deliveryDate || new Date(),
          scheduledDate: new Date(),
          status: "pending",
          address: address || user.address,
          customerPhone: user.phone,
          customerName: `${user.firstName} ${user.lastName}`,
          planDetails: {
            planName: "Remnant Gas Delivery",
            size: `${requestedKg}kg`,
            frequency: "One-Time",
            price: 0,
            isRemnantDelivery: true,
          },
          isRemnantDelivery: true,
          isOneTimeRemnantDelivery: true,
          remnantId: remnant._id,
          requestedKg: requestedKg,
          customerNotes: notes || "",
          customerConfirmation: {
            confirmed: false,
            required: true,
          },
        },
      ],
      { session },
    );

    // Update subscription with delivery ID
    subscription.deliveries.push(delivery[0]._id);
    await subscription.save({ session });

    // Deduct from remnant
    remnant.accumulatedKg -= requestedKg;
    remnant.deliveredFromRemnant =
      (remnant.deliveredFromRemnant || 0) + requestedKg;

    // Add delivery request (status: pending delivery)
    remnant.deliveryRequests.push({
      deliveryId: delivery[0]._id,
      requestedKg: requestedKg,
      date: new Date(),
      subscriptionId: subscription._id,
      status: "pending", // Will change to 'delivered' after agent delivery + customer confirmation
    });

    // If remnant reaches 0, mark as completed
    if (remnant.accumulatedKg <= 0) {
      remnant.accumulatedKg = 0;
      remnant.status = "completed";
    }

    await remnant.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Remnant delivery requested successfully",
      data: {
        delivery: delivery[0],
        subscription: {
          _id: subscription._id,
          reference: subscription.reference,
          planName: subscription.planName,
        },
        remainingAccumulated: remnant.accumulatedKg,
        note: "Delivery has been assigned and will be processed",
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return next(
      new ErrorResponse(
        "Error requesting remnant delivery: " + error.message,
        500,
      ),
    );
  }
});


// @desc    Get customer's remnant details
// @route   GET /api/v1/deliveries/remnant/my-remnant
// @access  Private
exports.getMyRemnant = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  // Find remnant record - show even if no active record
  const remnant = await Remnant.findOne({ userId })
    .populate({
      path: "partialDeliveries.deliveryId",
      select: "deliveryDate planDetails agentNotes deliveredKg remainingKg",
    })
    .populate({
      path: "deliveryRequests.deliveryId",
      select: "status deliveryDate deliveryAgent deliveredAt",
    })
    .populate({
      path: "deliveryRequests.subscriptionId",
      select: "planName reference",
    });

  // Get previous history even if no remnant record
  const previousDeliveries = await Delivery.find({
    userId: userId,
    isRemnantDelivery: true,
    status: "delivered",
  })
    .select("deliveryDate deliveredAt requestedKg planDetails")
    .sort({ deliveryDate: -1 })
    .limit(10);

  res.status(200).json({
    success: true,
    data: {
      current: remnant || {
        userId: userId,
        accumulatedKg: 0,
        status: "no_record",
        partialDeliveries: [],
        deliveryRequests: [],
      },
      history: previousDeliveries,
      pendingConfirmations:
        remnant?.partialDeliveries?.filter((p) => !p.confirmed) || [],
      totalAccumulated: remnant?.accumulatedKg || 0,
      canRequestDelivery:
        remnant?.accumulatedKg >= 6 && remnant?.customerConfirmation?.confirmed,
    },
  });
});


// @desc    Get next upcoming delivery for user
// @route   GET /api/v1/deliveries/next-delivery
// @access  Private
exports.getNextDelivery = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  try {
    // Find the earliest upcoming delivery from today onward
    const nextDelivery = await Delivery.findOne({
      userId: userId,
      deliveryDate: { $gte: today },
      status: { $in: ["pending", "assigned", "accepted", "out_for_delivery"] },
    })
      .populate({
        path: "subscriptionId",
        select: "planName size frequency status",
        model: Subscription,
      })
      .populate({
        path: "userId",
        select: "firstName lastName email phone address",
        model: User,
      })
      .sort({ deliveryDate: 1 }) // Sort by earliest date first
      .limit(1);

    if (!nextDelivery) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No upcoming deliveries found",
      });
    }

    // Format the response
    const response = {
      deliveryId: nextDelivery._id,
      deliveryDate: nextDelivery.deliveryDate,
      status: nextDelivery.status,
      subscription: null,
      isUpcoming: nextDelivery.deliveryDate > new Date(), // True if future date
    };

    // If delivery has subscription info, extract it
    if (nextDelivery.subscriptionId) {
      response.subscription = {
        id: nextDelivery.subscriptionId._id,
        name: nextDelivery.subscriptionId.planName,
        size: nextDelivery.subscriptionId.size,
        frequency: nextDelivery.subscriptionId.frequency,
        status: nextDelivery.subscriptionId.status,
      };
    } else if (nextDelivery.planDetails) {
      // Fallback to planDetails from delivery
      response.subscription = {
        name: nextDelivery.planDetails.planName || "Remnant Delivery",
        size: nextDelivery.planDetails.size || "N/A",
        frequency: nextDelivery.planDetails.frequency || "One-Time",
        status: "active",
      };
    }

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error fetching next delivery:", error);
    return next(new ErrorResponse("Failed to fetch next delivery", 500));
  }
});


// Helper function to calculate delivery dates
// Helper function to calculate delivery dates
// Helper function to calculate delivery dates
const calculateDeliveryDates = (subscription, startDate, endDate) => {
  const dates = [];
  let currentDate = new Date(subscription.startDate);

  while (currentDate <= endDate) {
    if (currentDate >= startDate) {
      dates.push(new Date(currentDate));
    }

    // Calculate next delivery date based on frequency
    switch (subscription.frequency) {
      case "Daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "Weekly":
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case "Bi-Weekly":
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case "Monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "One-Time":
        currentDate = new Date(endDate); // Break loop for one-time
        break;
      default:
        currentDate.setDate(currentDate.getDate() + 30); // Default monthly
    }
  }

  return dates;
};

// controllers/deliveryController.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const Delivery = require("../../models/Delivery");
const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const ErrorResponse = require("../../utils/errorResponse");
const asyncHandler = require("../../middleware/async");
const Remnant = require("../../models/Remnant");
const Notification = require("../../models/Notification");
const {
  validateObjectId,
  auditLog,
  rateLimiter,
} = require("../../middleware/security");

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
      { customerName: { $regex: search, $options: "i" } },
      { customerPhone: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
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
      select:
        "firstName lastName email phone address city state gpsCoordinates profileImage",
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
    return next(
      new ErrorResponse("Delivery already assigned to an agent", 400),
    );
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
    const statuses = status.split(",").map((s) => s.trim());
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
    return next(
      new ErrorResponse("Delivery order not found or not assigned to you", 404),
    );
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
    return next(
      new ErrorResponse("Delivery order not found or not assigned to you", 404),
    );
  }

  if (!["assigned", "accepted"].includes(delivery.status)) {
    return next(
      new ErrorResponse("Delivery must be assigned or accepted first", 400),
    );
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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      deliveryAgent: agentId,
    })
      .populate("subscriptionId")
      .session(session);

    if (!delivery) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          "Delivery order not found or not assigned to you",
          404,
        ),
      );
    }

    if (delivery.status === "delivered") {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("Delivery already marked as delivered", 400),
      );
    }

    // Mark delivery as delivered but pending customer confirmation
    delivery.status = "delivered";
    delivery.deliveredAt = new Date();
    delivery.agentNotes = notes;
    delivery.customerConfirmation = {
      confirmed: false,
      required: true,
      pendingSince: new Date(),
    };

    // Handle remnant deliveries
    if (delivery.isOneTimeRemnantDelivery && delivery.remnantId) {
      const remnant = await Remnant.findById(delivery.remnantId).session(
        session,
      );
      if (remnant) {
        // Mark delivery request as delivered but pending customer confirmation
        remnant.deliveryRequests = remnant.deliveryRequests.map((request) => {
          if (request.deliveryId.toString() === delivery._id.toString()) {
            request.status = "delivered";
            request.deliveredAt = new Date();
            request.customerConfirmed = false;
          }
          return request;
        });

        // Mark remnant subscription as delivered but pending confirmation
        if (delivery.subscriptionId) {
          delivery.subscriptionId.status = "expired";
          delivery.subscriptionId.deliveredAt = new Date();
          // Set end date to delivered date but keep pending confirmation
          delivery.subscriptionId.endDate = new Date();
          await delivery.subscriptionId.save({ session });
        }

        await remnant.save({ session });
      }
    }

    await delivery.save({ session });

    // Update subscription delivery history
    await Subscription.findByIdAndUpdate(
      delivery.subscriptionId,
      {
        $push: { deliveries: delivery._id },
      },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Send notification to customer to confirm delivery
    try {
      await Notification.create({
        userId: delivery.userId,
        title: "Delivery Completed - Please Confirm",
        message:
          "Your gas has been delivered. Please confirm receipt in your dashboard.",
        type: "delivery",
        subType: "delivery_fulfilled",
        data: { deliveryId: delivery._id },
      });
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: "Delivery marked as delivered. Awaiting customer confirmation.",
      data: {
        ...delivery.toObject(),
        note: "Customer confirmation required before finalizing",
      },
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    session.endSession();
    return next(
      new ErrorResponse(
        "Error marking delivery as delivered: " + error.message,
        500,
      ),
    );
  }
});
// exports.markAsDelivered = asyncHandler(async (req, res, next) => {
//   const agentId = req.user.id;
//   const { notes } = req.body;

//   const delivery = await Delivery.findOne({
//     _id: req.params.id,
//     deliveryAgent: agentId,
//   });

//   if (!delivery) {
//     return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
//   }

//   if (delivery.status === "delivered") {
//     return next(new ErrorResponse("Delivery already marked as delivered", 400));
//   }

//   // Handle remnant deliveries
//   if (delivery.isOneTimeRemnantDelivery && delivery.remnantId) {
//     // Update remnant status
//     const remnant = await Remnant.findById(delivery.remnantId);
//     if (remnant) {
//       // Mark the specific delivery request as delivered
//       remnant.deliveryRequests = remnant.deliveryRequests.map(request => {
//         if (request.deliveryId.toString() === delivery._id.toString()) {
//           request.status = 'delivered';
//         }
//         return request;
//       });
//       await remnant.save();
//     }
//   }

//   // Mark delivery as delivered
//   delivery.status = "delivered";
//   delivery.deliveredAt = new Date();
//   delivery.agentNotes = notes;

//   await delivery.save();

//   // Update subscription delivery history
//   await Subscription.findByIdAndUpdate(
//     delivery.subscriptionId,
//     {
//       $push: { deliveries: delivery._id },
//     }
//   );

//   // If this is a one-time remnant delivery, mark subscription as expired
//   if (delivery.isOneTimeRemnantDelivery && delivery.subscriptionId) {
//     await Subscription.findByIdAndUpdate(
//       delivery.subscriptionId,
//       {
//         status: "expired",
//         expiredAt: new Date(),
//         endDate: new Date()
//       }
//     );
//   }

//   res.status(200).json({
//     success: true,
//     message: "Delivery marked as successful",
//     data: delivery,
//   });
// });

// @desc    Mark delivery as failed
// @route   PUT /api/v1/deliveries/:id/failed
// @access  Private/DeliveryAgent

exports.markAsFailed = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { reason, notes, postponeToDate } = req.body;

  if (!reason) {
    return next(new ErrorResponse("Failure reason is required", 400));
  }

  // Start a session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      deliveryAgent: agentId,
    })
      .populate("subscriptionId")
      .session(session);

    if (!delivery) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          "Delivery order not found or not assigned to you",
          404,
        ),
      );
    }

    if (delivery.status === "delivered") {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse("Cannot mark delivered order as failed", 400),
      );
    }

    // Store original values for audit
    const originalStatus = delivery.status;
    const originalDeliveryDate = delivery.deliveryDate;

    // Check if this is a retry attempt
    const isRetry = delivery.retryCount > 0 || delivery.status === "failed";

    // Determine new delivery date (postponed to specified date or next day)
    let newDeliveryDate;
    if (postponeToDate) {
      newDeliveryDate = new Date(postponeToDate);
    } else {
      newDeliveryDate = new Date();
      newDeliveryDate.setDate(newDeliveryDate.getDate() + 1);
    }

    // Record failure but allow fresh delivery flow
    delivery.failedReason = reason;
    delivery.failedAt = new Date();
    delivery.agentNotes = notes;
    delivery.retryCount = (delivery.retryCount || 0) + 1;
    delivery.isRetry = true;

    // Reset delivery to pending for a new attempt
    delivery.status = "pending";

    // Store failure history
    if (!delivery.failureHistory) delivery.failureHistory = [];
    delivery.failureHistory.push({
      attemptedAt: new Date(),
      reason: reason,
      notes: notes,
      agentId: agentId,
    });

    // If this is a retry, keep the same delivery record with updated date
    if (isRetry) {
      delivery.deliveryDate = newDeliveryDate;
      delivery.scheduledDate = newDeliveryDate;
      delivery.status = "pending";

      await delivery.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: "Delivery retry scheduled",
        data: {
          delivery,
          retryCount: delivery.retryCount,
          nextAttemptDate: newDeliveryDate,
          note: "This is a retry of the same delivery",
        },
      });
    }

    // Handle remnant deliveries differently
    if (delivery.isOneTimeRemnantDelivery) {
      const remnant = await Remnant.findOne({
        _id: delivery.remnantId,
      }).session(session);

      if (remnant) {
        remnant.deliveryRequests = remnant.deliveryRequests.map((request) => {
          if (request.deliveryId.toString() === delivery._id.toString()) {
            request.status = "pending"; // reset for retry
          }
          return request;
        });

        // If remnant was previously completed, reopen it
        if (remnant.status === "completed") {
          remnant.status = "active";
        }

        await remnant.save({ session });
      }

      // Do NOT fail the subscription — keep it active
      if (delivery.subscriptionId) {
        delivery.subscriptionId.status = "active";
        await delivery.subscriptionId.save({ session });
      }

      // Reschedule delivery like regular delivery
      delivery.deliveryDate = newDeliveryDate;
      delivery.scheduledDate = newDeliveryDate;
      delivery.status = "pending";
    }

    await delivery.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Send notification to customer
    try {
      await Notification.create({
        userId: delivery.userId,
        title: "Delivery Failed",
        message: `Delivery failed: ${reason}. New delivery scheduled for ${newDeliveryDate.toLocaleDateString()}`,
        type: "delivery",
        subType: "delivery_failed",
        data: { deliveryId: delivery._id },
      });
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: isRetry
        ? "Delivery marked for retry"
        : "Delivery failed and rescheduled",
      data: {
        delivery,
        nextAttemptDate: newDeliveryDate,
        retryCount: delivery.retryCount,
      },
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    session.endSession();
    return next(
      new ErrorResponse(
        "Error processing failed delivery: " + error.message,
        500,
      ),
    );
  }
});

// exports.markAsFailed = asyncHandler(async (req, res, next) => {
//   const agentId = req.user.id;
//   const { reason, notes } = req.body;

//   if (!reason) {
//     return next(new ErrorResponse("Failure reason is required", 400));
//   }

//   const delivery = await Delivery.findOne({
//     _id: req.params.id,
//     deliveryAgent: agentId,
//   }).populate("subscriptionId");

//   if (!delivery) {
//     return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
//   }

//   if (delivery.status === "delivered") {
//     return next(new ErrorResponse("Cannot mark delivered order as failed", 400));
//   }

//   // Mark current order as failed
//   delivery.status = "failed";
//   delivery.failedReason = reason;
//   delivery.failedAt = new Date();
//   delivery.agentNotes = notes;
//   await delivery.save();

//   // Handle remnant deliveries differently
//   if (delivery.isOneTimeRemnantDelivery) {
//     // Return the remnant kg to the user's balance
//     const remnant = await Remnant.findOne({ _id: delivery.remnantId });
//     if (remnant) {
//       remnant.accumulatedKg += delivery.requestedKg;
//       if (remnant.status === "completed") {
//         remnant.status = "active";
//       }
//       await remnant.save();
//     }

//     // Mark the one-time subscription as cancelled
//     if (delivery.subscriptionId) {
//       await Subscription.findByIdAndUpdate(
//         delivery.subscriptionId,
//         {
//           status: "cancelled",
//           cancelledAt: new Date()
//         }
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Remnant delivery marked as failed. Remnant balance restored.",
//       data: {
//         failedOrder: delivery,
//         remnantBalanceRestored: delivery.requestedKg,
//         note: "Customer needs to request a new remnant delivery"
//       },
//     });
//   }

//   // Original logic for regular deliveries
//   const newDeliveryDate = new Date();
//   newDeliveryDate.setDate(newDeliveryDate.getDate() + 1);

//   const newDelivery = new Delivery({
//     subscriptionId: delivery.subscriptionId,
//     userId: delivery.userId,
//     deliveryAgent: agentId,
//     deliveryDate: newDeliveryDate,
//     scheduledDate: newDeliveryDate,
//     status: "assigned",
//     address: delivery.address,
//     customerPhone: delivery.customerPhone,
//     customerName: delivery.customerName,
//     planDetails: delivery.planDetails,
//     retryCount: (delivery.retryCount || 0) + 1,
//     previousAttempt: delivery._id,
//   });

//   await newDelivery.save();

//   res.status(200).json({
//     success: true,
//     message: "Delivery marked as failed and rescheduled",
//     data: {
//       failedOrder: delivery,
//       rescheduledOrder: newDelivery,
//     },
//   });
// });

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

// @desc    Get delivery statistics
// @route   GET /api/v1/deliveries/stats
// @access  Private/Admin
exports.getDeliveryStats = asyncHandler(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Add remnant stats
  const remnantStats = await Remnant.aggregate([
    {
      $match: { status: "active" },
    },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        totalAccumulatedKg: { $sum: "$accumulatedKg" },
        avgAccumulatedKg: { $avg: "$accumulatedKg" },
      },
    },
  ]);

  const customersWithRemnant = await Remnant.distinct("userId", {
    status: "active",
  });

  stats.remnants = {
    totalCustomers: remnantStats[0]?.totalCustomers || 0,
    totalAccumulatedKg: remnantStats[0]?.totalAccumulatedKg || 0,
    avgAccumulatedKg: remnantStats[0]?.avgAccumulatedKg || 0,
    customersWithRemnant: customersWithRemnant.length || 0,
  };

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
    if (
      ["pending", "assigned", "accepted", "out_for_delivery"].includes(stat._id)
    ) {
      stats.today.pending += stat.count;
    }
    if (stat._id === "failed") stats.today.failed = stat.count;
  });

  overallStats.forEach((stat) => {
    stats.overall.total += stat.count;
    if (stat._id === "delivered") stats.overall.delivered = stat.count;
    if (
      ["pending", "assigned", "accepted", "out_for_delivery"].includes(stat._id)
    ) {
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
  const { daysAhead = 7 } = req.body;

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
        endDate,
      );

      for (const deliveryDate of deliveryDates) {
        // Check if delivery already exists for this date
        const existingDelivery = await Delivery.findOne({
          subscriptionId: subscription._id,
          deliveryDate: {
            $gte: new Date(deliveryDate.setHours(0, 0, 0, 0)),
            $lt: new Date(deliveryDate.setHours(23, 59, 59, 999)),
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

// @desc    Record remaining gas after partial delivery
// @route   PUT /api/v1/deliveries/:id/partial-delivery
// @access  Private/DeliveryAgent

exports.recordPartialDelivery = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { deliveredKg, remainingKg, notes } = req.body;

  if (!deliveredKg || !remainingKg) {
    return next(
      new ErrorResponse("Both delivered and remaining kg are required", 400),
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const delivery = await Delivery.findOne({
      _id: req.params.id,
      deliveryAgent: agentId,
    })
      .populate("userId")
      .populate("subscriptionId")
      .session(session);

    if (!delivery) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          "Delivery order not found or not assigned to you",
          404,
        ),
      );
    }

    if (delivery.status === "delivered") {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse("Delivery already completed", 400));
    }

    if (delivery.partialDeliveryRecorded) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(
          "Partial delivery already recorded for this schedule",
          400,
        ),
      );
    }

    // Calculate expected kg from subscription
    const expectedKg = parseFloat(delivery.planDetails.size.split("kg")[0]);
    const delivered = parseFloat(deliveredKg);
    const remaining = parseFloat(remainingKg);

    if (Math.abs(delivered + remaining - expectedKg) > 0.01) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new ErrorResponse(`Total must equal expected ${expectedKg}kg`, 400),
      );
    }

    // Mark delivery as delivered with partial info (pending customer confirmation)
    delivery.status = "delivered";
    delivery.deliveredAt = new Date();
    delivery.agentNotes = notes || "";
    delivery.deliveredKg = delivered;
    delivery.remainingKg = remaining;
    delivery.partialDelivery = {
      isPartial: true,
      delivered: delivered,
      remaining: remaining,
      recordedBy: agentId,
      recordedAt: new Date(),
      customerConfirmed: false, // Added: require customer confirmation
    };
    delivery.partialDeliveryRecorded = true;
    delivery.customerConfirmation = {
      confirmed: false,
      required: true,
      pendingSince: new Date(),
    };

    await delivery.save({ session });

    // Create or update remnant record (pending customer confirmation)
    let remnant = await Remnant.findOne({
      userId: delivery.userId,
      status: { $in: ["active", "pending_confirmation"] },
    }).session(session);

    if (!remnant) {
      remnant = new Remnant({
        userId: delivery.userId,
        userName: delivery.customerName,
        userPhone: delivery.customerPhone,
        accumulatedKg: 0,
        status: "pending_confirmation",
        partialDeliveries: [],
      });
    }

    // Add partial delivery with unconfirmed status
    remnant.partialDeliveries.push({
      deliveryId: delivery._id,
      originalKg: expectedKg,
      delivered: delivered,
      remaining: remaining,
      date: new Date(),
      confirmed: false, // Not confirmed by customer yet
    });

    // Increment accumulated kg only after confirmation?
    // For now, add but mark as pending
    remnant.accumulatedKg += remaining;
    remnant.status = "pending_confirmation";
    remnant.lastUpdated = new Date();

    await remnant.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Send notification to customer to confirm remnant entry
    try {
      await Notification.create({
        userId: delivery.userId._id,
        title: "Partial Delivery - Please Confirm Remnant",
        message: `${delivered}kg delivered, ${remaining}kg added to your remnant account. Please confirm.`,
        type: "delivery_confirmation", // Use an allowed value
        data: {
          deliveryId: delivery._id,
          remnantId: remnant._id,
        },
      });
    } catch (notifError) {
      // Log but don't fail the request if notification fails
      console.error("Failed to create notification:", notifError);
    }

    res.status(200).json({
      success: true,
      message: "Partial delivery recorded. Customer confirmation required.",
      data: {
        delivery,
        remnant,
        note: "Customer must confirm remnant entry before it becomes available",
      },
    });
  } catch (error) {
    // Only abort if transaction is still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Error recording partial delivery:", error);
    return next(
      new ErrorResponse(
        "Error recording partial delivery: " + error.message,
        500,
      ),
    );
  }
});

// exports.recordPartialDelivery = asyncHandler(async (req, res, next) => {
//   const agentId = req.user.id;
//   const { deliveredKg, remainingKg, notes } = req.body;

//   // Validate inputs
//   if (!deliveredKg || !remainingKg) {
//     return next(new ErrorResponse("Both delivered and remaining kg are required", 400));
//   }

//   const delivery = await Delivery.findOne({
//     _id: req.params.id,
//     deliveryAgent: agentId,
//   }).populate("userId").populate("subscriptionId");

//   if (!delivery) {
//     return next(new ErrorResponse("Delivery order not found or not assigned to you", 404));
//   }

//   // Check if delivery already completed
//   if (delivery.status === "delivered") {
//     return next(new ErrorResponse("Delivery already completed", 400));
//   }

//   // Check if partial delivery already recorded for this schedule
//   if (delivery.partialDeliveryRecorded) {
//     return next(new ErrorResponse("Partial delivery already recorded for this schedule", 400));
//   }

//   // Calculate expected kg from subscription
//   const expectedKg = parseFloat(delivery.planDetails.size.split('kg')[0]);
//   const delivered = parseFloat(deliveredKg);
//   const remaining = parseFloat(remainingKg);

//   // Validate total equals expected
//   if (Math.abs(delivered + remaining - expectedKg) > 0.01) {
//     return next(new ErrorResponse(`Total must equal expected ${expectedKg}kg`, 400));
//   }

//   // Mark delivery as delivered with partial info
//   delivery.status = "delivered";
//   delivery.deliveredAt = new Date();
//   delivery.agentNotes = notes || "";
//   delivery.deliveredKg = delivered;
//   delivery.remainingKg = remaining;
//   delivery.partialDelivery = {
//     isPartial: true,
//     delivered: delivered,
//     remaining: remaining,
//     recordedBy: agentId,
//     recordedAt: new Date()
//   };
//   delivery.partialDeliveryRecorded = true; // Prevent future partial recordings

//   await delivery.save();

//   // Create or update remnant record
//   const remnant = await Remnant.findOneAndUpdate(
//     { userId: delivery.userId, status: "active" },
//     {
//       $inc: { accumulatedKg: remaining },
//       $push: {
//         partialDeliveries: {
//           deliveryId: delivery._id,
//           originalKg: expectedKg,
//           delivered: delivered,
//           remaining: remaining,
//           date: new Date(),
//           confirmed: false // Initially not confirmed by customer
//         }
//       },
//       lastUpdated: new Date()
//     },
//     { upsert: true, new: true, setDefaultsOnInsert: true }
//   );

//   // Update user info in remnant
//   if (delivery.userId) {
//     remnant.userName = delivery.customerName;
//     remnant.userPhone = delivery.customerPhone;
//     await remnant.save();
//   }

//   res.status(200).json({
//     success: true,
//     message: "Partial delivery recorded and marked as delivered",
//     data: {
//       delivery,
//       remnant,
//       totalAccumulated: remnant.accumulatedKg,
//       note: "Customer needs to confirm remnant entry before requesting delivery"
//     }
//   });
// });

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

// exports.confirmRemnantEntry = asyncHandler(async (req, res, next) => {
//   const userId = req.user.id;
//   const { notes } = req.body; // This comes from frontend as 'notes'

//   console.log('Confirming remnant - User ID:', userId);
//   console.log('Remnant ID:', req.params.id);
//   console.log('Received notes:', notes);

//   const remnant = await Remnant.findOne({
//     _id: req.params.id,
//     userId: userId  // This matches your schema
//   });

//   console.log('Found remnant:', remnant ? 'Yes' : 'No');

//   if (!remnant) {
//     return next(new ErrorResponse("Remnant record not found", 404));
//   }

//   if (remnant.status !== "active" && remnant.status !== "pending_confirmation") {
//     return next(new ErrorResponse("Remnant record is not active or pending confirmation", 400));
//   }

//   // Mark all pending partial deliveries as confirmed
//   remnant.partialDeliveries.forEach(pd => {
//     if (!pd.confirmed) {  // Note: schema uses 'confirmed' not 'customerConfirmed'
//       pd.confirmed = true;
//       pd.confirmedAt = new Date();
//     }
//   });

//   // Update customer confirmation
//   remnant.customerConfirmation = {
//     confirmed: true,
//     confirmedAt: new Date(),
//     customerNotes: notes || "",  // Store as customerNotes
//     confirmedBy: userId
//   };

//   // Update status
//   remnant.status = 'active';

//   // Save and return the updated document
//   await remnant.save();

//   res.status(200).json({
//     success: true,
//     message: "Remnant entry confirmed successfully",
//     data: remnant
//   });
// });

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

// exports.requestRemnantDelivery = asyncHandler(async (req, res, next) => {
//   const userId = req.user.id;
//   let { requestedKg, deliveryDate, address, notes } = req.body;

//   requestedKg = Number(requestedKg);

// if (Number.isNaN(requestedKg)) {
//   return next(new ErrorResponse("requestedKg must be a number", 400));
// }

//   const remnant = await Remnant.findOne({
//     userId: userId,
//     status: "active"
//   });

//   if (!remnant) {
//     return next(new ErrorResponse("No accumulated remnant found", 404));
//   }

//   if (remnant.accumulatedKg < 6) {
//     return next(new ErrorResponse(`Minimum 6kg required. You have ${remnant.accumulatedKg}kg accumulated`, 400));
//   }

//   if (requestedKg > remnant.accumulatedKg) {
//     return next(new ErrorResponse(`Cannot request more than ${remnant.accumulatedKg}kg available`, 400));
//   }

//   // Get user details for subscription
//   const user = await User.findById(userId);
//   if (!user) {
//     return next(new ErrorResponse("User not found", 404));
//   }

//   // Generate unique reference
//   const reference = `REMNANT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

//   // Create a one-time subscription for this remnant delivery with ALL required fields
//   const oneTimeSubscription = await Subscription.create({
//     userId: userId,
//     planName: `Remnant Gas Delivery - ${requestedKg}kg`,
//     planType: "one-time",
//     size: `${requestedKg}kg`,
//     frequency: "One-Time",
//     subscriptionPeriod: 1,
//     price: 0,
//     reference: reference,
//     order: null,
//     status: "active",
//     paymentStatus: "completed",
//     isPaid: true,
//     paidAt: new Date(),
//     paymentMethod: "wallet",
//     startDate: new Date(),
//     endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Required - expires in 30 days
//     // Optional fields with defaults
//     deliveries: [],
//     customPlanDetails: {
//       size: `${requestedKg}kg`,
//       frequency: "One-Time",
//       subscriptionPeriod: 1
//     },
//     isRemnantSubscription: true,
//     remnantId: remnant._id,
//     // Other fields that might need values
//     remainingDuration: 1,
//     remainingDays: 1,
//     pauseHistory: []
//   });

//   // Create remnant delivery order
//   const delivery = await Delivery.create({
//     subscriptionId: oneTimeSubscription._id,
//     userId: userId,
//     deliveryDate: deliveryDate || new Date(),
//     scheduledDate: new Date(),
//     status: "pending",
//     address: address || user.address,
//     customerPhone: user.phone,
//     customerName: `${user.firstName} ${user.lastName}`,
//     planDetails: {
//       planName: "Remnant Gas Delivery",
//       size: `${requestedKg}kg`,
//       frequency: "One-Time",
//       price: 0,
//       isRemnantDelivery: true
//     },
//     isRemnantDelivery: true,
//     remnantId: remnant._id,
//     requestedKg: requestedKg,
//     customerNotes: notes || "",
//     isOneTimeRemnantDelivery: true
//   });

//   // Add delivery to subscription's deliveries array
//   await Subscription.findByIdAndUpdate(
//     oneTimeSubscription._id,
//     {
//       $push: { deliveries: delivery._id }
//     }
//   );

//   // Deduct from remnant
//   remnant.accumulatedKg -= requestedKg;

//   if (!remnant.deliveredFromRemnant) {
//     remnant.deliveredFromRemnant = 0;
//   }
//   remnant.deliveredFromRemnant =
//   Number(remnant.deliveredFromRemnant || 0) + requestedKg;

//   // If remnant reaches 0, mark as completed
//   if (remnant.accumulatedKg <= 0) {
//     remnant.accumulatedKg = 0;
//     remnant.status = "completed";
//   }

//   remnant.deliveryRequests.push({
//     deliveryId: delivery._id,
//     requestedKg: requestedKg,
//     date: new Date(),
//     subscriptionId: oneTimeSubscription._id
//   });

//   await remnant.save();

//   res.status(201).json({
//     success: true,
//     message: "Remnant delivery requested successfully",
//     data: {
//       delivery,
//       subscription: {
//         _id: oneTimeSubscription._id,
//         reference: oneTimeSubscription.reference,
//         planName: oneTimeSubscription.planName
//       },
//       remainingAccumulated: remnant.accumulatedKg
//     }
//   });
// });

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

// exports.getMyRemnant = asyncHandler(async (req, res, next) => {
//   const userId = req.user.id;

//   const remnant = await Remnant.findOne({
//     userId: userId,
//     status: "active"
//   }).populate({
//     path: "partialDeliveries.deliveryId",
//     select: "deliveryDate planDetails agentNotes"
//   }).populate({
//     path: "deliveryRequests.deliveryId",
//     select: "status deliveryDate deliveryAgent"
//   });

//   if (!remnant) {
//     return res.status(200).json({
//       success: true,
//       data: null,
//       message: "No active remnant record"
//     });
//   }

//   res.status(200).json({
//     success: true,
//     data: remnant
//   });
// });

// @desc    Get all remnants (admin)
// @route   GET /api/v1/deliveries/remnants
// @access  Private/Admin
exports.getAllRemnants = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, status, search, minKg, maxKg } = req.query;

  let filter = {};

  if (status && status !== "all") {
    filter.status = status;
  }

  if (minKg || maxKg) {
    filter.accumulatedKg = {};
    if (minKg) filter.accumulatedKg.$gte = parseFloat(minKg);
    if (maxKg) filter.accumulatedKg.$lte = parseFloat(maxKg);
  }

  if (search) {
    filter.$or = [
      { userName: { $regex: search, $options: "i" } },
      { userPhone: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const remnants = await Remnant.find(filter)
    .populate("userId", "firstName lastName email phone address")
    .sort({ lastUpdated: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Remnant.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: remnants.length,
    total,
    pagination: {
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
    data: remnants,
  });
});

// @desc    Get delivery agent's remnant deliveries
// @route   GET /api/v1/deliveries/agent/remnant-deliveries
// @access  Private/DeliveryAgent
exports.getAgentRemnantDeliveries = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const { status } = req.query;

  let filter = {
    deliveryAgent: agentId,
    isRemnantDelivery: true,
  };

  if (status && status !== "all") {
    filter.status = status;
  }

  const deliveries = await Delivery.find(filter)
    .populate("userId", "firstName lastName phone address")
    .populate("remnantId")
    .sort({ deliveryDate: -1 });

  res.status(200).json({
    success: true,
    count: deliveries.length,
    data: deliveries,
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

// @desc    Get delivery details by ID
// @route   GET /api/v1/deliveries/:id
// @access  Private
// exports.getDelivery = asyncHandler(async (req, res, next) => {
//   const userId = req.user.id;
//   const deliveryId = req.params.id;

//   const delivery = await Delivery.findOne({
//     _id: deliveryId,
//     userId: userId
//   })
//   .populate({
//     path: 'subscriptionId',
//     select: 'planName size frequency status startDate endDate',
//     model: Subscription
//   })
//   .populate({
//     path: 'userId',
//     select: 'firstName lastName email phone address',
//     model: User
//   })
//   .populate({
//     path: 'deliveryAgent',
//     select: 'firstName lastName phone',
//     model: User
//   });

//   if (!delivery) {
//     return next(new ErrorResponse('Delivery not found', 404));
//   }

//   // Check if user is authorized to view this delivery
//   if (delivery.userId._id.toString() !== userId && req.user.role !== 'admin') {
//     return next(new ErrorResponse('Not authorized to view this delivery', 403));
//   }

//   res.status(200).json({
//     success: true,
//     data: delivery
//   });
// });

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

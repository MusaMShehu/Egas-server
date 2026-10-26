const PlantRefillService = require('../services/plantRefillService');
const InspectionService = require('../services/inspectionService');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const PlantRefillRequest = require('../models/PlantRefillRequest');
const PlantRefillTransaction = require('../models/PlantRefillTransaction');
const dispatcher = require("../services/notifications/notificationDispatcher");

// ================================================================
// @desc    List refill requests for the authenticated plant
// @route   GET /api/v1/plant/refill-requests
// @access  Private/Plant
// ================================================================
exports.listRequests = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    fromDate,
    toDate,
    cylinderTag,
  } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    if (status.includes(',')) {
      filter.status = { $in: status.split(',').map((s) => s.trim()) };
    } else {
      filter.status = status;
    }
  }
  if (cylinderTag) {
    filter.cylinderTag = String(cylinderTag).toUpperCase().trim();
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const result = await PlantRefillService.listByPlant(
    req.plantId,
    filter,
    {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    }
  );

  res.status(200).json({
    success: true,
    count: result.items.length,
    total: result.pagination.total,
    pagination: result.pagination,
    data: result.items,
  });
});

// ================================================================
// @desc    Get single refill request (plant-scoped)
// @route   GET /api/v1/plant/refill-requests/:id
// @access  Private/Plant
// ================================================================
exports.getRequest = asyncHandler(async (req, res, next) => {
  const request = await PlantRefillService.getById(req.params.id);

  if (request.plantId._id.toString() !== req.plantId) {
    return next(new ErrorResponse('Not authorized for this plant', 403));
  }

  // Sanitize: strip customer payment info, internal E-GAS data
  const sanitized = {
    _id: request._id,
    requestNumber: request.requestNumber,
    status: request.status,
    cylinderTag: request.cylinderTag,
    cylinderSize: request.cylinderSize,
    emptyWeight: request.emptyWeight,
    measuredWeight: request.measuredWeight,
    calculatedRemnant: request.calculatedRemnant,
    requestedQuantity: request.requestedQuantity,
    agentReportedQuantity: request.agentReportedQuantity,
    plantConfirmedQuantity: request.plantConfirmedQuantity,
    pricePerKg: request.pricePerKg,
    agent: request.agentId
      ? {
          firstName: request.agentId.firstName,
          lastName: request.agentId.lastName,
          phone: request.agentId.phone,
        }
      : null,
    transaction: request.transactionId,
    attemptNumber: request.attemptNumber,
    agentNotes: request.agentNotes,
    rejectedReason: request.rejectedReason,
    receivedAt: request.receivedAt,
    confirmedAt: request.confirmedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };

  res.status(200).json({
    success: true,
    data: sanitized,
  });
});

// ================================================================
// @desc    Receive cylinder at plant
// @route   POST /api/v1/plant/refill-requests/:id/receive
// @access  Private/Plant
// ================================================================
exports.receiveCylinder = asyncHandler(async (req, res, next) => {
  const { gpsCoordinates } = req.body;

  let normalizedGps = null;
  if (gpsCoordinates) {
    if (Array.isArray(gpsCoordinates.coordinates) && gpsCoordinates.coordinates.length === 2) {
      normalizedGps = {
        type: 'Point',
        coordinates: gpsCoordinates.coordinates.map(Number),
      };
    } else if (gpsCoordinates.lat !== undefined && gpsCoordinates.lng !== undefined) {
      normalizedGps = {
        type: 'Point',
        coordinates: [Number(gpsCoordinates.lng), Number(gpsCoordinates.lat)],
      };
    }
  }

  const result = await PlantRefillService.receiveCylinder({
    requestId: req.params.id,
    plantId: req.plantId,
    plantStaffId: req.user._id,
    plantStaffRole: req.user.role,
    gpsCoordinates: normalizedGps,
    req,
  });

  // Notify agent
  // try {
  //   const io = req.app.get('io');
  //   const agentId = result.request.agentId;
  //   if (io && agentId) {
  //     io.to(`agent:${agentId}`).emit('refill_request.received', {
  //       requestId: result.request._id,
  //       requestNumber: result.request.requestNumber,
  //       receivedAt: result.request.receivedAt,
  //     });
  //   }
  // } catch (socketErr) {
  //   console.error('Socket emit failed (received):', socketErr.message);
  // }

  try {
  const io = req.app.get("io");
  if (io) {
    const agentId = result.request.agentId;
    if (agentId) {
      io.to(`agent:${agentId}`).emit("refill_request.received", {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        receivedAt: result.request.receivedAt,
      });
    }
  }
  dispatcher.refillRequestUpdate(result.request.agentId, result.request, "received");
} catch (socketErr) {
  console.error("Socket emit failed (received):", socketErr.message);
}


  res.status(200).json({
    success: true,
    message: 'Cylinder received',
    data: {
      request: result.request,
      transaction: result.transaction,
      nextAction: 'start_inspection',
    },
  });
});

// ================================================================
// @desc    Submit inspection
// @route   POST /api/v1/plant/refill-requests/:id/inspect
// @access  Private/Plant
// ================================================================
exports.submitInspection = asyncHandler(async (req, res, next) => {
  const {
    checklist,
    outcome,
    rejectionReason,
    rejectionNotes,
    photos,
    measuredWeightAtInspection,
  } = req.body;

  if (!outcome || !['approved', 'rejected'].includes(outcome)) {
    return next(new ErrorResponse('outcome must be approved or rejected', 400));
  }
  if (outcome === 'rejected' && !rejectionReason) {
    return next(new ErrorResponse('rejectionReason is required', 400));
  }

  const result = await InspectionService.submitInspection({
    requestId: req.params.id,
    plantId: req.plantId,
    plantStaffId: req.user._id,
    plantStaffRole: req.user.role,
    checklist,
    outcome,
    rejectionReason: rejectionReason || null,
    rejectionNotes: rejectionNotes || null,
    photos: photos || [],
    measuredWeightAtInspection: measuredWeightAtInspection || null,
    req,
  });

  // Notify agent
  // try {
  //   const io = req.app.get('io');
  //   const agentId = result.request.agentId;
  //   if (io && agentId) {
  //     const event = outcome === 'approved' ? 'refill_request.approved' : 'refill_request.rejected';
  //     io.to(`agent:${agentId}`).emit(event, {
  //       requestId: result.request._id,
  //       requestNumber: result.request.requestNumber,
  //       outcome,
  //       rejectionReason: rejectionReason || null,
  //     });
  //   }
  //   if (outcome === 'rejected') {
  //     io.to('admin:ops').emit('refill_request.rejected', {
  //       requestId: result.request._id,
  //       plantId: req.plantId,
  //       reason: rejectionReason,
  //     });
  //   }
  // } catch (socketErr) {
  //   console.error('Socket emit failed (inspection):', socketErr.message);
  // }

  try {
  const io = req.app.get("io");
  const agentId = result.request.agentId;
  if (io) {
    if (agentId) {
      const ev = outcome === "approved" ? "refill_request.approved" : "refill_request.rejected";
      io.to(`agent:${agentId}`).emit(ev, {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        outcome,
        rejectionReason: rejectionReason || null,
      });
    }
    if (outcome === "rejected") {
      io.to("admin:ops").emit("refill_request.rejected", {
        requestId: result.request._id,
        plantId: req.plantId,
        reason: rejectionReason,
      });
    }
  }
  dispatcher.refillRequestUpdate(agentId, result.request, outcome);
} catch (socketErr) {
  console.error("Socket emit failed (inspection):", socketErr.message);
}
  res.status(200).json({
    success: true,
    message: `Inspection ${outcome}`,
    data: {
      request: result.request,
      inspection: result.inspection,
      agentActionsAvailable: result.agentActionsAvailable || [],
      customerOrderStatus: result.affectedDelivery,
    },
  });
});

// ================================================================
// @desc    Record refill quantity
// @route   POST /api/v1/plant/refill-requests/:id/record-quantity
// @access  Private/Plant
// ================================================================
exports.recordQuantity = asyncHandler(async (req, res, next) => {
  const { plantConfirmedQuantity, notes } = req.body;

  if (plantConfirmedQuantity === undefined) {
    return next(new ErrorResponse('plantConfirmedQuantity is required', 400));
  }

  const qty = parseFloat(plantConfirmedQuantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return next(new ErrorResponse('plantConfirmedQuantity must be a positive number', 400));
  }

  const result = await PlantRefillService.recordQuantity({
    requestId: req.params.id,
    plantId: req.plantId,
    plantStaffId: req.user._id,
    plantStaffRole: req.user.role,
    plantConfirmedQuantity: qty,
    notes: notes || null,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Quantity recorded',
    data: {
      request: result.request,
      transaction: result.transaction,
      variance: result.variance,
      nextAction: 'confirm_refill',
    },
  });
});

// ================================================================
// @desc    Confirm refill (idempotent)
// @route   POST /api/v1/plant/refill-requests/:id/confirm
// @access  Private/Plant
// ================================================================
exports.confirmRefill = asyncHandler(async (req, res, next) => {
  const { idempotencyKey } = req.body;

  const result = await PlantRefillService.confirmRefill({
    requestId: req.params.id,
    plantId: req.plantId,
    plantStaffId: req.user._id,
    plantStaffRole: req.user.role,
    idempotencyKey: idempotencyKey || null,
    req,
  });

  // Notify agent
  // try {
  //   const io = req.app.get('io');
  //   const agentId = result.request.agentId;
  //   if (io && agentId) {
  //     io.to(`agent:${agentId}`).emit('refill_request.confirmed', {
  //       requestId: result.request._id,
  //       requestNumber: result.request.requestNumber,
  //       plantConfirmedQuantity: result.request.plantConfirmedQuantity,
  //       readyForCollection: true,
  //     });
  //   }
  //   io.to('admin:ops').emit('refill_request.confirmed', {
  //     requestId: result.request._id,
  //     plantId: req.plantId,
  //     variance: result.variance,
  //     requiresDispute: result.requiresDispute,
  //   });
  // } catch (socketErr) {
  //   console.error('Socket emit failed (confirmed):', socketErr.message);
  // }

  try {
  const io = req.app.get("io");
  const agentId = result.request.agentId;
  if (io) {
    if (agentId) {
      io.to(`agent:${agentId}`).emit("refill_request.confirmed", {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        plantConfirmedQuantity: result.request.plantConfirmedQuantity,
        readyForCollection: true,
      });
    }
    io.to("admin:ops").emit("refill_request.confirmed", {
      requestId: result.request._id,
      plantId: req.plantId,
      variance: result.variance,
      requiresDispute: result.requiresDispute,
    });
  }
  dispatcher.refillRequestUpdate(agentId, result.request, "confirmed");
} catch (socketErr) {
  console.error("Socket emit failed (confirmed):", socketErr.message);
}

  res.status(200).json({
    success: true,
    message: 'Refill confirmed',
    data: {
      request: result.request,
      transaction: result.transaction,
      idempotent: result.idempotent || false,
      requiresDispute: result.requiresDispute || false,
      variance: result.variance,
      toleranceKg: result.toleranceKg,
      customerOrderStatus: 'UNCHANGED', // 🔒 explicit safeguard
    },
  });
});

// ================================================================
// @desc    List plant transactions
// @route   GET /api/v1/plant/transactions
// @access  Private/Plant
// ================================================================
exports.listTransactions = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    fromDate,
    toDate,
    isSettled,
  } = req.query;

  const filter = { plantId: req.plantId };
  if (status && status !== 'all') filter.status = status;
  if (typeof isSettled !== 'undefined') filter.isSettled = isSettled === 'true';
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    PlantRefillTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantStaffId', 'firstName lastName')
      .lean(),
    PlantRefillTransaction.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: items.length,
    total,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
    data: items,
  });
});

// ================================================================
// @desc    Get single transaction (plant-scoped)
// @route   GET /api/v1/plant/transactions/:id
// @access  Private/Plant
// ================================================================
exports.getTransaction = asyncHandler(async (req, res, next) => {
  const transaction = await PlantRefillTransaction.findOne({
    _id: req.params.id,
    plantId: req.plantId,
  })
    .populate('plantStaffId', 'firstName lastName')
    .populate('requestId')
    .lean();

  if (!transaction) {
    return next(new ErrorResponse('Transaction not found', 404));
  }

  res.status(200).json({
    success: true,
    data: transaction,
  });
});
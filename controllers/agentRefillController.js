const PlantRefillService = require('../services/plantRefillService');
const PlantService = require('../services/plantService');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const Delivery = require('../models/Delivery');
const PlantRefillRequest = require('../models/PlantRefillRequest');

// ================================================================
// @desc    Get nearby available plants (for agent plant selection)
// @route   GET /api/v1/agent/plants/available
// @access  Private/DeliveryAgent
// ================================================================
exports.getAvailablePlants = asyncHandler(async (req, res, next) => {
  const { gps, maxDistanceKm, limit } = req.query;

  // Parse GPS from query: "lng,lat"
  let gpsCoords = null;
  if (gps && typeof gps === 'string' && gps.includes(',')) {
    const [lng, lat] = gps.split(',').map(Number);
    if (!Number.isNaN(lng) && !Number.isNaN(lat)) {
      gpsCoords = { type: 'Point', coordinates: [lng, lat] };
    }
  }

  if (!gpsCoords) {
    return next(
      new ErrorResponse(
        'GPS coordinates required as "gps=lng,lat" query parameter',
        400
      )
    );
  }

  const radius = maxDistanceKm ? parseInt(maxDistanceKm, 10) : undefined;
  const lim = limit ? parseInt(limit, 10) : undefined;

  const plants = await PlantService.findNearby(gpsCoords, {
    maxDistanceKm: radius || 30,
    limit: lim || 20,
    onlyOperational: true,
  });

  res.status(200).json({
    success: true,
    count: plants.length,
    data: plants,
  });
});

// ================================================================
// @desc    Create a plant refill request
// @route   POST /api/v1/agent/refill-requests
// @access  Private/DeliveryAgent
// ================================================================
exports.createRefillRequest = asyncHandler(async (req, res, next) => {
  const {
    deliveryId,
    cylinderId,
    plantId,
    requestedQuantity,
    agentReportedQuantity,
    agentNotes,
    gpsAtRequest,
  } = req.body;

  if (!deliveryId || !cylinderId || !plantId || requestedQuantity === undefined) {
    return next(
      new ErrorResponse(
        'deliveryId, cylinderId, plantId, and requestedQuantity are required',
        400
      )
    );
  }

  const parsedQty = parseFloat(requestedQuantity);
  if (Number.isNaN(parsedQty) || parsedQty <= 0) {
    return next(new ErrorResponse('requestedQuantity must be a positive number', 400));
  }

  // Normalize GPS input
  let normalizedGps = null;
  if (gpsAtRequest) {
    if (Array.isArray(gpsAtRequest.coordinates) && gpsAtRequest.coordinates.length === 2) {
      normalizedGps = {
        type: 'Point',
        coordinates: gpsAtRequest.coordinates.map(Number),
      };
    } else if (gpsAtRequest.lat !== undefined && gpsAtRequest.lng !== undefined) {
      normalizedGps = {
        type: 'Point',
        coordinates: [Number(gpsAtRequest.lng), Number(gpsAtRequest.lat)],
      };
    }
  }

  const result = await PlantRefillService.createRequest({
    deliveryId,
    cylinderId,
    plantId,
    requestedQuantity: parsedQty,
    agentReportedQuantity: agentReportedQuantity
      ? parseFloat(agentReportedQuantity)
      : null,
    agentNotes: agentNotes || null,
    gpsAtRequest: normalizedGps,
    agentId: req.user._id,
    agentRole: req.user.role,
    req,
  });

  // Emit socket event to the plant room
  try {
    const io = req.app.get('io');
    if (io && result.request?.plantId) {
      io.to(`plant:${result.request.plantId}`).emit('refill_request.created', {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        cylinderTag: result.request.cylinderTag,
        cylinderSize: result.request.cylinderSize,
        requestedQuantity: result.request.requestedQuantity,
        createdAt: result.request.createdAt,
      });

      io.to('admin:ops').emit('refill_request.created', {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        plantId: result.request.plantId,
      });
    }
  } catch (socketErr) {
    console.error('Socket emit failed (refill_request.created):', socketErr.message);
  }

  res.status(201).json({
    success: true,
    message: 'Refill request created',
    data: result.request,
  });
});

// ================================================================
// @desc    Get own refill requests
// @route   GET /api/v1/agent/refill-requests
// @access  Private/DeliveryAgent
// ================================================================
exports.getMyRefillRequests = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    deliveryId,
  } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    // support comma-separated status list
    if (status.includes(',')) {
      filter.status = { $in: status.split(',').map((s) => s.trim()) };
    } else {
      filter.status = status;
    }
  }
  if (deliveryId) filter.deliveryId = deliveryId;

  const result = await PlantRefillService.listByAgent(req.user._id, filter, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  res.status(200).json({
    success: true,
    count: result.items.length,
    total: result.pagination.total,
    pagination: result.pagination,
    data: result.items,
  });
});

// ================================================================
// @desc    Get single refill request (agent-owned)
// @route   GET /api/v1/agent/refill-requests/:id
// @access  Private/DeliveryAgent
// ================================================================
exports.getRefillRequest = asyncHandler(async (req, res, next) => {
  const request = await PlantRefillService.getById(req.params.id);

  if (request.agentId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to view this request', 403));
  }

  res.status(200).json({
    success: true,
    data: request,
  });
});

// ================================================================
// @desc    Retry rejected request with another plant
// @route   POST /api/v1/agent/refill-requests/:id/retry
// @access  Private/DeliveryAgent
// ================================================================
exports.retryRequest = asyncHandler(async (req, res, next) => {
  const { newPlantId, agentNotes } = req.body;

  if (!newPlantId) {
    return next(new ErrorResponse('newPlantId is required', 400));
  }

  const result = await PlantRefillService.retryWithAnotherPlant({
    originalRequestId: req.params.id,
    newPlantId,
    agentId: req.user._id,
    agentRole: req.user.role,
    agentNotes: agentNotes || null,
    req,
  });

  // Emit to the new plant
  try {
    const io = req.app.get('io');
    if (io && result.request?.plantId) {
      io.to(`plant:${result.request.plantId}`).emit('refill_request.created', {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        cylinderTag: result.request.cylinderTag,
        cylinderSize: result.request.cylinderSize,
        requestedQuantity: result.request.requestedQuantity,
        isRetry: true,
        attemptNumber: result.request.attemptNumber,
      });
    }
  } catch (socketErr) {
    console.error('Socket emit failed (retry):', socketErr.message);
  }

  res.status(201).json({
    success: true,
    message: 'Retry request created',
    data: result.request,
  });
});

// ================================================================
// @desc    Mark cylinder collected from plant
// @route   POST /api/v1/agent/refill-requests/:id/collect
// @access  Private/DeliveryAgent
// ================================================================
exports.collectFromPlant = asyncHandler(async (req, res, next) => {
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

  const result = await PlantRefillService.collectFromPlant({
    requestId: req.params.id,
    agentId: req.user._id,
    agentRole: req.user.role,
    gpsCoordinates: normalizedGps,
    req,
  });

  // Emit to plant
  // try {
  //   const io = req.app.get('io');
  //   if (io && result.request?.plantId) {
  //     io.to(`plant:${result.request.plantId}`).emit('cylinder.collected', {
  //       requestId: result.request._id,
  //       requestNumber: result.request.requestNumber,
  //       collectedAt: new Date(),
  //     });
  //   }
  //   io.to('admin:ops').emit('cylinder.collected', {
  //     requestId: result.request._id,
  //   });
  // } catch (socketErr) {
  //   console.error('Socket emit failed (collect):', socketErr.message);
  // }
  try {
  const io = req.app.get("io");
  if (io) {
    if (result.request?.plantId) {
      io.to(`plant:${result.request.plantId}`).emit("cylinder.collected", {
        requestId: result.request._id,
        requestNumber: result.request.requestNumber,
        collectedAt: new Date(),
      });
    }
    io.to("admin:ops").emit("cylinder.collected", {
      requestId: result.request._id,
    });
  }
} catch (socketErr) {
  console.error("Socket emit failed (collect):", socketErr.message);
}

  res.status(200).json({
    success: true,
    message: 'Cylinder collected from plant. Proceed to customer.',
    data: result.request,
  });
});

// ================================================================
// @desc    Escalate a request to admin
// @route   POST /api/v1/agent/refill-requests/:id/escalate
// @access  Private/DeliveryAgent
// ================================================================
exports.escalateRequest = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return next(new ErrorResponse('reason is required', 400));
  }

  const request = await PlantRefillRequest.findOne({
    _id: req.params.id,
    agentId: req.user._id,
  });

  if (!request) {
    return next(new ErrorResponse('Refill request not found or not yours', 404));
  }

  // Update delivery workflow status
  await Delivery.findByIdAndUpdate(request.deliveryId, {
    plantWorkflowStatus: 'escalated',
  });

  // Audit trail via reason on request
  request.agentNotes = `${request.agentNotes || ''}\n[ESCALATED] ${reason}`.trim();
  await request.save();

  // Emit to admin ops
  // try {
  //   const io = req.app.get('io');
  //   io.to('admin:ops').emit('delivery.escalated', {
  //     requestId: request._id,
  //     deliveryId: request.deliveryId,
  //     reason,
  //     agentId: req.user._id,
  //     at: new Date(),
  //   });
  // } catch (socketErr) {
  //   console.error('Socket emit failed (escalate):', socketErr.message);
  // }

  try {
  const io = req.app.get("io");
  if (io) {
    io.to("admin:ops").emit("delivery.escalated", {
      requestId: request._id,
      deliveryId: request.deliveryId,
      reason,
      agentId: req.user._id,
      at: new Date(),
    });
  }
} catch (socketErr) {
  console.error("Socket emit failed (escalate):", socketErr.message);
}

  res.status(200).json({
    success: true,
    message: 'Escalated to E-GAS operations',
    data: request,
  });
});
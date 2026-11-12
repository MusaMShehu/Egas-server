const PlantRefillRequest = require('../../models/PlantRefillRequest');
const PlantRefillTransaction = require('../../models/PlantRefillTransaction');
const PlantInspection = require('../../models/PlantInspection');
const Delivery = require('../../models/Delivery');
// const Delivery = require('../../models/PartnerPlant');
const PartnerPlant = require('../../models/PartnerPlant');
const Cylinder = require('../../models/Cylinder');
const PlantRefillService = require('../../services/plantRefillService');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const AuditService = require('../../services/auditService');
const AuditLog = require('../../models/AuditLog');


// ================================================================
// @desc    List all refill requests (admin, cross-plant)
// @route   GET /api/v1/admin/refill-requests
// @access  Private/Admin
// ================================================================
exports.listRequests = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    plantId,
    agentId,
    customerId,
    deliveryId,
    fromDate,
    toDate,
    search,
  } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    if (status.includes(',')) {
      filter.status = { $in: status.split(',').map((s) => s.trim()) };
    } else {
      filter.status = status;
    }
  }
  if (plantId) filter.plantId = plantId;
  if (agentId) filter.agentId = agentId;
  if (customerId) filter.customerId = customerId;
  if (deliveryId) filter.deliveryId = deliveryId;

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  if (search) {
    filter.$or = [
      { requestNumber: new RegExp(search, 'i') },
      { cylinderTag: new RegExp(search, 'i') },
    ];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    PlantRefillRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantId', 'name code status')
      .populate('agentId', 'firstName lastName phone')
      .populate('customerId', 'firstName lastName phone email')
      .populate('cylinderId', 'tagCode size')
      .lean(),
    PlantRefillRequest.countDocuments(filter),
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
// @desc    Get single refill request (full detail with transaction + inspection)
// @route   GET /api/v1/admin/refill-requests/:id
// @access  Private/Admin
// ================================================================
exports.getRequest = asyncHandler(async (req, res, next) => {
  const request = await PlantRefillRequest.findById(req.params.id)
    .populate('plantId', 'name code status city state')
    .populate('agentId', 'firstName lastName phone email')
    .populate('customerId', 'firstName lastName phone email address')
    .populate('cylinderId', 'tagCode size emptyWeight status')
    .populate('transactionId')
    .lean();

  if (!request) return next(new ErrorResponse('Refill request not found', 404));

  const inspection = await PlantInspection.findOne({
    requestId: request._id,
  }).lean();

  res.status(200).json({
    success: true,
    data: {
      request,
      inspection: inspection || null,
    },
  });
});

// ================================================================
// @desc    Get full operational timeline for a delivery
// @route   GET /api/v1/admin/deliveries/:id/timeline
// @access  Private/Admin
// ================================================================
exports.getDeliveryTimeline = asyncHandler(async (req, res, next) => {
  const deliveryId = req.params.id;

  const delivery = await Delivery.findById(deliveryId)
    .populate('userId', 'firstName lastName phone email address city state')
    .populate('deliveryAgent', 'firstName lastName phone email')
    .populate('cylinderId', 'tagCode size emptyWeight lastMeasuredWeight')
    .populate('subscriptionId', 'planName size frequency status')
    .populate('plantRefillRequestId')
    .lean();

  if (!delivery) return next(new ErrorResponse('Delivery not found', 404));

  if (req.user.role === 'delivery') {
    const assignedAgentId = delivery.deliveryAgent?._id || delivery.deliveryAgent;
    if (!assignedAgentId || assignedAgentId.toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('Not authorized for this delivery', 403));
    }
  }

  // Load associated refill request (from delivery pointer)
  const refillRequest = delivery.plantRefillRequestId || null;

  // Load transaction + inspection
  let transaction = null;
  let inspection = null;
  if (refillRequest) {
    transaction = await PlantRefillTransaction.findOne({
      requestId: refillRequest._id,
    }).lean();
    inspection = await PlantInspection.findOne({
      requestId: refillRequest._id,
    }).lean();
  }

  // Load plant if we have one
  let plant = null;
  if (refillRequest?.plantId) {
    plant = await PartnerPlant.findById(refillRequest.plantId)
      .select('name code status city state')
      .lean();
  }

  // Load AuditLog for this delivery
  
  const auditTrail = await AuditLog.find({
    $or: [
      { entityType: 'Delivery', entityId: delivery._id },
      { 'metadata.deliveryId': delivery._id },
    ],
  })
    .sort({ timestamp: 1 })
    .populate('user', 'firstName lastName role')
    .lean();

  
    res.status(200).json({
    success: true,
    data: {
      delivery,
      customer: delivery.userId,
      agent: delivery.deliveryAgent,
      cylinder: delivery.cylinderId || null,
      subscription: delivery.subscriptionId || null,
      plant: plant,
      refillRequest: refillRequest,
      transaction: transaction,
      inspection: inspection,
      auditTrail: auditTrail,
      // ── NEW: Pre/post fill weights (agent workflow, customer-facing remnant) ──
      weights: {
        preFill: delivery.preFillWeight != null
          ? {
              weight: delivery.preFillWeight,
              recordedAt: delivery.preFillRecordedAt,
              recordedBy: delivery.preFillRecordedBy,
              recordId: delivery.preFillWeightRecordId,
            }
          : null,
        postFill: delivery.postFillWeight != null
          ? {
              weight: delivery.postFillWeight,
              recordedAt: delivery.postFillRecordedAt,
              recordedBy: delivery.postFillRecordedBy,
              recordId: delivery.postFillWeightRecordId,
            }
          : null,
        purchasedKg: delivery.purchasedKg ?? null,
        refilledKg: delivery.refilledKg ?? null,
        remnantDeltaKg: delivery.remnantDeltaKg ?? null,
        overFillKg: delivery.overFillKg ?? null,
        remnantLedgerEntryId: delivery.remnantLedgerEntryId ?? null,
      },
    },
  });
});

// ================================================================
// @desc    Get rejected inspections (admin overview)
// @route   GET /api/v1/admin/refill-requests/rejected
// @access  Private/Admin
// ================================================================
exports.getRejected = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, plantId } = req.query;

  const filter = { status: 'rejected' };
  if (plantId) filter.plantId = plantId;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    PlantRefillRequest.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantId', 'name code')
      .populate('agentId', 'firstName lastName phone')
      .populate('cylinderId', 'tagCode size')
      .lean(),
    PlantRefillRequest.countDocuments(filter),
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
// @desc    Cancel a refill request (admin, only before plant receives)
// @route   POST /api/v1/admin/refill-requests/:id/cancel
// @access  Private/Admin
// ================================================================
exports.cancelRequest = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const request = await PlantRefillRequest.findById(req.params.id);
  if (!request) return next(new ErrorResponse('Refill request not found', 404));

  if (request.status !== 'created') {
    return next(
      new ErrorResponse(
        `Cannot cancel: request has already been received by the plant (status: ${request.status})`,
        409
      )
    );
  }

  const previous = request.status;
  request.status = 'cancelled';
  request.cancelledAt = new Date();
  request.cancelledReason = reason || 'Cancelled by admin';
  await request.save();

  // Reset delivery plant workflow (not delivery status)
  await Delivery.findByIdAndUpdate(request.deliveryId, {
    plantWorkflowStatus: 'not_started',
    plantRefillRequestId: null,
  });

  await AuditService.log({
    action: 'PLANT_REFILL_REQUEST_CANCELLED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'PlantRefillRequest',
    entityId: request._id,
    previousValue: { status: previous },
    newValue: { status: 'cancelled', reason },
    metadata: { plantId: request.plantId, deliveryId: request.deliveryId },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Refill request cancelled',
    data: request.toObject(),
  });
});
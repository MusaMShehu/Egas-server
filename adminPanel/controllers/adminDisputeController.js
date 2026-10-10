const Dispute = require('../../models/Dispute');
const PlantRefillRequest = require('../../models/PlantRefillRequest');
const PlantRefillTransaction = require('../../models/PlantRefillTransaction');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const AuditService = require('../../services/auditService');
const RemnantLedgerService = require('../../services/remnantLedgerService');
const { generateDisputeNumber } = require('../../utils/idGenerators');

// ================================================================
// @desc    List disputes (admin)
// @route   GET /api/v1/admin/disputes
// @access  Private/Admin
// ================================================================
exports.listDisputes = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, plantId } = req.query;

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (plantId) filter.plantId = plantId;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    Dispute.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantId', 'name code')
      .populate('raisedBy', 'firstName lastName role')
      .populate('resolvedBy', 'firstName lastName role')
      .lean(),
    Dispute.countDocuments(filter),
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
// @desc    Get single dispute
// @route   GET /api/v1/admin/disputes/:id
// @access  Private/Admin
// ================================================================
exports.getDispute = asyncHandler(async (req, res, next) => {
  const dispute = await Dispute.findById(req.params.id)
    .populate('plantId', 'name code')
    .populate('transactionId')
    .populate('requestId')
    .populate('raisedBy', 'firstName lastName role')
    .populate('resolvedBy', 'firstName lastName role')
    .populate('comments.authorId', 'firstName lastName role')
    .lean();

  if (!dispute) return next(new ErrorResponse('Dispute not found', 404));

  res.status(200).json({
    success: true,
    data: dispute,
  });
});

// ================================================================
// @desc    Create dispute (admin or auto by system)
// @route   POST /api/v1/admin/disputes
// @access  Private/Admin
// ================================================================
exports.createDispute = asyncHandler(async (req, res, next) => {
  const { transactionId, reason } = req.body;

  const transaction = await PlantRefillTransaction.findById(transactionId);
  if (!transaction) {
    return next(new ErrorResponse('Transaction not found', 404));
  }

  const disputeNumber = await generateDisputeNumber();

  const dispute = await Dispute.create({
    disputeNumber,
    requestId: transaction.requestId,
    transactionId: transaction._id,
    plantId: transaction.plantId,
    requestedQuantity: transaction.requestedQuantity,
    plantConfirmedQuantity: transaction.plantConfirmedQuantity,
    variance: transaction.variance,
    tolerance: 0.2,
    status: 'open',
    raisedBy: req.user._id,
    raisedByRole: req.user.role,
  });

  // Mark transaction as disputed
  transaction.status = 'disputed';
  await transaction.save();

  await AuditService.log({
    action: 'DISPUTE_CREATED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'Dispute',
    entityId: dispute._id,
    newValue: { disputeNumber, transactionId },
    metadata: { plantId: transaction.plantId, reason },
    req,
  });

  res.status(201).json({
    success: true,
    message: 'Dispute created',
    data: dispute.toObject(),
  });
});

// ================================================================
// @desc    Resolve dispute
// @route   POST /api/v1/admin/disputes/:id/resolve
// @access  Private/Admin
// ================================================================
exports.resolveDispute = asyncHandler(async (req, res, next) => {
  const {
    resolution,
    resolutionNote,
    adjustmentKg,
    adjustmentAmount,
  } = req.body;

  const validResolutions = [
    'accept_plant_quantity',
    'accept_agent_quantity',
    'partial_adjustment',
    'reject_transaction',
    'request_more_evidence',
  ];

  if (!validResolutions.includes(resolution)) {
    return next(new ErrorResponse('Invalid resolution type', 400));
  }

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return next(new ErrorResponse('Dispute not found', 404));

  if (['resolved', 'rejected', 'cancelled'].includes(dispute.status)) {
    return next(new ErrorResponse('Dispute already closed', 400));
  }

  dispute.status = 'resolved';
  dispute.resolution = resolution;
  dispute.resolutionNote = resolutionNote || null;
  dispute.resolvedBy = req.user._id;
  dispute.resolvedAt = new Date();
  dispute.adjustmentKg = adjustmentKg || 0;
  dispute.adjustmentAmount = adjustmentAmount || 0;
  await dispute.save();

  // Update transaction → reconciled
  const transaction = await PlantRefillTransaction.findById(
    dispute.transactionId
  );
  if (transaction) {
    transaction.status = 'reconciled';
    await transaction.save();
  }

  await AuditService.log({
    action: 'DISPUTE_RESOLVED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'Dispute',
    entityId: dispute._id,
    previousValue: { status: 'open' },
    newValue: { status: 'resolved', resolution },
    metadata: { plantId: dispute.plantId },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Dispute resolved',
    data: dispute.toObject(),
  });
});

// ================================================================
// @desc    Add comment to dispute
// @route   POST /api/v1/admin/disputes/:id/comment
// @access  Private/Admin
// ================================================================
exports.addComment = asyncHandler(async (req, res, next) => {
  const { text } = req.body;
  if (!text) return next(new ErrorResponse('text is required', 400));

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return next(new ErrorResponse('Dispute not found', 404));

  dispute.comments.push({
    authorId: req.user._id,
    authorRole: req.user.role,
    text,
    createdAt: new Date(),
  });
  await dispute.save();

  await AuditService.log({
    action: 'DISPUTE_COMMENTED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'Dispute',
    entityId: dispute._id,
    metadata: { plantId: dispute.plantId },
    req,
  });

  res.status(200).json({ success: true, data: dispute.toObject() });
});
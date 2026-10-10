const PlantRefillTransaction = require('../../models/PlantRefillTransaction');
const Dispute = require('../../models/Dispute');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const ConfigService = require('../../services/configService');
const AuditService = require('../../services/auditService');

// ================================================================
// @desc    Reconciliation queue — confirmed transactions pending reconciliation
// @route   GET /api/v1/admin/reconciliation
// @access  Private/Admin
// ================================================================
exports.getQueue = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, plantId, status } = req.query;

  const tolerance = await ConfigService.getConfig('PLANT_VARIANCE_TOLERANCE_KG', 0.2);

  const filter = {
    status: { $in: ['confirmed', 'disputed'] },
    isSettled: false,
  };
  if (plantId) filter.plantId = plantId;
  if (status && status !== 'all') filter.status = status;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    PlantRefillTransaction.find(filter)
      .sort({ confirmedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantId', 'name code')
      .lean(),
    PlantRefillTransaction.countDocuments(filter),
  ]);

  // Annotate with dispute flag
  const annotated = items.map((tx) => ({
    ...tx,
    requiresDispute: Math.abs(tx.variance || 0) > tolerance,
  }));

  res.status(200).json({
    success: true,
    count: annotated.length,
    total,
    toleranceKg: tolerance,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
    data: annotated,
  });
});

// ================================================================
// @desc    Mark a transaction as reconciled (admin)
// @route   POST /api/v1/admin/reconciliation/:transactionId/complete
// @access  Private/Admin
// ================================================================
exports.completeReconciliation = asyncHandler(async (req, res, next) => {
  const { note } = req.body;

  const tx = await PlantRefillTransaction.findById(req.params.transactionId);
  if (!tx) return next(new ErrorResponse('Transaction not found', 404));

  if (tx.status === 'settled' || tx.isSettled) {
    return next(new ErrorResponse('Transaction already settled', 400));
  }

  const previous = tx.status;
  tx.status = 'reconciled';
  if (note) tx.notes = `${tx.notes || ''}\n[RECONCILED] ${note}`.trim();
  await tx.save();

  await AuditService.log({
    action: 'RECONCILIATION_COMPLETED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'PlantRefillTransaction',
    entityId: tx._id,
    previousValue: { status: previous },
    newValue: { status: 'reconciled' },
    metadata: { plantId: tx.plantId, note },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Reconciliation completed',
    data: tx.toObject(),
  });
});
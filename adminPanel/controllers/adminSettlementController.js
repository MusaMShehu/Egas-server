const mongoose = require('mongoose');
const PlantSettlement = require('../../models/PlantSettlement');
const SettlementTransaction = require('../../models/SettlementTransaction');
const PlantRefillTransaction = require('../../models/PlantRefillTransaction');
const PartnerPlant = require('../../models/PartnerPlant');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const AuditService = require('../../services/auditService');
const ConfigService = require('../../services/configService');
const { generateSettlementNumber } = require('../../utils/idGenerators');

// ================================================================
// @desc    List settlements
// @route   GET /api/v1/admin/settlements
// @access  Private/Admin
// ================================================================
exports.listSettlements = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, plantId, status } = req.query;

  const filter = {};
  if (plantId) filter.plantId = plantId;
  if (status && status !== 'all') filter.status = status;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    PlantSettlement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('plantId', 'name code')
      .populate('generatedBy', 'firstName lastName role')
      .populate('approvedBy', 'firstName lastName role')
      .lean(),
    PlantSettlement.countDocuments(filter),
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
// @desc    Get single settlement
// @route   GET /api/v1/admin/settlements/:id
// @access  Private/Admin
// ================================================================
exports.getSettlement = asyncHandler(async (req, res, next) => {
  const settlement = await PlantSettlement.findById(req.params.id)
    .populate('plantId', 'name code contactPerson')
    .populate('generatedBy reviewedBy approvedBy paidBy', 'firstName lastName role')
    .lean();

  if (!settlement) return next(new ErrorResponse('Settlement not found', 404));

  const settlementTransactions = await SettlementTransaction.find({
    settlementId: settlement._id,
  })
    .populate('transactionId')
    .lean();

  res.status(200).json({
    success: true,
    data: {
      settlement,
      transactions: settlementTransactions,
    },
  });
});

// ================================================================
// @desc    Generate settlement for a plant & period
// @route   POST /api/v1/admin/settlements
// @access  Private/Admin
// ================================================================
exports.generateSettlement = asyncHandler(async (req, res, next) => {
  const { plantId, startDate, endDate, label } = req.body;

  if (!plantId || !startDate || !endDate) {
    return next(
      new ErrorResponse('plantId, startDate, and endDate are required', 400)
    );
  }

  const plant = await PartnerPlant.findById(plantId);
  if (!plant) return next(new ErrorResponse('Plant not found', 404));

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start >= end) {
    return next(new ErrorResponse('startDate must be before endDate', 400));
  }

  // Fetch all reconciled, unsettled transactions in the period
  const transactions = await PlantRefillTransaction.find({
    plantId,
    isSettled: false,
    status: 'reconciled',
    confirmedAt: { $gte: start, $lte: end },
  });

  if (transactions.length === 0) {
    return next(
      new ErrorResponse('No eligible transactions found for this period', 404)
    );
  }

  // Compute aggregates
  let totalRequestedKg = 0;
  let totalConfirmedKg = 0;
  let totalVarianceKg = 0;
  let grossValue = 0;

  for (const tx of transactions) {
    totalRequestedKg += tx.requestedQuantity || 0;
    totalConfirmedKg += tx.plantConfirmedQuantity || 0;
    totalVarianceKg += tx.variance || 0;
    grossValue += tx.totalValue || 0;
  }

  const settlementNumber = await generateSettlementNumber(
    start.getFullYear(),
    start.getMonth() + 1,
    'A'
  );

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [settlement] = await PlantSettlement.create(
      [
        {
          settlementNumber,
          plantId,
          period: { startDate: start, endDate: end, label: label || null },
          totals: {
            transactionCount: transactions.length,
            totalRequestedKg: +totalRequestedKg.toFixed(3),
            totalConfirmedKg: +totalConfirmedKg.toFixed(3),
            totalVarianceKg: +totalVarianceKg.toFixed(3),
            grossValue: +grossValue.toFixed(2),
            adjustments: 0,
            disputedCount: 0,
            rejectedCount: 0,
            netPayable: +grossValue.toFixed(2),
            currency: 'NGN',
          },
          transactions: transactions.map((t) => t._id),
          status: 'draft',
          generatedBy: req.user._id,
        },
      ],
      { session }
    );

    // Create SettlementTransaction rows
    const stxDocs = transactions.map((tx) => ({
      settlementId: settlement._id,
      transactionId: tx._id,
      plantId,
      confirmedKg: tx.plantConfirmedQuantity,
      pricePerKg: tx.pricePerKg,
      amount: tx.totalValue || 0,
      adjustmentAmount: 0,
      isLocked: true,
    }));
    await SettlementTransaction.insertMany(stxDocs, { session });

    // Lock the transactions
    await PlantRefillTransaction.updateMany(
      { _id: { $in: transactions.map((t) => t._id) } },
      { $set: { isSettled: true, settlementId: settlement._id, status: 'settled' } },
      { session }
    );

    await AuditService.log({
      action: 'SETTLEMENT_CREATED',
      actorId: req.user._id,
      actorRole: req.user.role,
      entityType: 'PlantSettlement',
      entityId: settlement._id,
      newValue: {
        settlementNumber,
        plantId,
        transactionCount: transactions.length,
        netPayable: settlement.totals.netPayable,
      },
      metadata: { plantId },
      req,
    });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Settlement generated',
      data: settlement.toObject(),
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ================================================================
// @desc    Approve settlement
// @route   PATCH /api/v1/admin/settlements/:id/approve
// @access  Private/Admin
// ================================================================
exports.approveSettlement = asyncHandler(async (req, res, next) => {
  const settlement = await PlantSettlement.findById(req.params.id);
  if (!settlement) return next(new ErrorResponse('Settlement not found', 404));

  if (!['draft', 'pending_review'].includes(settlement.status)) {
    return next(
      new ErrorResponse(`Cannot approve settlement in status: ${settlement.status}`, 400)
    );
  }

  const previous = settlement.status;
  settlement.status = 'approved';
  settlement.approvedBy = req.user._id;
  settlement.approvedAt = new Date();
  await settlement.save();

  await AuditService.log({
    action: 'SETTLEMENT_APPROVED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'PlantSettlement',
    entityId: settlement._id,
    previousValue: { status: previous },
    newValue: { status: 'approved' },
    metadata: { plantId: settlement.plantId },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Settlement approved',
    data: settlement.toObject(),
  });
});

// ================================================================
// @desc    Mark settlement as paid
// @route   PATCH /api/v1/admin/settlements/:id/mark-paid
// @access  Private/Admin
// ================================================================
exports.markSettlementPaid = asyncHandler(async (req, res, next) => {
  const { paymentReference } = req.body;

  const settlement = await PlantSettlement.findById(req.params.id);
  if (!settlement) return next(new ErrorResponse('Settlement not found', 404));

  if (settlement.status !== 'approved') {
    return next(new ErrorResponse('Only approved settlements can be paid', 400));
  }

  const previous = settlement.status;
  settlement.status = 'paid';
  settlement.paidBy = req.user._id;
  settlement.paidAt = new Date();
  settlement.paymentReference = paymentReference || null;
  await settlement.save();

  await AuditService.log({
    action: 'SETTLEMENT_PAID',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'PlantSettlement',
    entityId: settlement._id,
    previousValue: { status: previous },
    newValue: { status: 'paid', paymentReference },
    metadata: { plantId: settlement.plantId },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Settlement marked as paid',
    data: settlement.toObject(),
  });
});
const CylinderRemnantLedger = require('../../models/CylinderRemnantLedger');
const RemnantLedgerService = require('../../services/remnantLedgerService');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

// ================================================================
// @desc    List remnant ledger entries (admin, cross-customer)
// @route   GET /api/v1/admin/remnant-ledger
// @access  Private/Admin
// ================================================================
exports.listLedger = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 50,
    userId,
    cylinderId,
    event,
    fromDate,
    toDate,
  } = req.query;

  const filter = {};
  if (userId) filter.userId = userId;
  if (cylinderId) filter.cylinderId = cylinderId;
  if (event && event !== 'all') filter.event = event;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [items, total] = await Promise.all([
    CylinderRemnantLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('userId', 'firstName lastName email phone')
      .populate('performedBy', 'firstName lastName role')
      .populate('deliveryId', '_id deliveryDate status') // NEW
      .lean(),
    CylinderRemnantLedger.countDocuments(filter),
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
// @desc    Get remnant ledger for a specific user (admin)
// @route   GET /api/v1/admin/remnant-ledger/user/:userId
// @access  Private/Admin
// ================================================================
exports.getUserLedger = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;

  const result = await RemnantLedgerService.getUserLedger(req.params.userId, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  const balance = await RemnantLedgerService.getUserBalance(req.params.userId);

  res.status(200).json({
    success: true,
    count: result.entries.length,
    pagination: result.pagination,
    currentBalance: balance,
    data: result.entries,
  });
});

// ================================================================
// @desc    Manual credit/debit adjustment (admin)
// @route   POST /api/v1/admin/remnant-ledger/adjustment
// @access  Private/Admin
// ================================================================
exports.createAdjustment = asyncHandler(async (req, res, next) => {
  const { userId, type, amount, reason, cylinderId } = req.body;

  if (!userId || !type || !amount || !reason) {
    return next(
      new ErrorResponse('userId, type, amount, and reason are required', 400)
    );
  }

  if (!['credit', 'debit'].includes(type)) {
    return next(new ErrorResponse('type must be credit or debit', 400));
  }

  const parsedAmount = parseFloat(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return next(new ErrorResponse('amount must be a positive number', 400));
  }

  let result;

  if (type === 'credit') {
    result = await RemnantLedgerService.creditRemnant({
      userId,
      amount: parsedAmount,
      reason,
      cylinderId: cylinderId || null,
      performedBy: req.user._id,
      performedByRole: req.user.role,
      req,
    });
  } else {
    result = await RemnantLedgerService.debitRemnant({
      userId,
      amount: parsedAmount,
      reason,
      cylinderId: cylinderId || null,
      performedBy: req.user._id,
      performedByRole: req.user.role,
      req,
    });
  }

  res.status(201).json({
    success: true,
    message: `Remnant ${type} applied`,
    data: {
      entry: result.entry,
      previousBalance: result.previousBalance,
      newBalance: result.newBalance,
      delta: result.delta,
    },
  });
});

// ================================================================
// @desc    Verify remnant integrity for a user
// @route   GET /api/v1/admin/remnant-ledger/verify/:userId
// @access  Private/Admin
// ================================================================
exports.verifyIntegrity = asyncHandler(async (req, res, next) => {
  const result = await RemnantLedgerService.verifyUserIntegrity(
    req.params.userId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});
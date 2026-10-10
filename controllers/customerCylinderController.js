const Cylinder = require('../models/Cylinder');
const CylinderWeightRecord = require('../models/CylinderWeightRecord');
const RemnantLedgerService = require('../services/remnantLedgerService');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const {
  customerCylinderDTO,
  customerRemnantLedgerDTO,
  customerRemnantSummary,
} = require('../middleware/dtoSanitizer');

// ================================================================
// @desc    Get customer's own cylinders
// @route   GET /api/v1/customer/cylinders
// @access  Private
// ================================================================
exports.getMyCylinders = asyncHandler(async (req, res, next) => {
  const cylinders = await Cylinder.find({
    userId: req.user._id,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: cylinders.length,
    data: cylinders.map(customerCylinderDTO),
  });
});

// ================================================================
// @desc    Get a cylinder's weight history (customer view)
// @route   GET /api/v1/customer/cylinders/:id/weight-history
// @access  Private
// ================================================================
exports.getCylinderWeightHistory = asyncHandler(async (req, res, next) => {
  const cylinder = await Cylinder.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isDeleted: false,
  }).lean();

  if (!cylinder) {
    return next(new ErrorResponse('Cylinder not found', 404));
  }

  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [records, total] = await Promise.all([
    CylinderWeightRecord.find({ cylinderId: cylinder._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .select('measuredWeight emptyWeight calculatedLpg measurementType createdAt')
      .lean(),
    CylinderWeightRecord.countDocuments({ cylinderId: cylinder._id }),
  ]);

  res.status(200).json({
    success: true,
    count: records.length,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
    data: records,
  });
});

// ================================================================
// @desc    Get customer's remnant ledger
// @route   GET /api/v1/customer/remnant/ledger
// @access  Private
// ================================================================
exports.getMyRemnantLedger = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, event } = req.query;

  const result = await RemnantLedgerService.getUserLedger(req.user._id, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    event: event || null,
  });

  const eligibility = await RemnantLedgerService.checkEligibility(req.user._id);

  res.status(200).json({
    success: true,
    count: result.entries.length,
    pagination: result.pagination,
    summary: customerRemnantSummary({
      balance: eligibility.balance,
      minimumRequired: eligibility.minimumRequired,
      eligible: eligibility.eligible,
    }),
    data: result.entries.map(customerRemnantLedgerDTO),
  });
});

// ================================================================
// @desc    Get customer's remnant summary (quick check)
// @route   GET /api/v1/customer/remnant/summary
// @access  Private
// ================================================================
exports.getMyRemnantSummary = asyncHandler(async (req, res, next) => {
  const eligibility = await RemnantLedgerService.checkEligibility(req.user._id);

  res.status(200).json({
    success: true,
    data: customerRemnantSummary({
      balance: eligibility.balance,
      minimumRequired: eligibility.minimumRequired,
      eligible: eligibility.eligible,
    }),
  });
});
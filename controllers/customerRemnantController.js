const RemnantLedgerService = require('../services/remnantLedgerService');
const asyncHandler = require('../middleware/async');
const {
  customerRemnantLedgerDTO,
  customerRemnantSummary,
} = require('../middleware/dtoSanitizer');

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
// @desc    Get customer's remnant summary
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
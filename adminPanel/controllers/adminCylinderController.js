const Cylinder = require('../../models/Cylinder');
const CylinderWeightRecord = require('../../models/CylinderWeightRecord');
const CylinderCustodyRecord = require('../../models/CylinderCustodyRecord');
const RemnantLedgerService = require('../../services/remnantLedgerService');
const CylinderService = require('../../services/cylinderService');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

// ================================================================
// @desc    List all cylinders (admin, cross-customer)
// @route   GET /api/v1/admin/cylinders
// @access  Private/Admin
// ================================================================
exports.listCylinders = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    userId,
    tagCode,
    size,
  } = req.query;

  const filter = { isDeleted: false };
  if (status && status !== 'all') filter.status = status;
  if (userId) filter.userId = userId;
  if (tagCode) filter.tagCode = String(tagCode).toUpperCase().trim();
  if (size) filter.size = size;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [items, total] = await Promise.all([
    Cylinder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('userId', 'firstName lastName phone email')
      .lean(),
    Cylinder.countDocuments(filter),
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
// @desc    Get single cylinder (admin full view)
// @route   GET /api/v1/admin/cylinders/:id
// @access  Private/Admin
// ================================================================
exports.getCylinder = asyncHandler(async (req, res, next) => {
  const cylinder = await Cylinder.findOne({
    _id: req.params.id,
    isDeleted: false,
  })
    .populate('userId', 'firstName lastName phone email address city state')
    .populate('registeredBy', 'firstName lastName role')
    .lean();

  if (!cylinder) return next(new ErrorResponse('Cylinder not found', 404));

  const balance = await RemnantLedgerService.getUserBalance(cylinder.userId._id);

  res.status(200).json({
    success: true,
    data: {
      cylinder,
      customerBalance: balance,
    },
  });
});

// ================================================================
// @desc    Get cylinder weight history
// @route   GET /api/v1/admin/cylinders/:id/weight-history
// @access  Private/Admin
// ================================================================
exports.getWeightHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [records, total] = await Promise.all([
    CylinderWeightRecord.find({ cylinderId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('recordedBy', 'firstName lastName role')
      .populate('deliveryId', 'deliveryDate status')
      .lean(),
    CylinderWeightRecord.countDocuments({ cylinderId: req.params.id }),
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
// @desc    Get cylinder custody history
// @route   GET /api/v1/admin/cylinders/:id/custody-history
// @access  Private/Admin
// ================================================================
exports.getCustodyHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 30 } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [records, total] = await Promise.all([
    CylinderCustodyRecord.find({ cylinderId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('actorId', 'firstName lastName role')
      .lean(),
    CylinderCustodyRecord.countDocuments({ cylinderId: req.params.id }),
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
// @desc    Get cylinder remnant ledger
// @route   GET /api/v1/admin/cylinders/:id/remnant-history
// @access  Private/Admin
// ================================================================
exports.getRemnantHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;

  const result = await RemnantLedgerService.getCylinderLedger(req.params.id, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  res.status(200).json({
    success: true,
    count: result.entries.length,
    pagination: result.pagination,
    data: result.entries,
  });
});

// ================================================================
// @desc    Flag a cylinder (admin)
// @route   PATCH /api/v1/admin/cylinders/:id/flag
// @access  Private/Admin
// ================================================================
exports.flagCylinder = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return next(new ErrorResponse('Reason is required', 400));
  }

  const result = await CylinderService.flagCylinder({
    cylinderId: req.params.id,
    reason,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Cylinder flagged',
    data: result.cylinder,
  });
});

// ================================================================
// @desc    Retire a cylinder (admin)
// @route   PATCH /api/v1/admin/cylinders/:id/retire
// @access  Private/Admin
// ================================================================
exports.retireCylinder = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return next(new ErrorResponse('Reason is required', 400));
  }

  const result = await CylinderService.retireCylinder({
    cylinderId: req.params.id,
    reason,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Cylinder retired',
    data: result.cylinder,
  });
});
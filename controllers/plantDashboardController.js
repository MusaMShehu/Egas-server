const PlantRefillRequest = require('../models/PlantRefillRequest');
const PlantRefillTransaction = require('../models/PlantRefillTransaction');
const PlantInspection = require('../models/PlantInspection');
const PartnerPlant = require('../models/PartnerPlant');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// ================================================================
// @desc    Plant dashboard — today's snapshot
// @route   GET /api/v1/plant/dashboard
// @access  Private/Plant
// ================================================================
exports.getDashboard = asyncHandler(async (req, res, next) => {
  const plantId = req.plantId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [
    todayRequests,
    pendingRequests,
    completedToday,
    rejectedToday,
    totalKgToday,
    disputedCount,
    plant,
  ] = await Promise.all([
    // Today's requests
    PlantRefillRequest.countDocuments({
      plantId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }),

    // Pending (not yet confirmed/terminal)
    PlantRefillRequest.countDocuments({
      plantId,
      status: {
        $in: [
          'created',
          'received',
          'inspection_pending',
          'approved',
          'refilling',
          'quantity_recorded',
        ],
      },
    }),

    // Completed today
    PlantRefillRequest.countDocuments({
      plantId,
      status: 'confirmed',
      confirmedAt: { $gte: startOfDay, $lte: endOfDay },
    }),

    // Rejected today
    PlantRefillRequest.countDocuments({
      plantId,
      status: 'rejected',
      updatedAt: { $gte: startOfDay, $lte: endOfDay },
    }),

    // Total kg supplied today
    PlantRefillTransaction.aggregate([
      {
        $match: {
          plantId: require('mongoose').Types.ObjectId.createFromHexString(
            plantId.toString()
          ),
          status: 'confirmed',
          confirmedAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$plantConfirmedQuantity' },
        },
      },
    ]),

    // Disputed count
    PlantRefillRequest.countDocuments({
      plantId,
      status: 'disputed',
    }),

    // Plant info
    PartnerPlant.findById(plantId).select('name code metrics status').lean(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      plant: {
        name: plant?.name,
        code: plant?.code,
        status: plant?.status,
        metrics: plant?.metrics || {},
      },
      today: {
        requestsReceived: todayRequests,
        pending: pendingRequests,
        completed: completedToday,
        rejected: rejectedToday,
        totalKgSupplied: totalKgToday[0]?.total || 0,
      },
      alerts: {
        disputes: disputedCount,
      },
    },
  });
});

// ================================================================
// @desc    Plant metrics over a period
// @route   GET /api/v1/plant/dashboard/metrics
// @access  Private/Plant
// ================================================================
exports.getMetrics = asyncHandler(async (req, res, next) => {
  const plantId = req.plantId;
  const { period = '7days' } = req.query;

  let days = 7;
  if (period === '30days') days = 30;
  else if (period === '90days') days = 90;
  else if (period === 'year') days = 365;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const summary = await PlantRefillTransaction.aggregate([
    {
      $match: {
        plantId: require('mongoose').Types.ObjectId.createFromHexString(
          plantId.toString()
        ),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalKg: { $sum: '$plantConfirmedQuantity' },
        totalValue: { $sum: '$totalValue' },
        avgVariance: { $avg: '$variance' },
      },
    },
  ]);

  const trend = await PlantRefillTransaction.aggregate([
    {
      $match: {
        plantId: require('mongoose').Types.ObjectId.createFromHexString(
          plantId.toString()
        ),
        status: 'confirmed',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        totalKg: { $sum: '$plantConfirmedQuantity' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      period,
      startDate,
      summary,
      trend,
    },
  });
});

// ================================================================
// @desc    Plant activity log
// @route   GET /api/v1/plant/activity
// @access  Private/Plant
// ================================================================
exports.getActivity = asyncHandler(async (req, res, next) => {
  const plantId = req.plantId;
  const { page = 1, limit = 50 } = req.query;

  const AuditLog = require('../models/AuditLog');
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const filter = {
    'metadata.plantId': require('mongoose').Types.ObjectId.createFromHexString(
      plantId.toString()
    ),
  };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('user', 'firstName lastName role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: logs.length,
    total,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
    data: logs,
  });
});
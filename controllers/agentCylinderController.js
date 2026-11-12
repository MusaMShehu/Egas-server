const CylinderService = require('../services/cylinderService');
const CylinderWeightService = require('../services/cylinderWeightService');
const RemnantLedgerService = require('../services/remnantLedgerService');
const Cylinder = require('../models/Cylinder');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// ================================================================
// @desc    Register a new cylinder for a customer
// @route   POST /api/v1/agent/cylinders/register
// @access  Private/DeliveryAgent
// ================================================================
// exports.registerCylinder = asyncHandler(async (req, res, next) => {
//   const {
//     tagCode,
//     size,
//     emptyWeight,
//     customerId,
//     brand,
//     gpsCoordinates,
//     photos,
//     notes,
//   } = req.body;

//   if (!tagCode || !size || emptyWeight === undefined || emptyWeight === null) {
//     return next(
//       new ErrorResponse('tagCode, size, and emptyWeight are required', 400)
//     );
//   }

//   // If no customerId provided, try to infer from delivery
//   let resolvedCustomerId = customerId;

//   if (!resolvedCustomerId) {
//     return next(
//       new ErrorResponse(
//         'customerId is required. Provide customer or link a delivery.',
//         400
//       )
//     );
//   }

//   // Validate customer exists
//   const customer = await User.findById(resolvedCustomerId).select('_id role');
//   if (!customer) {
//     return next(new ErrorResponse('Customer not found', 404));
//   }

//   const result = await CylinderService.registerCylinder({
//     tagCode,
//     size,
//     emptyWeight: parseFloat(emptyWeight),
//     customerId: resolvedCustomerId,
//     agentId: req.user._id,
//     agentRole: req.user.role,
//     brand: brand || null,
//     gpsCoordinates: gpsCoordinates || null,
//     photos: photos || [],
//     notes: notes || null,
//     req,
//   });

//   res.status(201).json({
//     success: true,
//     message: 'Cylinder registered successfully',
//     data: {
//       cylinder: result.cylinder,
//       custodyRecord: result.custodyRecord,
//     },
//   });
// });

// controllers/agentCylinderController.js

exports.registerCylinder = asyncHandler(async (req, res, next) => {
  const {
    size,
    emptyWeight,
    customerId,
    brand,
    gpsCoordinates,
    photos,
    notes,
  } = req.body;

  // ── VALIDATION ──
  if (!size || emptyWeight === undefined || emptyWeight === null) {
    return next(
      new ErrorResponse('size and emptyWeight are required', 400)
    );
  }
  if (!customerId) {
    return next(new ErrorResponse('customerId is required', 400));
  }

  // Validate customer exists
  const customer = await User.findById(customerId).select('_id role firstName lastName').lean();
  if (!customer) {
    return next(new ErrorResponse('Customer not found', 404));
  }
  if (customer.role !== 'user') {
    return next(new ErrorResponse('Cylinders can only be registered for customers', 400));
  }

  // ── NO tagCode from client — server generates it ──
  const result = await CylinderService.registerCylinder({
    size,
    emptyWeight: parseFloat(emptyWeight),
    customerId,
    agentId: req.user._id,
    agentRole: req.user.role,
    brand: brand || null,
    gpsCoordinates: gpsCoordinates || null,
    photos: photos || [],
    notes: notes || null,
    req,
  });

  res.status(201).json({
    success: true,
    message: 'Cylinder registered successfully',
    data: {
      cylinder: result.cylinder,
      custodyRecord: result.custodyRecord,
    },
  });
});
// ================================================================
// @desc    Look up cylinder by tag code
// @route   GET /api/v1/agent/cylinders/lookup/:tagCode
// @access  Private/DeliveryAgent
// ================================================================
exports.lookupCylinder = asyncHandler(async (req, res, next) => {
  const tagCode = String(req.params.tagCode || '').toUpperCase().trim();

  if (!tagCode) {
    return next(new ErrorResponse('Tag code is required', 400));
  }

  const cylinder = await Cylinder.findOne({ tagCode, isDeleted: false })
    .populate('userId', 'firstName lastName phone email address city state')
    .lean();

  if (!cylinder) {
    return next(new ErrorResponse(`Cylinder ${tagCode} not found`, 404));
  }

  // Get current remnant balance
  const balance = await RemnantLedgerService.getUserBalance(cylinder.userId._id);
  const eligibility = await RemnantLedgerService.checkEligibility(cylinder.userId._id);

  res.status(200).json({
    success: true,
    data: {
      cylinder: {
        _id: cylinder._id,
        tagCode: cylinder.tagCode,
        size: cylinder.size,
        brand: cylinder.brand,
        emptyWeight: cylinder.emptyWeight,
        lastMeasuredWeight: cylinder.lastMeasuredWeight,
        lastMeasuredAt: cylinder.lastMeasuredAt,
        status: cylinder.status,
        currentCustodian: cylinder.currentCustodian,
      },
      customer: cylinder.userId,
      remnant: {
        currentBalance: balance,
        minimumRequired: eligibility.minimumRequired,
        eligibleForDelivery: eligibility.eligible,
      },
    },
  });
});

// ================================================================
// @desc    Record a weight measurement for a cylinder
// @route   POST /api/v1/agent/cylinders/:id/weigh
// @access  Private/DeliveryAgent
// ================================================================
exports.weighCylinder = asyncHandler(async (req, res, next) => {
  const cylinderId = req.params.id;
  const {
    measuredWeight,
    deliveryId,
    plantRefillRequestId,
    measurementType,
    gps,
    photos,
    notes,
  } = req.body;

  if (measuredWeight === undefined || measuredWeight === null) {
    return next(new ErrorResponse('measuredWeight is required', 400));
  }

  const parsedWeight = parseFloat(measuredWeight);
  if (Number.isNaN(parsedWeight)) {
    return next(new ErrorResponse('measuredWeight must be a number', 400));
  }

  // Normalize GPS: accept either { gps: { type, coordinates } } or { gps: { lat, lng } }
  let gpsCoordinates = null;
  if (gps) {
    if (Array.isArray(gps.coordinates) && gps.coordinates.length === 2) {
      gpsCoordinates = {
        type: 'Point',
        coordinates: gps.coordinates.map(Number),
      };
    } else if (gps.lat !== undefined && gps.lng !== undefined) {
      gpsCoordinates = {
        type: 'Point',
        coordinates: [Number(gps.lng), Number(gps.lat)],
      };
    }
  }

  const result = await CylinderWeightService.recordWeight({
    cylinderId,
    measuredWeight: parsedWeight,
    recordedBy: req.user._id,
    recordedByRole: req.user.role,
    deliveryId: deliveryId || null,
    plantRefillRequestId: plantRefillRequestId || null,
    measurementType: measurementType || 'customer_delivery',
    gpsCoordinates,
    photos: photos || [],
    notes: notes || null,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Weight recorded and remnant updated',
    data: result,
  });
});

// ================================================================
// @desc    Get all cylinders for a specific customer
// @route   GET /api/v1/agent/cylinders/customer/:customerId
// @access  Private/DeliveryAgent
// ================================================================
exports.getCustomerCylinders = asyncHandler(async (req, res, next) => {
  const { customerId } = req.params;

  const cylinders = await CylinderService.getCustomerCylinders(customerId);

  res.status(200).json({
    success: true,
    count: cylinders.length,
    data: cylinders,
  });
});

// ================================================================
// @desc    Get weight history for a cylinder
// @route   GET /api/v1/agent/cylinders/:id/weight-history
// @access  Private/DeliveryAgent
// ================================================================
exports.getWeightHistory = asyncHandler(async (req, res, next) => {
  const cylinderId = req.params.id;
  const { page = 1, limit = 20 } = req.query;

  const result = await CylinderWeightService.getWeightHistoryForCylinder(
    cylinderId,
    { page: parseInt(page, 10), limit: parseInt(limit, 10) }
  );

  res.status(200).json({
    success: true,
    count: result.records.length,
    pagination: result.pagination,
    data: result.records,
  });
});

// ================================================================
// @desc    Get remnant ledger for a cylinder (agent view)
// @route   GET /api/v1/agent/cylinders/:id/remnant
// @access  Private/DeliveryAgent
// ================================================================
exports.getCylinderRemnant = asyncHandler(async (req, res, next) => {
  const cylinderId = req.params.id;
  const { page = 1, limit = 20 } = req.query;

  const cylinder = await Cylinder.findById(cylinderId).lean();
  if (!cylinder || cylinder.isDeleted) {
    return next(new ErrorResponse('Cylinder not found', 404));
  }

  const balance = await RemnantLedgerService.getCylinderBalance(cylinderId);
  const userBalance = await RemnantLedgerService.getUserBalance(cylinder.userId);
  const eligibility = await RemnantLedgerService.checkEligibility(cylinder.userId);

  const ledger = await RemnantLedgerService.getCylinderLedger(cylinderId, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  res.status(200).json({
    success: true,
    data: {
      cylinderTag: cylinder.tagCode,
      cylinderBalance: balance,
      customerTotalBalance: userBalance,
      eligibility,
      ledger: ledger.entries,
      pagination: ledger.pagination,
    },
  });
});



// ================================================================
// @desc    Get a customer's full remnant ledger (agent view)
// @route   GET /api/v1/agent/cylinders/customer/:customerId/remnant
// @access  Private/DeliveryAgent
// ================================================================
exports.getCustomerRemnant = asyncHandler(async (req, res, next) => {
  const { customerId } = req.params;
  const { page = 1, limit = 30 } = req.query;

  const customer = await User.findById(customerId)
    .select('firstName lastName phone email')
    .lean();
  if (!customer) {
    return next(new ErrorResponse('Customer not found', 404));
  }

  const balance = await RemnantLedgerService.getUserBalance(customerId);
  const eligibility = await RemnantLedgerService.checkEligibility(customerId);

  const ledger = await RemnantLedgerService.getUserLedger(customerId, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  res.status(200).json({
    success: true,
    count: ledger.entries.length,
    pagination: ledger.pagination,
    customer: {
      _id: customer._id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
    },
    currentBalance: balance,
    eligibility,
    data: ledger.entries,
  });
});
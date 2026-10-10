const PartnerPlant = require('../models/PartnerPlant');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const AuditService = require('../services/auditService');

// ================================================================
// @desc    Get own plant profile
// @route   GET /api/v1/plant/profile
// @access  Private/Plant
// ================================================================
exports.getProfile = asyncHandler(async (req, res, next) => {
  const plant = await PartnerPlant.findById(req.plantId).lean();

  if (!plant) return next(new ErrorResponse('Plant not found', 404));

  res.status(200).json({
    success: true,
    data: {
      _id: plant._id,
      name: plant.name,
      code: plant.code,
      description: plant.description,
      contactPerson: plant.contactPerson,
      address: plant.address,
      city: plant.city,
      state: plant.state,
      gpsCoordinates: plant.gpsCoordinates,
      serviceRadiusKm: plant.serviceRadiusKm,
      operatingHours: plant.operatingHours,
      status: plant.status,
      metrics: plant.metrics,
    },
  });
});

// ================================================================
// @desc    Update own plant profile (limited fields)
// @route   PUT /api/v1/plant/profile
// @access  Private/Plant (plant_admin)
// ================================================================
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const plant = await PartnerPlant.findById(req.plantId);
  if (!plant) return next(new ErrorResponse('Plant not found', 404));

  // Only plant_admin can update profile
  if (req.user.role !== 'plant_admin') {
    return next(
      new ErrorResponse('Only plant administrators can update the plant profile', 403)
    );
  }

  const previous = {
    contactPerson: plant.contactPerson,
    operatingHours: plant.operatingHours,
  };

  // Allowlist of self-editable fields
  if (req.body.contactPerson) plant.contactPerson = req.body.contactPerson;
  if (req.body.operatingHours) plant.operatingHours = req.body.operatingHours;
  if (req.body.description) plant.description = req.body.description;

  plant.updatedBy = req.user._id;
  await plant.save();

  await AuditService.log({
    action: 'PLANT_UPDATED',
    actorId: req.user._id,
    actorRole: req.user.role,
    entityType: 'PartnerPlant',
    entityId: plant._id,
    previousValue: previous,
    newValue: {
      contactPerson: plant.contactPerson,
      operatingHours: plant.operatingHours,
      description: plant.description,
    },
    metadata: { selfUpdate: true, plantId: plant._id },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Plant profile updated',
    data: plant.toObject(),
  });
});
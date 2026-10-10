// const PlantStaffService = require('../services/plantStaffService');
// const ErrorResponse = require('../utils/errorResponse');
// const asyncHandler = require('../middleware/async');

// // ================================================================
// // @desc    List plant staff
// // @route   GET /api/v1/plant/staff
// // @access  Private/Plant (plant_admin)
// // ================================================================
// exports.listStaff = asyncHandler(async (req, res, next) => {
//   const staff = await PlantStaffService.listStaff(req.plantId);

//   res.status(200).json({
//     success: true,
//     count: staff.length,
//     data: staff,
//   });
// });

// // ================================================================
// // @desc    Invite/add staff
// // @route   POST /api/v1/plant/staff
// // @access  Private/Plant (plant_admin)
// // ================================================================
// exports.inviteStaff = asyncHandler(async (req, res, next) => {
//   const { firstName, lastName, email, phone, password, role } = req.body;

//   const staff = await PlantStaffService.inviteStaff({
//     plantId: req.plantId,
//     firstName,
//     lastName,
//     email,
//     phone,
//     password,
//     role,
//     actorId: req.user._id,
//     actorRole: req.user.role,
//     req,
//   });

//   res.status(201).json({
//     success: true,
//     message: 'Staff added',
//     data: staff,
//   });
// });

// // ================================================================
// // @desc    Update staff role
// // @route   PUT /api/v1/plant/staff/:id
// // @access  Private/Plant (plant_admin)
// // ================================================================
// exports.updateStaffRole = asyncHandler(async (req, res, next) => {
//   const { role } = req.body;

//   const staff = await PlantStaffService.updateStaffRole({
//     staffId: req.params.id,
//     plantId: req.plantId,
//     newRole: role,
//     actorId: req.user._id,
//     actorRole: req.user.role,
//     req,
//   });

//   res.status(200).json({
//     success: true,
//     message: 'Staff updated',
//     data: staff,
//   });
// });

// // ================================================================
// // @desc    Toggle staff active status
// // @route   PATCH /api/v1/plant/staff/:id/toggle-status
// // @access  Private/Plant (plant_admin)
// // ================================================================
// exports.toggleStaffStatus = asyncHandler(async (req, res, next) => {
//   const { isActive } = req.body;

//   if (typeof isActive !== 'boolean') {
//     return next(new ErrorResponse('isActive must be a boolean', 400));
//   }

//   const staff = await PlantStaffService.toggleStaffStatus({
//     staffId: req.params.id,
//     plantId: req.plantId,
//     isActive,
//     actorId: req.user._id,
//     actorRole: req.user.role,
//     req,
//   });

//   res.status(200).json({
//     success: true,
//     message: `Staff ${isActive ? 'activated' : 'deactivated'}`,
//     data: staff,
//   });
// });

// // ================================================================
// // @desc    Remove staff
// // @route   DELETE /api/v1/plant/staff/:id
// // @access  Private/Plant (plant_admin)
// // ================================================================
// exports.removeStaff = asyncHandler(async (req, res, next) => {
//   const result = await PlantStaffService.removeStaff({
//     staffId: req.params.id,
//     plantId: req.plantId,
//     actorId: req.user._id,
//     actorRole: req.user.role,
//     req,
//   });

//   res.status(200).json({
//     success: true,
//     message: 'Staff removed',
//     data: result,
//   });
// });
























const PlantStaffService = require('../services/plantStaffService');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

const isValidId = (id) =>
  typeof id === 'string' &&
  /^[a-f\d]{24}$/i.test(id);

// ================================================================
// GET /api/v1/plant/staff
// List staff belonging to the authenticated plant
// ================================================================
exports.listStaff = asyncHandler(async (req, res, next) => {
  if (!req.plantId) {
    return next(new ErrorResponse('Plant context is missing', 400));
  }

  const staff = await PlantStaffService.listStaff(req.plantId);

  res.status(200).json({
    success: true,
    count: staff.length,
    data: staff,
  });
});

// ================================================================
// POST /api/v1/plant/staff
// Create staff using the assigned plant's coordinates
// ================================================================
exports.inviteStaff = asyncHandler(async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    role,
  } = req.body;

  if (!req.plantId) {
    return next(new ErrorResponse('Plant context is missing', 400));
  }

  if (!req.user?._id || !req.user?.role) {
    return next(
      new ErrorResponse('Authenticated user and role are required', 401)
    );
  }

  if (
    !firstName?.trim() ||
    !lastName?.trim() ||
    !email?.trim() ||
    !phone?.trim() ||
    !password
  ) {
    return next(
      new ErrorResponse(
        'First name, last name, email, phone and password are required',
        400
      )
    );
  }

  if (typeof password !== 'string' || password.length < 8) {
    return next(
      new ErrorResponse('Password must be at least 8 characters', 400)
    );
  }

  const staff = await PlantStaffService.inviteStaff({
    plantId: req.plantId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    password,
    role,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(201).json({
    success: true,
    message: 'Staff added successfully',
    data: staff,
  });
});

// ================================================================
// PUT /api/v1/plant/staff/:id
// Update staff role within the authenticated plant
// ================================================================
exports.updateStaffRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  const { id } = req.params;

  if (!req.plantId) {
    return next(new ErrorResponse('Plant context is missing', 400));
  }

  if (!isValidId(id)) {
    return next(new ErrorResponse('Invalid staff ID', 400));
  }

  if (typeof role !== 'string' || !role.trim()) {
    return next(new ErrorResponse('A valid staff role is required', 400));
  }

  if (!req.user?._id || !req.user?.role) {
    return next(new ErrorResponse('Authentication required', 401));
  }

  const staff = await PlantStaffService.updateStaffRole({
    staffId: id,
    plantId: req.plantId,
    newRole: role.trim(),
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Staff role updated successfully',
    data: staff,
  });
});

// ================================================================
// PATCH /api/v1/plant/staff/:id/toggle-status
// Activate or deactivate staff
// ================================================================
exports.toggleStaffStatus = asyncHandler(async (req, res, next) => {
  const { isActive } = req.body;
  const { id } = req.params;

  if (!req.plantId) {
    return next(new ErrorResponse('Plant context is missing', 400));
  }

  if (!isValidId(id)) {
    return next(new ErrorResponse('Invalid staff ID', 400));
  }

  if (typeof isActive !== 'boolean') {
    return next(
      new ErrorResponse('isActive must be true or false', 400)
    );
  }

  if (!req.user?._id || !req.user?.role) {
    return next(new ErrorResponse('Authentication required', 401));
  }

  const staff = await PlantStaffService.toggleStaffStatus({
    staffId: id,
    plantId: req.plantId,
    isActive,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: `Staff ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: staff,
  });
});

// ================================================================
// DELETE /api/v1/plant/staff/:id
// Remove staff from the authenticated plant
// ================================================================
exports.removeStaff = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!req.plantId) {
    return next(new ErrorResponse('Plant context is missing', 400));
  }

  if (!isValidId(id)) {
    return next(new ErrorResponse('Invalid staff ID', 400));
  }

  if (!req.user?._id || !req.user?.role) {
    return next(new ErrorResponse('Authentication required', 401));
  }

  const result = await PlantStaffService.removeStaff({
    staffId: id,
    plantId: req.plantId,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Staff removed successfully',
    data: result,
  });
});

const PlantService = require("../services/plantService");
const PlantStaffService = require("../services/plantStaffService");
const PartnerPlant = require("../models/PartnerPlant");
const PlantPriceAgreement = require("../models/PlantPriceAgreement");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");

// ================================================================
// @desc    List all plants (admin)
// @route   GET /api/v1/admin/plants
// @access  Private/Admin
// ================================================================
exports.getPlants = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    city,
    state,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const filter = {};
  if (status && status !== "all") filter.status = status;
  if (city) filter.city = new RegExp(city, "i");
  if (state) filter.state = new RegExp(state, "i");

  if (search) {
    filter.$or = [
      { name: new RegExp(search, "i") },
      { code: new RegExp(search, "i") },
      { address: new RegExp(search, "i") },
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  const result = await PlantService.list(filter, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort,
  });

  res.status(200).json({
    success: true,
    count: result.items.length,
    total: result.pagination.total,
    pagination: result.pagination,
    data: result.items,
  });
});

// ================================================================
// @desc    Get a single plant (admin)
// @route   GET /api/v1/admin/plants/:id
// @access  Private/Admin
// ================================================================
// exports.getPlant = asyncHandler(async (req, res, next) => {
//   const plant = await PartnerPlant.findOne({
//     _id: req.params.id,
//     isDeleted: false,
//   }).lean();

//   if (!plant) return next(new ErrorResponse('Plant not found', 404));

//   // Attach staff count
//   const staffCount = await User.countDocuments({
//     plantId: plant._id,
//     role: { $in: PlantStaffService.VALID_ROLES },
//     isActive: true,
//   });

//   // Active price
//   const price = await PlantService.getActivePrice(plant._id);

//   res.status(200).json({
//     success: true,
//     data: {
//       plant,
//       staffCount,
//       activePrice: price || null,
//     },
//   });
// });

exports.getPlant = asyncHandler(async (req, res, next) => {
  const plant = await PartnerPlant.findOne({
    _id: req.params.id,
    isDeleted: false,
  })
    .populate("currentPriceAgreement")
    .populate("approvedBy", "firstName lastName email role")
    .populate("suspendedBy", "firstName lastName email role")
    .populate("createdBy", "firstName lastName email role")
    .lean();

  if (!plant) return next(new ErrorResponse("Plant not found", 404));

  // Staff count
  const staffCount = await User.countDocuments({
    plantId: plant._id,
    role: { $in: PlantStaffService.VALID_ROLES },
    isActive: true,
  });

  // Active price agreement
  const activePrice = await PlantService.getActivePrice(plant._id);

  res.status(200).json({
    success: true,
    data: {
      plant,
      staffCount,
      activePrice: activePrice || null,
    },
  });
});

// ================================================================
// @desc    Create a plant (admin)
// @route   POST /api/v1/admin/plants
// @access  Private/Admin
// ================================================================
// exports.createPlant = asyncHandler(async (req, res, next) => {
//   const plant = await PlantService.createPlant(
//     req.body,
//     req.user._id,
//     req
//   );

//   res.status(201).json({
//     success: true,
//     message: 'Plant created successfully',
//     data: plant,
//   });
// });

exports.createPlant = asyncHandler(async (req, res, next) => {
  const payload = req.body || {};

  // Basic shape checks before hitting the service
  if (!payload.name || !payload.code) {
    return next(new ErrorResponse("name and code are required", 400));
  }
  if (
    !payload.gpsCoordinates?.coordinates ||
    !Array.isArray(payload.gpsCoordinates.coordinates) ||
    payload.gpsCoordinates.coordinates.length !== 2
  ) {
    return next(
      new ErrorResponse("gpsCoordinates.coordinates must be [lng, lat]", 400),
    );
  }

  // Normalize GPS from either { lat, lng } or { coordinates: [lng, lat] }
  let coords = payload.gpsCoordinates.coordinates;
  if (!Array.isArray(coords) && payload.gpsCoordinates.lat != null) {
    coords = [
      Number(payload.gpsCoordinates.lng),
      Number(payload.gpsCoordinates.lat),
    ];
  }
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return next(new ErrorResponse("Invalid GPS coordinates", 400));
  }

  const plant = await PlantService.createPlant(
    { ...payload, gpsCoordinates: { type: "Point", coordinates: [lng, lat] } },
    req.user._id,
    req,
  );

  // Socket event (matches frontend `useLiveEvent('plant.created')`)
  try {
    const io = req.app.get("io");
    if (io)
      io.to("admin:ops").emit("plant.created", {
        plantId: plant._id,
        name: plant.name,
        code: plant.code,
      });
  } catch (err) {
    console.error("Socket emit failed (plant.created):", err.message);
  }

  res.status(201).json({
    success: true,
    message: "Plant created successfully. Approve it to make it active.",
    data: plant,
  });
});

// ================================================================
// @desc    Update a plant (admin)
// @route   PUT /api/v1/admin/plants/:id
// @access  Private/Admin
// ================================================================
// exports.updatePlant = asyncHandler(async (req, res, next) => {
//   const plant = await PlantService.updatePlant(
//     req.params.id,
//     req.body,
//     req.user._id,
//     req
//   );

//   res.status(200).json({
//     success: true,
//     message: 'Plant updated successfully',
//     data: plant,
//   });
// });

exports.updatePlant = asyncHandler(async (req, res, next) => {
  const plant = await PlantService.updatePlant(
    req.params.id,
    req.body || {},
    req.user._id,
    req,
  );

  try {
    const io = req.app.get("io");
    if (io) io.to("admin:ops").emit("plant.updated", { plantId: plant._id });
  } catch (err) {
    /* noop */
  }

  res.status(200).json({
    success: true,
    message: "Plant updated successfully",
    data: plant,
  });
});

// ================================================================
// @desc    Approve a plant (admin)
// @route   PATCH /api/v1/admin/plants/:id/approve
// @access  Private/Admin
// ================================================================
// exports.approvePlant = asyncHandler(async (req, res, next) => {
//   const plant = await PlantService.approvePlant(
//     req.params.id,
//     req.user._id,
//     req
//   );

//   res.status(200).json({
//     success: true,
//     message: 'Plant approved successfully',
//     data: plant,
//   });
// });

exports.approvePlant = asyncHandler(async (req, res, next) => {
  const plant = await PlantService.approvePlant(
    req.params.id,
    req.user._id,
    req,
  );
  try {
    const io = req.app.get("io");
    if (io) io.to("admin:ops").emit("plant.approved", { plantId: plant._id });
  } catch (err) {}
  res
    .status(200)
    .json({ success: true, message: "Plant approved", data: plant });
});

// ================================================================
// @desc    Suspend a plant (admin)
// @route   PATCH /api/v1/admin/plants/:id/suspend
// @access  Private/Admin
// ================================================================
// exports.suspendPlant = asyncHandler(async (req, res, next) => {
//   const { reason } = req.body;
//   const plant = await PlantService.suspendPlant(
//     req.params.id,
//     reason,
//     req.user._id,
//     req
//   );

//   res.status(200).json({
//     success: true,
//     message: 'Plant suspended',
//     data: plant,
//   });
// });

exports.suspendPlant = asyncHandler(async (req, res, next) => {
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return next(new ErrorResponse("Suspension reason is required", 400));
  }

  const plant = await PlantService.suspendPlant(
    req.params.id,
    String(reason).trim(),
    req.user._id,
    req,
  );

  try {
    const io = req.app.get("io");
    if (io) io.to("admin:ops").emit("plant.suspended", { plantId: plant._id });
  } catch (err) {
    /* noop */
  }

  res.status(200).json({
    success: true,
    message: "Plant suspended",
    data: plant,
  });
});

// ================================================================
// @desc    Activate a plant (admin)
// @route   PATCH /api/v1/admin/plants/:id/activate
// @access  Private/Admin
// ================================================================
// exports.activatePlant = asyncHandler(async (req, res, next) => {
//   const plant = await PlantService.activatePlant(
//     req.params.id,
//     req.user._id,
//     req,
//   );

//   res.status(200).json({
//     success: true,
//     message: "Plant activated",
//     data: plant,
//   });
// });

exports.activatePlant = asyncHandler(async (req, res, next) => {
  const plant = await PlantService.activatePlant(req.params.id, req.user._id, req);
  try {
    const io = req.app.get('io');
    if (io) io.to('admin:ops').emit('plant.activated', { plantId: plant._id });
  } catch (err) {}
  res.status(200).json({ success: true, message: 'Plant activated', data: plant });
});

// ================================================================
// @desc    List staff of a plant (admin)
// @route   GET /api/v1/admin/plants/:id/staff
// @access  Private/Admin
// ================================================================
exports.getPlantStaff = asyncHandler(async (req, res, next) => {
  const staff = await PlantStaffService.listStaff(req.params.id);

  res.status(200).json({
    success: true,
    count: staff.length,
    data: staff,
  });
});

// ================================================================
// @desc    Add staff to a plant (admin)
// @route   POST /api/v1/admin/plants/:id/staff
// @access  Private/Admin
// ================================================================
exports.addPlantStaff = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, phone, password, role } = req.body;

  const staff = await PlantStaffService.inviteStaff({
    plantId: req.params.id,
    firstName,
    lastName,
    email,
    phone,
    password,
    role,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(201).json({
    success: true,
    message: "Staff member added",
    data: staff,
  });
});

// ================================================================
// @desc    Remove staff from a plant (admin)
// @route   DELETE /api/v1/admin/plants/:id/staff/:staffId
// @access  Private/Admin
// ================================================================
exports.removePlantStaff = asyncHandler(async (req, res, next) => {
  const result = await PlantStaffService.removeStaff({
    staffId: req.params.staffId,
    plantId: req.params.id,
    actorId: req.user._id,
    actorRole: req.user.role,
    req,
  });

  res.status(200).json({
    success: true,
    message: "Staff member removed",
    data: result,
  });
});

// ================================================================
// @desc    List price agreements for a plant
// @route   GET /api/v1/admin/plants/:id/price-agreements
// @access  Private/Admin
// ================================================================
exports.getPlantPrices = asyncHandler(async (req, res, next) => {
  const prices = await PlantService.listPriceAgreements(req.params.id);

  res.status(200).json({
    success: true,
    count: prices.length,
    data: prices,
  });
});

// ================================================================
// @desc    Create a price agreement for a plant
// @route   POST /api/v1/admin/plants/:id/price-agreements
// @access  Private/Admin
// ================================================================
exports.createPlantPrice = asyncHandler(async (req, res, next) => {
  const agreement = await PlantService.createPriceAgreement(
    req.params.id,
    req.body,
    req.user._id,
    req,
  );

  res.status(201).json({
    success: true,
    message: "Price agreement created",
    data: agreement,
  });
});

// ================================================================
// @desc    Cancel a price agreement
// @route   PATCH /api/v1/admin/price-agreements/:id/cancel
// @access  Private/Admin
// ================================================================
exports.cancelPriceAgreement = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  const agreement = await PlantPriceAgreement.findById(req.params.id);
  if (!agreement) return next(new ErrorResponse("Agreement not found", 404));
  if (agreement.status === "cancelled") {
    return next(new ErrorResponse("Already cancelled", 400));
  }

  agreement.status = "cancelled";
  agreement.cancelledBy = req.user._id;
  agreement.cancelledAt = new Date();
  agreement.cancellationReason = reason || null;
  await agreement.save();

  res.status(200).json({
    success: true,
    message: "Price agreement cancelled",
    data: agreement,
  });
});

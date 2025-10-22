const User = require('../../models/User');
const asyncHandler = require('../../middleware/async');
const ErrorResponse = require('../../utils/errorResponse');

// @desc    Get all users with filtering, sorting, and pagination
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  const {
    search,
    role,
    status,
    city,
    state,
    gender,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = req.query;

  // Build query object
  let query = {};

  // Search functionality
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by role
  if (role && role !== 'all') {
    query.role = role;
  }

  // Filter by status
  if (status && status !== 'all') {
    query.isActive = status === 'active';
  }

  // Filter by city
  if (city && city !== 'all') {
    query.city = { $regex: city, $options: 'i' };
  }

  // Filter by state
  if (state && state !== 'all') {
    query.state = { $regex: state, $options: 'i' };
  }

  // Filter by gender
  if (gender && gender !== 'all') {
    query.gender = gender;
  }

  // Sort configuration
  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const users = await User.find(query)
    .select('-password')
    .sort(sortConfig)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    data: {
      users
    }
  });
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});

// @desc    Create new user (Admin)
// @route   POST /api/v1/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    dob,
    gender,
    address,
    city,
    state,
    gpsCoordinates,
    profilePic,
    role,
    walletBalance,
    isActive
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('User with this email already exists', 400));
  }

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    dob,
    gender,
    address,
    city,
    state,
    gpsCoordinates,
    profilePic,
    role: role || 'user',
    walletBalance: walletBalance || 0,
    isActive: isActive !== undefined ? isActive : true
  });

  const userResponse = await User.findById(user._id).select('-password');

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: {
      user: userResponse
    }
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Fields that can be updated
  const allowedFields = [
    'firstName', 'lastName', 'phone', 'dob', 'gender', 'address',
    'city', 'state', 'gpsCoordinates', 'profilePic', 'role',
    'walletBalance', 'isActive'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  const updatedUser = await User.findById(user._id).select('-password');
  
  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: {
      user: updatedUser
    }
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Prevent admin from deleting themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new ErrorResponse('You cannot delete your own account', 400));
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Toggle user status
// @route   PATCH /api/v1/users/:id/status
// @access  Private/Admin
exports.toggleUserStatus = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Prevent admin from deactivating themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new ErrorResponse('You cannot deactivate your own account', 400));
  }

  user.isActive = req.body.isActive;
  await user.save();

  const updatedUser = await User.findById(user._id).select('-password');

  res.status(200).json({
    success: true,
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      user: updatedUser
    }
  });
});

// @desc    Update user wallet balance
// @route   PATCH /api/v1/users/:id/wallet
// @access  Private/Admin
exports.updateWalletBalance = asyncHandler(async (req, res, next) => {
  const { amount, operation } = req.body; // operation: 'add', 'subtract', 'set'

  if (!amount || amount < 0) {
    return next(new ErrorResponse('Please provide a valid amount', 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  let newBalance = user.walletBalance;

  switch (operation) {
    case 'add':
      newBalance += amount;
      break;
    case 'subtract':
      if (user.walletBalance < amount) {
        return next(new ErrorResponse('Insufficient wallet balance', 400));
      }
      newBalance -= amount;
      break;
    case 'set':
      newBalance = amount;
      break;
    default:
      return next(new ErrorResponse('Invalid operation. Use: add, subtract, or set', 400));
  }

  user.walletBalance = newBalance;
  await user.save();

  const updatedUser = await User.findById(user._id).select('-password');

  res.status(200).json({
    success: true,
    message: `Wallet balance updated successfully`,
    data: {
      user: updatedUser,
      previousBalance: user.walletBalance,
      newBalance: updatedUser.walletBalance,
      operation
    }
  });
});

// @desc    Get users by location (geospatial query)
// @route   GET /api/v1/users/location/nearby
// @access  Private/Admin
exports.getUsersByLocation = asyncHandler(async (req, res, next) => {
  const { longitude, latitude, maxDistance = 10000 } = req.query; // maxDistance in meters

  if (!longitude || !latitude) {
    return next(new ErrorResponse('Please provide longitude and latitude', 400));
  }

  const users = await User.find({
    gpsCoordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        $maxDistance: parseInt(maxDistance)
      }
    }
  }).select('-password');

  res.status(200).json({
    success: true,
    count: users.length,
    data: {
      users
    }
  });
});

// @desc    Bulk delete users
// @route   DELETE /api/v1/users/bulk/delete
// @access  Private/Admin
exports.bulkDeleteUsers = asyncHandler(async (req, res, next) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse('User IDs array is required', 400));
  }

  // Prevent admin from deleting themselves
  if (userIds.includes(req.user._id.toString())) {
    return next(new ErrorResponse('You cannot delete your own account', 400));
  }

  const result = await User.deleteMany({ _id: { $in: userIds } });

  res.status(200).json({
    success: true,
    message: `${result.deletedCount} users deleted successfully`,
    data: {
      deletedCount: result.deletedCount
    }
  });
});

// @desc    Bulk update user status
// @route   PATCH /api/v1/users/bulk/status
// @access  Private/Admin
exports.bulkUpdateStatus = asyncHandler(async (req, res, next) => {
  const { userIds, isActive } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse('User IDs array is required', 400));
  }

  if (typeof isActive !== 'boolean') {
    return next(new ErrorResponse('isActive boolean field is required', 400));
  }

  // Prevent admin from deactivating themselves
  if (userIds.includes(req.user._id.toString())) {
    return next(new ErrorResponse('You cannot change your own account status', 400));
  }

  const result = await User.updateMany(
    { _id: { $in: userIds } },
    { $set: { isActive } }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} users ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      modifiedCount: result.modifiedCount
    }
  });
});

// @desc    Get user statistics
// @route   GET /api/v1/users/stats/overview
// @access  Private/Admin
exports.getUserStats = asyncHandler(async (req, res, next) => {
  const stats = await User.aggregate([
    {
      $facet: {
        totalUsers: [
          { $count: 'count' }
        ],
        usersByRole: [
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 }
            }
          }
        ],
        usersByStatus: [
          {
            $group: {
              _id: '$isActive',
              count: { $sum: 1 }
            }
          }
        ],
        usersByGender: [
          {
            $match: { gender: { $ne: null } }
          },
          {
            $group: {
              _id: '$gender',
              count: { $sum: 1 }
            }
          }
        ],
        recentUsers: [
          {
            $sort: { createdAt: -1 }
          },
          {
            $limit: 5
          },
          {
            $project: {
              firstName: 1,
              lastName: 1,
              email: 1,
              role: 1,
              createdAt: 1
            }
          }
        ]
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      stats: stats[0]
    }
  });
});
const path = require('path');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Create user
// @route   POST /api/v1/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const user = await User.create(req.body);

  res.status(201).json({
    success: true,
    data: user,
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Upload photo for user
// @route   PUT /api/v1/users/:id/photo
// @access  Private
exports.uploadUserPhoto = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  // Make sure user is updating their own photo or admin
  if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(`User ${req.user.id} is not authorized to update this user`, 401)
    );
  }

  if (!req.files) {
    return next(new ErrorResponse(`Please upload a file`, 400));
  }

  const file = req.files.file;

  // Check if the file is an image
  if (!file.mimetype.startsWith('image')) {
    return next(new ErrorResponse(`Please upload an image file`, 400));
  }

  // Check file size
  if (file.size > Number(process.env.MAX_FILE_UPLOAD)) {
    return next(
      new ErrorResponse(
        `Please upload an image less than ${process.env.MAX_FILE_UPLOAD} bytes`,
        400
      )
    );
  }

  // Create custom filename
  file.name = `photo_${user._id}${path.parse(file.name).ext}`;

  // Move file
  file.mv(`${process.env.FILE_UPLOAD_PATH}/users/${file.name}`, async (err) => {
    if (err) {
      console.error(err);
      return next(new ErrorResponse(`Problem with file upload`, 500));
    }

    await User.findByIdAndUpdate(req.params.id, { profilePic: file.name });

    res.status(200).json({
      success: true,
      data: file.name,
    });
  });
});

// @desc Update user password
// @route PUT /api/users/me/password
// @access Private
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });

    req.user.password = newPassword;
    await req.user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(400).json({ message: "Failed to update password", error: err.message });
  }
};

// @desc Update user email
// @route PUT /api/users/me/email
// @access Private
exports.updateEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ message: "New email required" });

    req.user.email = newEmail;
    await req.user.save();
    res.json({ message: "Email updated successfully", email: req.user.email });
  } catch (err) {
    res.status(400).json({ message: "Failed to update email", error: err.message });
  }
};

// @desc Delete account
// @route DELETE /api/users/me
// @access Private
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete account" });
  }
};



// @desc    Get user statistics
// @route   GET /api/v1/users/stats
// @access  Private/Admin
exports.getUserDashboardStats = asyncHandler(async (req, res, next) => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: stats,
  });
});

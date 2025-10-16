const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); 
const User = require('../models/User');
const Order = require('../models/Order'); 
const Wallet = require('../models/wallet'); 
const Subscription = require('../models/SubscriptionPlan'); 
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const sendEmail = require('../utils/email');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      phone,
      address,
      dob,
      gender,
      state,
      city,
      gps,
    } = req.body;

    // 1️⃣ Validate passwords
    if (password !== confirmPassword) {
      return next(new ErrorResponse("Passwords do not match", 400));
    }

    // 2️⃣ Parse GPS coordinates (GeoJSON Point)
    let gpsCoordinates = null;
    if (gps) {
      try {
        const parsed = JSON.parse(gps);
        if (
          parsed.type === "Point" &&
          Array.isArray(parsed.coordinates) &&
          parsed.coordinates.length === 2 &&
          parsed.coordinates.every((n) => typeof n === "number")
        ) {
          gpsCoordinates = parsed;
        } else {
          return next(
            new ErrorResponse(
              "Invalid GPS format. Expected GeoJSON { type: 'Point', coordinates: [lng, lat] }",
              400
            )
          );
        }
      } catch (err) {
        return next(new ErrorResponse("GPS must be valid JSON string", 400));
      }
    } else {
      return next(new ErrorResponse("GPS coordinates are required", 400));
    }

    // 3️⃣ Handle profile picture (multer saves req.file)
    const profilePic = req.file ? req.file.filename : "default.jpg";

    // 4️⃣ Create user in MongoDB
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      dob,
      gender,
      state,
      city,
      gpsCoordinates,
      profilePic,
    });

    // 🪙 5️⃣ Create wallet and link to user
    const wallet = await Wallet.create({
      userId: user._id,
      balance: 0,
      transactions: [],
    });

    // add wallet reference to user
    user.wallet = wallet._id;
    await user.save();

    // 6️⃣ Remove sensitive fields
    user.password = undefined;

    // 7️⃣ Generate JWT token
    const token = signToken(user._id);

    // 8️⃣ Respond to frontend
    res.status(201).json({
      success: true,
      token,
      user: {
        ...user._doc,
        wallet,
      },
    });
  } catch (err) {
    console.error("Error during registration:", err);
    return next(new ErrorResponse(err.message || "Registration failed", 500));
  }
});



// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse('Please provide a valid email address', 400));
  }

  // Check for user with case-insensitive email
  const user = await User.findOne({ 
    email: { $regex: new RegExp(`^${email}$`, 'i') }
  }).select('+password +loginAttempts +lockUntil');

  if (!user) {
    // Simulate password comparison to prevent user enumeration timing attacks
    await bcrypt.compare(password, '$2a$10$fakeHashForTimingAttackPrevention');
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
    res.set('Retry-After', retryAfter);
    return next(new ErrorResponse('Account locked due to too many failed attempts. Please try again later.', 423));
  }

  // Check if password matches - FIXED: Use bcrypt directly since matchPassword might not exist
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    // Increment failed login attempts
    user.loginAttempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (user.loginAttempts >= 5) {
      user.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
      user.loginAttempts = 0;
      
      await user.save({ validateBeforeSave: false });
      
      // Log failed login attempt
      await LoginHistory.create({
        userId: user._id,
        email: req.body.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        status: 'failed',
        reason: 'Account locked due to too many failed attempts'
      });
      
      return next(new ErrorResponse('Account locked due to too many failed attempts. Please try again in 30 minutes.', 423));
    }
    
    await user.save({ validateBeforeSave: false });
    
    // Log failed login attempt
    await LoginHistory.create({
      userId: user._id,
      email: req.body.email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      status: 'failed',
      reason: 'Invalid password'
    });
    
    const attemptsLeft = 5 - user.loginAttempts;
    return next(new ErrorResponse(`Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`, 401));
  }

  // Reset login attempts on successful login
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });
  }

  // Log successful login
  // await LoginHistory.create({
  //   userId: user._id,
  //   email: req.body.email,
  //   ipAddress: req.ip,
  //   userAgent: req.get('User-Agent'),
  //   status: 'success'
  // });

  // FIXED: Use signToken instead of sendTokenResponse which expects getSignedJwtToken
  const token = signToken(user._id);
  
  // Remove password from output
  user.password = undefined;

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
      gender: user.gender || "",
      address: user.address || "",
      city: user.city || "",
      state: user.state || "",
      gpsCoordinates: user.gpsCoordinates || "",
      profilePic: user.profilePic
        ? `${req.protocol}://${req.get("host")}/uploads/${user.profilePic}`
        : `${req.protocol}://${req.get("host")}/uploads/default.jpg`,
      memberSince: user.createdAt.toISOString().split("T")[0],
      role: user.role
    }
  });
});

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get user profile
// @route   GET /api/v1/auth/me
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  try {
    const user = req.user;  // 👈 already fetched by protect middleware

    const profileData = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
      gender: user.gender || "",
      address: user.address || "",
      city: user.city || "",
      state: user.state || "",
      gpsCoordinates: user.gpsCoordinates || "",
      profilePic: user.profilePic
        ? `${req.protocol}://${req.get("host")}/uploads/${user.profilePic}`
        : `${req.protocol}://${req.get("host")}/uploads/default.jpg`,
      memberSince: user.createdAt.toISOString().split("T")[0],
      role: user.role
    };

    res.status(200).json({
      success: true,
      user: profileData
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
});


// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      dob,
      gender,
      address,
      city,
      state,
      gpsCoordinates
    } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        firstName,
        lastName,
        phone,
        dob,
        gender,
        address,
        city,
        state,
        gpsCoordinates,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// @desc    Update notification preferences
// @route   PUT /api/v1/auth/profile/preferences
// @access  Private
exports.updatePreferences = asyncHandler(async (req, res) => {
  try {
    const { orderUpdates, deliveryNotifications, promotionalOffers, newsletter } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        notificationPreferences: {
          orderUpdates,
          deliveryNotifications,
          promotionalOffers,
          newsletter
        }
      },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: updatedUser.notificationPreferences
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating preferences'
    });
  }
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  // FIXED: Add safety check for req.user
  if (!req.user || !req.user.id) {
    return next(new ErrorResponse('User not authenticated', 401));
  }

  const user = await User.findById(req.user.id).select('+password');

  // Check current password using bcrypt directly
  const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
  
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  // Generate new token
  const token = signToken(user._id);
  user.password = undefined;

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    }
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  // Get reset token - FIXED: Check if getResetPasswordToken method exists
  let resetToken;
  if (typeof user.getResetPasswordToken === 'function') {
    resetToken = user.getResetPasswordToken();
  } else {
    // Fallback: generate random token
    resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  }

  await user.save({ validateBeforeSave: false });

  // Create reset URL
  const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/resetpassword/${resetToken}`;

  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password reset token',
      message
    });

    res.status(200).json({ success: true, data: 'Email sent' });
  } catch (err) {
    console.log(err);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateBeforeSave: false });

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid token', 400));
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Generate new token
  const token = signToken(user._id);
  user.password = undefined;

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    }
  });
});


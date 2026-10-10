const User = require('../models/User');
const PartnerPlant = require('../models/PartnerPlant');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const authService = require('../services/authService');
const AuditService = require('../services/auditService');

// Helper to set cookies (shared with main auth)
const setTokenCookies = (res, tokens) => {
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    credentials: true,
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    credentials: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearTokenCookies = (res) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
};

const sanitizePlantUser = (user, plant = null) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  plantId: user.plantId,
  plant: plant
    ? {
        _id: plant._id,
        name: plant.name,
        code: plant.code,
        status: plant.status,
        city: plant.city,
        state: plant.state,
      }
    : null,
  isActive: user.isActive,
  lastLogin: user.lastLogin,
});

// ================================================================
// @desc    Plant user login
// @route   POST /api/v1/plant/auth/login
// @access  Public
// ================================================================
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  // Find user with password
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+password +loginAttempts +lockUntil'
  );

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Must be a plant role
  if (!user.role || !user.role.startsWith('plant_')) {
    return next(
      new ErrorResponse('This account is not authorized for the plant portal', 403)
    );
  }

  // Must have a plant
  if (!user.plantId) {
    return next(new ErrorResponse('No plant assigned to this account', 403));
  }

  // Check lock
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
    res.set('Retry-After', retryAfter);
    return next(
      new ErrorResponse('Account locked. Please try again later.', 423)
    );
  }

  // Verify password
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    if (user.loginAttempts >= 5) {
      user.lockUntil = Date.now() + 30 * 60 * 1000;
      user.loginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Reset attempts
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
  }

  // Check active + plant status
  if (!user.isActive) {
    return next(new ErrorResponse('Account deactivated', 403));
  }

  const plant = await PartnerPlant.findById(user.plantId).lean();
  if (!plant) {
    return next(new ErrorResponse('Assigned plant not found', 404));
  }

  if (plant.isDeleted) {
    return next(new ErrorResponse('Assigned plant no longer exists', 403));
  }

  if (plant.status !== 'active') {
    return next(
      new ErrorResponse(
        `Plant is currently ${plant.status}. Contact E-GAS support.`,
        403
      )
    );
  }

  // Update login
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save({ validateBeforeSave: false });

  // Generate tokens
  const tokens = authService.generateTokens(user);
  setTokenCookies(res, tokens);

  await AuditService.log({
    action: 'SYSTEM_MIGRATION', // generic; can add PLANT_LOGIN later
    actorId: user._id,
    actorRole: user.role,
    entityType: 'User',
    entityId: user._id,
    metadata: { event: 'plant_login', plantId: plant._id },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      user: sanitizePlantUser(user, plant),
    },
  });
});

// ================================================================
// @desc    Plant user refresh
// @route   POST /api/v1/plant/auth/refresh
// @access  Public (refresh cookie required)
// ================================================================
exports.refresh = asyncHandler(async (req, res, next) => {
  let refreshToken;
  if (req.cookies?.refreshToken) refreshToken = req.cookies.refreshToken;
  else if (req.body?.refreshToken) refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return next(new ErrorResponse('Refresh token required', 400));
  }

  try {
    const { userId } = await authService.refreshAccessToken(refreshToken);
    const user = await User.findById(userId).select('-password -__v');

    if (!user || !user.isActive) {
      return next(new ErrorResponse('User not found or inactive', 401));
    }

    if (!user.role?.startsWith('plant_')) {
      return next(new ErrorResponse('Not a plant user', 403));
    }

    await authService.revokeRefreshToken(userId, refreshToken);
    const tokens = await authService.generateTokens(user);
    setTokenCookies(res, tokens);

    const plant = user.plantId
      ? await PartnerPlant.findById(user.plantId).lean()
      : null;

    res.status(200).json({
      success: true,
      data: { user: sanitizePlantUser(user, plant) },
    });
  } catch (error) {
    clearTokenCookies(res);
    return next(new ErrorResponse('Invalid refresh token', 401));
  }
});

// ================================================================
// @desc    Plant user logout
// @route   POST /api/v1/plant/auth/logout
// @access  Private (plant)
// ================================================================
exports.logout = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.accessToken;
  let refreshToken = req.cookies?.refreshToken;

  if (!token && req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) await authService.blacklistToken(token);
  if (refreshToken && req.user)
    await authService.revokeRefreshToken(req.user._id.toString(), refreshToken);

  clearTokenCookies(res);

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ================================================================
// @desc    Get current plant user profile
// @route   GET /api/v1/plant/auth/me
// @access  Private (plant)
// ================================================================
exports.me = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .select('-password -__v -loginAttempts -lockUntil')
    .lean();

  if (!user) return next(new ErrorResponse('User not found', 404));

  const plant = user.plantId
    ? await PartnerPlant.findById(user.plantId).lean()
    : null;

  res.status(200).json({
    success: true,
    data: sanitizePlantUser(user, plant),
  });
});
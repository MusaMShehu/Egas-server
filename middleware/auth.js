const jwt = require('jsonwebtoken');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const asyncHandler = require('./async');

// Protect routes - Authenticate both users and admins
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.session && req.session.token) {
    token = req.session.token;
  }

  if (!token) {
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ works whether payload has id or _id
    const userId = decoded.id || decoded._id;
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return next(new ErrorResponse('The user belonging to this token no longer exists', 401));
    }

    req.user = currentUser;

    if (req.session) {
      req.session.user = {
        id: currentUser._id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        email: currentUser.email,
        role: currentUser.role
      };
      req.session.token = token;
    }

    next();
  } catch (err) {
    if (req.session) {
      req.session.user = null;
      req.session.token = null;
    }
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse('Not authorized to access this route', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }
    next();
  };
};

// Middleware specifically for user access
exports.userAuth = [
  exports.protect,
  exports.authorize('user', 'admin') // Users and admins can access user routes
];

// Middleware specifically for admin access
exports.adminAuth = [
  exports.protect,
  exports.authorize('admin') // Only admins can access admin routes
];

// Optional: Middleware to check if user is authenticated (without throwing error)
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.session && req.session.token) {
    token = req.session.token;
  }

  if (!token) {
    // No token, but proceed without user data
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    const currentUser = await User.findById(decoded.id);
    if (currentUser) {
      req.userDocument = currentUser;
      
      if (req.session) {
        req.session.user = {
          id: currentUser._id,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          role: currentUser.role
        };
        req.session.token = token;
      }
    }
    
    next();
  } catch (err) {
    // Invalid token, but proceed without user data
    next();
  }
});

// Middleware to refresh session data on each request
exports.refreshSession = asyncHandler(async (req, res, next) => {
  if (req.session && req.session.user) {
    try {
      const currentUser = await User.findById(req.session.user.id);
      if (currentUser) {
        req.session.user = {
          id: currentUser._id,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          role: currentUser.role
        };
      }
    } catch (err) {
      // If user not found, clear session
      req.session.user = null;
      req.session.token = null;
    }
  }
  next();
});
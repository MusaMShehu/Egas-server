// const jwt = require('jsonwebtoken');
// const ErrorResponse = require('../utils/errorResponse');
// const User = require('../models/User');
// const asyncHandler = require('./async');

// // Protect routes - Authenticate both users and admins
// exports.protect = asyncHandler(async (req, res, next) => {
//   let token;

//   if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
//     token = req.headers.authorization.split(' ')[1];
//   } else if (req.cookies && req.cookies.token) {
//     token = req.cookies.token;
//   } else if (req.session && req.session.token) {
//     token = req.session.token;
//   }

//   if (!token) {
//     return next(new ErrorResponse('Not authorized to access this route', 401));
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     // ✅ works whether payload has id or _id
//     const userId = decoded.id || decoded._id;
//     const currentUser = await User.findById(userId);

//     if (!currentUser) {
//       return next(new ErrorResponse('The user belonging to this token no longer exists', 401));
//     }

//     req.user = currentUser;

//     if (req.session) {
//       req.session.user = {
//         id: currentUser._id,
//         firstName: currentUser.firstName,
//         lastName: currentUser.lastName,
//         email: currentUser.email,
//         role: currentUser.role
//       };
//       req.session.token = token;
//     }

//     next();
//   } catch (err) {
//     if (req.session) {
//       req.session.user = null;
//       req.session.token = null;
//     }
//     return next(new ErrorResponse('Not authorized to access this route', 401));
//   }
// });

// // Grant access to specific roles
// exports.authorize = (...roles) => {
//   return (req, res, next) => {
//     if (!req.user) {
//       return next(new ErrorResponse('Not authorized to access this route', 401));
//     }

//     if (!roles.includes(req.user.role)) {
//       return next(
//         new ErrorResponse(
//           `User role ${req.user.role} is not authorized to access this route`,
//           403
//         )
//       );
//     }
//     next();
//   };
// };

// // Middleware specifically for user access
// exports.userAuth = [
//   exports.protect,
//   exports.authorize('user', 'admin') // Users and admins can access user routes
// ];

// // Middleware specifically for admin access
// exports.adminAuth = [
//   exports.protect,
//   exports.authorize('admin') // Only admins can access admin routes
// ];

// // Optional: Middleware to check if user is authenticated (without throwing error)
// exports.optionalAuth = asyncHandler(async (req, res, next) => {
//   let token;

//   if (
//     req.headers.authorization &&
//     req.headers.authorization.startsWith('Bearer')
//   ) {
//     token = req.headers.authorization.split(' ')[1];
//   } else if (req.cookies && req.cookies.token) {
//     token = req.cookies.token;
//   } else if (req.session && req.session.token) {
//     token = req.session.token;
//   }

//   if (!token) {
//     // No token, but proceed without user data
//     return next();
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;

//     const currentUser = await User.findById(decoded.id);
//     if (currentUser) {
//       req.userDocument = currentUser;

//       if (req.session) {
//         req.session.user = {
//           id: currentUser._id,
//           firstName: currentUser.firstName,
//           lastName: currentUser.lastName,
//           email: currentUser.email,
//           role: currentUser.role
//         };
//         req.session.token = token;
//       }
//     }

//     next();
//   } catch (err) {
//     // Invalid token, but proceed without user data
//     next();
//   }
// });

// // Middleware to refresh session data on each request
// exports.refreshSession = asyncHandler(async (req, res, next) => {
//   if (req.session && req.session.user) {
//     try {
//       const currentUser = await User.findById(req.session.user.id);
//       if (currentUser) {
//         req.session.user = {
//           id: currentUser._id,
//           firstName: currentUser.firstName,
//           lastName: currentUser.lastName,
//           email: currentUser.email,
//           role: currentUser.role
//         };
//       }
//     } catch (err) {
//       // If user not found, clear session
//       req.session.user = null;
//       req.session.token = null;
//     }
//   }
//   next();
// });

const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("./async");
const authService = require("../services/authService");

// Cookie options
const cookieOptions = {
  httpOnly: true,
  secure: true,
  // process.env.NODE_ENV === "production",
  sameSite: "none",
  // process.env.NODE_ENV === "production" ? "none" : "lax",
  credentials: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const accessTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 15 * 60 * 1000,
};

const refreshTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
};

// Helper to set cookies
const setTokenCookies = (res, tokens) => {
  res.cookie("accessToken", tokens.accessToken, accessTokenCookieOptions);
  res.cookie("refreshToken", tokens.refreshToken, refreshTokenCookieOptions);
};

// Helper to clear cookies
const clearTokenCookies = (res) => {
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
};

// Protect routes - Verify access token from cookie or header
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check cookie first (primary method)
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }
  // Fallback to Authorization header (for mobile apps)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    // Verify token and check blacklist
    const verification = await authService.verifyAccessToken(token);

    if (!verification.valid) {
      // Clear invalid cookies
      clearTokenCookies(res);
      return next(
        new ErrorResponse("Not authorized to access this route", 401),
      );
    }

    // Get user from database
    const user = await User.findById(verification.decoded.userId)
      .select("-password -__v")
      .lean();

    if (!user) {
      clearTokenCookies(res);
      return next(new ErrorResponse("User not found", 401));
    }

    if (!user.isActive) {
      clearTokenCookies(res);
      return next(new ErrorResponse("Account deactivated", 403));
    }

    // Ensure both id and _id are available
    req.user = {
      ...user,
      id: user._id.toString(), // Explicitly add id
      _id: user._id, // Keep _id for mongoose
    };
    next();
  } catch (err) {
    clearTokenCookies(res);
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authorized", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `Role ${req.user.role} is not authorized to access this route`,
          403,
        ),
      );
    }
    next();
  };
};

// Refresh token endpoint handler
exports.refreshToken = asyncHandler(async (req, res, next) => {
  let refreshToken;

  // Get refresh token from cookie first
  if (req.cookies && req.cookies.refreshToken) {
    refreshToken = req.cookies.refreshToken;
  }
  // Fallback to request body
  else if (req.body.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  if (!refreshToken) {
    return next(new ErrorResponse("Refresh token required", 400));
  }

  try {
    const { userId } = await authService.refreshAccessToken(refreshToken);

    const user = await User.findById(userId).select("-password -__v");

    if (!user || !user.isActive) {
      return next(new ErrorResponse("User not found or inactive", 401));
    }

    // Generate new tokens
    const tokens = authService.generateTokens(user);

    // Set new cookies
    setTokenCookies(res, tokens);

    // Revoke old refresh token
    await authService.revokeRefreshToken(userId, refreshToken);

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      // Only return access token for mobile apps
      data: process.env.NODE_ENV === "production" ? {} : { tokens },
    });
  } catch (error) {
    // Clear invalid cookies
    clearTokenCookies(res);
    return next(new ErrorResponse("Invalid refresh token", 401));
  }
});

// Logout handler
exports.logout = asyncHandler(async (req, res, next) => {
  let token;
  let refreshToken;

  // Get tokens from cookies
  if (req.cookies) {
    token = req.cookies.accessToken;
    refreshToken = req.cookies.refreshToken;
  }

  // Also check headers for mobile apps
  if (!token && req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    await authService.blacklistToken(token);
  }

  if (refreshToken && req.user) {
    await authService.revokeRefreshToken(req.user._id.toString(), refreshToken);
  }

  // Clear cookies
  clearTokenCookies(res);

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

// Optional authentication
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  // Check cookie first
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }
  // Fallback to header
  else if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next();
  }

  try {
    const verification = await authService.verifyAccessToken(token);

    if (verification.valid) {
      const user = await User.findById(verification.decoded.userId)
        .select("-password -__v")
        .lean();

      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (err) {
    // Silently fail for optional auth
  }

  next();
});

// Helper functions
exports.setTokenCookies = setTokenCookies;
exports.clearTokenCookies = clearTokenCookies;

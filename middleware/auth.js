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
// exports.protect = asyncHandler(async (req, res, next) => {
//   let token;

//   // Check cookie first (primary method)
//   if (req.cookies && req.cookies.accessToken) {
//     token = req.cookies.accessToken;
//   }
//   // Fallback to Authorization header (for mobile apps)
//   else if (
//     req.headers.authorization &&
//     req.headers.authorization.startsWith("Bearer")
//   ) {
//     token = req.headers.authorization.split(" ")[1];
//   }

//   if (!token) {
//     return next(new ErrorResponse("Not authorized to access this route", 401));
//   }

//   try {
//     // Verify token and check blacklist
//     const verification = await authService.verifyAccessToken(token);

//     if (!verification.valid) {
//       // Clear invalid cookies
//       clearTokenCookies(res);
//       return next(
//         new ErrorResponse("Not authorized to access this route", 401),
//       );
//     }

//     // Get user from database
//     const user = await User.findById(verification.decoded.userId)
//       .select("-password -__v")
//       .lean();

//     if (!user) {
//       clearTokenCookies(res);
//       return next(new ErrorResponse("User not found", 401));
//     }

//     if (!user.isActive) {
//       clearTokenCookies(res);
//       return next(new ErrorResponse("Account deactivated", 403));
//     }

//     // Ensure both id and _id are available
//     req.user = {
//       ...user,
//       id: user._id.toString(), // Explicitly add id
//       _id: user._id, // Keep _id for mongoose
//     };
//     next();
//   } catch (err) {
//     clearTokenCookies(res);
//     return next(new ErrorResponse("Not authorized to access this route", 401));
//   }
// });

// AFTER
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } else if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    const verification = await authService.verifyAccessToken(token);

    if (!verification.valid) {
      // 🚫 Do NOT clear cookies here. The refresh token may still be valid.
      // The frontend interceptor will call /auth/refresh and retry.
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }

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

    req.user = {
      ...user,
      id: user._id.toString(),
      _id: user._id,
    };
    next();
  } catch (err) {
    // Same rule: don't clear cookies on token errors that could be recoverable
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

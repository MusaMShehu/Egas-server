const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const Order = require("../models/Order");
const Wallet = require("../models/wallet");
const Subscription = require("../models/SubscriptionPlan");
const ErrorResponse = require("../utils/errorResponse");
const asyncHandler = require("../middleware/async");
const sendEmail = require("../utils/email");
const cloudinary = require("../config/cloudinary");
const NotificationService = require("../services/notificationService");
const emailService = require("../services/emailService");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

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

    // 3️⃣ Handle profile picture upload to Cloudinary
    let profileImage = {
      public_id: null,
      url: null,
      secure_url:
        "https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/default-profile.jpg",
    };

    if (req.file) {
      try {
        // Upload to Cloudinary with user-specific folder
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: `egas/users/${email.replace(/[^a-zA-Z0-9]/g, "_")}/profile`,
          transformation: [
            { width: 400, height: 400, crop: "fill" },
            { quality: "auto:good" },
          ],
          public_id: `profile_${Date.now()}`,
          resource_type: "auto",
        });

        profileImage = {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          secure_url: uploadResult.secure_url,
        };

        // Delete temporary file if you're using disk storage first
        if (req.file.path && !req.file.path.includes("cloudinary")) {
          const fs = require("fs");
          fs.unlinkSync(req.file.path);
        }
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError);
        // Continue with default image if upload fails
      }
    }

    // 4️⃣ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse("Email already registered", 400));
    }

    // 5️⃣ Create user in MongoDB
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      dob: new Date(dob),
      gender,
      state,
      city,
      gpsCoordinates,
      profileImage, // Using the new Cloudinary structure
      role: "user",
    });

    // 🪙 6️⃣ Create wallet and link to user
    const wallet = await Wallet.create({
      userId: user._id,
      balance: 0,
      transactions: [],
      currency: "NGN",
    });

    // Add wallet reference to user
    user.wallet = wallet._id;
    await user.save();

    // After user registration
    await NotificationService.sendAccountCreated(user);

    // 7️⃣ Remove sensitive fields
    user.password = undefined;
    user.__v = undefined;

    // 8️⃣ Generate JWT token
    const token = signToken(user._id);

    // 📧 9️⃣ Send welcome email (non-blocking)
    // try {
    //   await emailService.sendAccountCreatedEmail({
    //     name: `${firstName} ${lastName}`,
    //     email: email,
    //   });
    // } catch (emailError) {
    //   console.error("Failed to send welcome email:", emailError);
    // }

    // 🔟 Respond to frontend
    res.status(201).json({
      success: true,
      token,
      message: "Registration successful",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        role: user.role,
        wallet: {
          _id: wallet._id,
          balance: wallet.balance,
          currency: wallet.currency,
        },
      },
    });
  } catch (err) {
    console.error("Error during registration:", err);

    // Handle specific MongoDB errors
    if (err.code === 11000) {
      return next(new ErrorResponse("Email already exists", 400));
    }

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((val) => val.message);
      return next(new ErrorResponse(messages.join(", "), 400));
    }

    return next(
      new ErrorResponse("Registration failed. Please try again.", 500)
    );
  }
});
// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    return next(new ErrorResponse("Please provide an email and password", 400));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse("Please provide a valid email address", 400));
  }

  // Check for user with case-insensitive email
  const user = await User.findOne({
    email: { $regex: new RegExp(`^${email}$`, "i") },
  }).select("+password +loginAttempts +lockUntil");

  if (!user) {
    // Simulate password comparison to prevent user enumeration timing attacks
    await bcrypt.compare(password, "$2a$10$fakeHashForTimingAttackPrevention");
    return next(new ErrorResponse("Invalid credentials", 401));
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
    res.set("Retry-After", retryAfter);
    return next(
      new ErrorResponse(
        "Account locked due to too many failed attempts. Please try again later.",
        423
      )
    );
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
        userAgent: req.get("User-Agent"),
        status: "failed",
        reason: "Account locked due to too many failed attempts",
      });

      return next(
        new ErrorResponse(
          "Account locked due to too many failed attempts. Please try again in 30 minutes.",
          423
        )
      );
    }

    await user.save({ validateBeforeSave: false });

    // Log failed login attempt
    await LoginHistory.create({
      userId: user._id,
      email: req.body.email,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
      status: "failed",
      reason: "Invalid password",
    });

    const attemptsLeft = 5 - user.loginAttempts;
    return next(
      new ErrorResponse(
        `Invalid credentials. ${attemptsLeft} attempt${
          attemptsLeft !== 1 ? "s" : ""
        } remaining.`,
        401
      )
    );
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
      role: user.role,
    },
  });
});

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get user profile
// @route   GET /api/v1/auth/me
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  try {
    const user = req.user; // 👈 already fetched by protect middleware

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
      profileImage: user.profileImage
        ? {
            // If profileImage is already an object (Cloudinary structure)
            ...(typeof user.profileImage === "object"
              ? user.profileImage
              : {
                  // If it's just a string URL (legacy format), convert to object
                  url: user.profileImage,
                  secure_url: user.profileImage.replace("http://", "https://"),
                  public_id: null,
                }),
          }
        : {
            // Default image - update with your actual Cloudinary default image URL
            url: `${req.protocol}://${req.get("host")}/uploads/default.jpg`,
            secure_url: `${req.protocol}://${req.get(
              "host"
            )}/uploads/default.jpg`.replace("http://", "https://"),
            public_id: null,
          },
      memberSince: user.createdAt.toISOString().split("T")[0],
      role: user.role,
    };

    res.status(200).json({
      success: true,
      user: profileData,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching profile",
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
      gpsCoordinates,
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
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating profile",
    });
  }
});

// @desc    Update notification preferences
// @route   PUT /api/v1/auth/profile/preferences
// @access  Private
exports.updatePreferences = asyncHandler(async (req, res) => {
  try {
    const {
      orderUpdates,
      deliveryNotifications,
      promotionalOffers,
      newsletter,
    } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        notificationPreferences: {
          orderUpdates,
          deliveryNotifications,
          promotionalOffers,
          newsletter,
        },
      },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data: updatedUser.notificationPreferences,
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating preferences",
    });
  }
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  // FIXED: Add safety check for req.user
  if (!req.user || !req.user.id) {
    return next(new ErrorResponse("User not authenticated", 401));
  }

  const user = await User.findById(req.user.id).select("+password");

  // Check current password using bcrypt directly
  const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);

  if (!isMatch) {
    return next(new ErrorResponse("Current password is incorrect", 401));
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
      role: user.role,
    },
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse('Email is required', 400));
  }

  // Find the user
  const user = await User.findOne({ email });
  if (!user) {
    return next(new ErrorResponse('There is no user with that email', 404));
  }

  // Generate reset token
  let resetToken;
  if (typeof user.getResetPasswordToken === 'function') {
    resetToken = user.getResetPasswordToken();
    // Update user fields safely
    await User.updateOne(
      { _id: user._id },
      {
        resetPasswordToken: user.resetPasswordToken,
        resetPasswordExpire: user.resetPasswordExpire
      }
    );
  } else {
    resetToken = crypto.randomBytes(20).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expire = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Update only reset token fields to avoid geo validation issues
    await User.updateOne(
      { _id: user._id },
      {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: expire
      }
    );
  }

  // Create reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    // Send email
    await emailService.sendPasswordResetEmail({
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      resetUrl,
      expiryTime: '10 minutes',
    });

    res.status(200).json({ success: true, data: 'Email sent' });
  } catch (err) {
    console.error('Email sending failed:', err);

    // Remove reset token if email fails
    await User.updateOne(
      { _id: user._id },
      {
        $unset: { resetPasswordToken: '', resetPasswordExpire: '' }
      }
    );

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resettoken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse("Invalid token", 400));
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Send password reset success email
  setTimeout(async () => {
    try {
      await emailService.sendPasswordResetSuccessEmail({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        resetDate: new Date().toLocaleDateString(),
        resetTime: new Date().toLocaleTimeString(),
      });
    } catch (emailError) {
      console.error("Failed to send password reset success email:", emailError);
    }
  }, 0);

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
      role: user.role,
    },
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
// exports.forgotPassword = asyncHandler(async (req, res, next) => {
//   const user = await User.findOne({ email: req.body.email });

//   if (!user) {
//     // For security, don't reveal that email doesn't exist
//     return res.status(200).json({
//       success: true,
//       message:
//         "If an account exists with this email, you will receive password reset instructions.",
//     });
//   }

//   // Get reset token
//   let resetToken;
//   if (typeof user.getResetPasswordToken === "function") {
//     resetToken = user.getResetPasswordToken();
//   } else {
//     // Fallback: generate random token
//     resetToken = crypto.randomBytes(20).toString("hex");
//     user.resetPasswordToken = crypto
//       .createHash("sha256")
//       .update(resetToken)
//       .digest("hex");
//     user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
//   }

//   await user.save({ validateBeforeSave: false });

//   // Create reset URL
//   const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

//   try {
//     // Use your email service for password reset
//     await emailService.sendPasswordResetEmail({
//       name: `${user.firstName} ${user.lastName}`,
//       email: user.email,
//       resetUrl: resetUrl,
//       expiryTime: "10 minutes",
//     });

//     res.status(200).json({
//       success: true,
//       message: "Password reset email sent successfully",
//     });
//   } catch (err) {
//     console.log("Email sending error:", err);
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpire = undefined;

//     await user.save({ validateBeforeSave: false });

//     return next(new ErrorResponse("Email could not be sent", 500));
//   }
// });

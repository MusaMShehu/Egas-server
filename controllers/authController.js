// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");
// const crypto = require("crypto");
// const User = require("../models/User");
// const Order = require("../models/Order");
// const Wallet = require("../models/Wallet");
// const Subscription = require("../models/SubscriptionPlan");
// const ErrorResponse = require("../utils/errorResponse");
// const asyncHandler = require("../middleware/async");
// const sendEmail = require("../utils/email");
// const cloudinary = require("../config/cloudinary");
// const NotificationService = require("../services/notificationService");
// const emailService = require("../services/emailService");

// const signToken = (id) => {
//   return jwt.sign({ id }, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRES_IN,
//   });
// };

// exports.register = asyncHandler(async (req, res, next) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       email,
//       password,
//       confirmPassword,
//       phone,
//       address,
//       dob,
//       gender,
//       state,
//       city,
//       gps,
//     } = req.body;

//     // 1️⃣ Validate passwords
//     if (password !== confirmPassword) {
//       return next(new ErrorResponse("Passwords do not match", 400));
//     }

//     // 2️⃣ Parse GPS coordinates (GeoJSON Point)
//     let gpsCoordinates = null;
//     if (gps) {
//       try {
//         const parsed = JSON.parse(gps);
//         if (
//           parsed.type === "Point" &&
//           Array.isArray(parsed.coordinates) &&
//           parsed.coordinates.length === 2 &&
//           parsed.coordinates.every((n) => typeof n === "number")
//         ) {
//           gpsCoordinates = parsed;
//         } else {
//           return next(
//             new ErrorResponse(
//               "Invalid GPS format. Expected GeoJSON { type: 'Point', coordinates: [lng, lat] }",
//               400
//             )
//           );
//         }
//       } catch (err) {
//         return next(new ErrorResponse("GPS must be valid JSON string", 400));
//       }
//     } else {
//       return next(new ErrorResponse("GPS coordinates are required", 400));
//     }

//     // 3️⃣ Handle profile picture upload to Cloudinary
//     let profileImage = {
//       public_id: null,
//       url: null,
//       secure_url:
//         "https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/default-profile.jpg",
//     };

//     if (req.file) {
//       try {
//         // Upload to Cloudinary with user-specific folder
//         const uploadResult = await cloudinary.uploader.upload(req.file.path, {
//           folder: `egas/users/${email.replace(/[^a-zA-Z0-9]/g, "_")}/profile`,
//           transformation: [
//             { width: 400, height: 400, crop: "fill" },
//             { quality: "auto:good" },
//           ],
//           public_id: `profile_${Date.now()}`,
//           resource_type: "auto",
//         });

//         profileImage = {
//           public_id: uploadResult.public_id,
//           url: uploadResult.secure_url,
//           secure_url: uploadResult.secure_url,
//         };

//         // Delete temporary file if you're using disk storage first
//         if (req.file.path && !req.file.path.includes("cloudinary")) {
//           const fs = require("fs");
//           fs.unlinkSync(req.file.path);
//         }
//       } catch (uploadError) {
//         console.error("Cloudinary upload failed:", uploadError);
//         // Continue with default image if upload fails
//       }
//     }

//     // 4️⃣ Check if user already exists
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return next(new ErrorResponse("Email already registered", 400));
//     }

//     // 5️⃣ Create user in MongoDB
//     const user = await User.create({
//       firstName,
//       lastName,
//       email,
//       password,
//       phone,
//       address,
//       dob: new Date(dob),
//       gender,
//       state,
//       city,
//       gpsCoordinates,
//       profileImage, // Using the new Cloudinary structure
//       role: "user",
//     });

//     // 🪙 6️⃣ Create wallet and link to user
//     const wallet = await Wallet.create({
//       userId: user._id,
//       balance: 0,
//       transactions: [],
//       currency: "NGN",
//     });

//     // Add wallet reference to user
//     user.wallet = wallet._id;
//     await user.save();

//     // After user registration
//     await NotificationService.sendAccountCreated(user);

//     // 7️⃣ Remove sensitive fields
//     user.password = undefined;
//     user.__v = undefined;

//     // 8️⃣ Generate JWT token
//     const token = signToken(user._id);

//     // 📧 9️⃣ Send welcome email (non-blocking)
//     // try {
//     //   await emailService.sendAccountCreatedEmail({
//     //     name: `${firstName} ${lastName}`,
//     //     email: email,
//     //   });
//     // } catch (emailError) {
//     //   console.error("Failed to send welcome email:", emailError);
//     // }

//     // 🔟 Respond to frontend
//     res.status(201).json({
//       success: true,
//       token,
//       message: "Registration successful",
//       user: {
//         _id: user._id,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         email: user.email,
//         phone: user.phone,
//         profileImage: user.profileImage,
//         role: user.role,
//         wallet: {
//           _id: wallet._id,
//           balance: wallet.balance,
//           currency: wallet.currency,
//         },
//       },
//     });
//   } catch (err) {
//     console.error("Error during registration:", err);

//     // Handle specific MongoDB errors
//     if (err.code === 11000) {
//       return next(new ErrorResponse("Email already exists", 400));
//     }

//     if (err.name === "ValidationError") {
//       const messages = Object.values(err.errors).map((val) => val.message);
//       return next(new ErrorResponse(messages.join(", "), 400));
//     }

//     return next(
//       new ErrorResponse("Registration failed. Please try again.", 500)
//     );
//   }
// });
// // @desc    Login user
// // @route   POST /api/v1/auth/login
// // @access  Public
// exports.login = asyncHandler(async (req, res, next) => {
//   const { email, password } = req.body;

//   // Validate email & password
//   if (!email || !password) {
//     return next(new ErrorResponse("Please provide an email and password", 400));
//   }

//   // Validate email format
//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     return next(new ErrorResponse("Please provide a valid email address", 400));
//   }

//   // Check for user with case-insensitive email
//   const user = await User.findOne({
//     email: { $regex: new RegExp(`^${email}$`, "i") },
//   }).select("+password +loginAttempts +lockUntil");

//   if (!user) {
//     // Simulate password comparison to prevent user enumeration timing attacks
//     await bcrypt.compare(password, "$2a$10$fakeHashForTimingAttackPrevention");
//     return next(new ErrorResponse("Invalid credentials", 401));
//   }

//   // Check if account is locked
//   if (user.lockUntil && user.lockUntil > Date.now()) {
//     const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
//     res.set("Retry-After", retryAfter);
//     return next(
//       new ErrorResponse(
//         "Account locked due to too many failed attempts. Please try again later.",
//         423
//       )
//     );
//   }

//   // Check if password matches - FIXED: Use bcrypt directly since matchPassword might not exist
//   const isMatch = await bcrypt.compare(password, user.password);

//   if (!isMatch) {
//     // Increment failed login attempts
//     user.loginAttempts += 1;

//     // Lock account after 5 failed attempts for 30 minutes
//     if (user.loginAttempts >= 5) {
//       user.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
//       user.loginAttempts = 0;

//       await user.save({ validateBeforeSave: false });

//       // Log failed login attempt
//       await LoginHistory.create({
//         userId: user._id,
//         email: req.body.email,
//         ipAddress: req.ip,
//         userAgent: req.get("User-Agent"),
//         status: "failed",
//         reason: "Account locked due to too many failed attempts",
//       });

//       return next(
//         new ErrorResponse(
//           "Account locked due to too many failed attempts. Please try again in 30 minutes.",
//           423
//         )
//       );
//     }

//     await user.save({ validateBeforeSave: false });

//     // Log failed login attempt
//     await LoginHistory.create({
//       userId: user._id,
//       email: req.body.email,
//       ipAddress: req.ip,
//       userAgent: req.get("User-Agent"),
//       status: "failed",
//       reason: "Invalid password",
//     });

//     const attemptsLeft = 5 - user.loginAttempts;
//     return next(
//       new ErrorResponse(
//         `Invalid credentials. ${attemptsLeft} attempt${
//           attemptsLeft !== 1 ? "s" : ""
//         } remaining.`,
//         401
//       )
//     );
//   }

//   // Reset login attempts on successful login
//   if (user.loginAttempts > 0 || user.lockUntil) {
//     user.loginAttempts = 0;
//     user.lockUntil = undefined;
//     await user.save({ validateBeforeSave: false });
//   }

//   // Log successful login
//   // await LoginHistory.create({
//   //   userId: user._id,
//   //   email: req.body.email,
//   //   ipAddress: req.ip,
//   //   userAgent: req.get('User-Agent'),
//   //   status: 'success'
//   // });

//   // FIXED: Use signToken instead of sendTokenResponse which expects getSignedJwtToken
//   const token = signToken(user._id);

//   // Remove password from output
//   user.password = undefined;

//   res.status(200).json({
//     success: true,
//     token,
//     user: {
//       id: user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       phone: user.phone || "",
//       dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
//       gender: user.gender || "",
//       address: user.address || "",
//       city: user.city || "",
//       state: user.state || "",
//       gpsCoordinates: user.gpsCoordinates || "",
//       profilePic: user.profilePic
//         ? `${req.protocol}://${req.get("host")}/uploads/${user.profilePic}`
//         : `${req.protocol}://${req.get("host")}/uploads/default.jpg`,
//       memberSince: user.createdAt.toISOString().split("T")[0],
//       role: user.role,
//     },
//   });
// });

// // @desc    Log user out / clear cookie
// // @route   GET /api/v1/auth/logout
// // @access  Private
// exports.logout = asyncHandler(async (req, res, next) => {
//   res.cookie("token", "none", {
//     expires: new Date(Date.now() + 10 * 1000),
//     httpOnly: true,
//   });

//   res.status(200).json({
//     success: true,
//     data: {},
//   });
// });

// // @desc    Get user profile
// // @route   GET /api/v1/auth/me
// // @access  Private
// exports.getProfile = asyncHandler(async (req, res) => {
//   try {
//     const user = req.user; // 👈 already fetched by protect middleware

//     const profileData = {
//       id: user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       phone: user.phone || "",
//       dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
//       gender: user.gender || "",
//       address: user.address || "",
//       city: user.city || "",
//       state: user.state || "",
//       gpsCoordinates: user.gpsCoordinates || "",
//       profileImage: user.profileImage
//         ? {
//             // If profileImage is already an object (Cloudinary structure)
//             ...(typeof user.profileImage === "object"
//               ? user.profileImage
//               : {
//                   // If it's just a string URL (legacy format), convert to object
//                   url: user.profileImage,
//                   secure_url: user.profileImage.replace("http://", "https://"),
//                   public_id: null,
//                 }),
//           }
//         : {
//             // Default image - update with your actual Cloudinary default image URL
//             url: `${req.protocol}://${req.get("host")}/uploads/default.jpg`,
//             secure_url: `${req.protocol}://${req.get(
//               "host"
//             )}/uploads/default.jpg`.replace("http://", "https://"),
//             public_id: null,
//           },
//       memberSince: user.createdAt.toISOString().split("T")[0],
//       role: user.role,
//     };

//     res.status(200).json({
//       success: true,
//       user: profileData,
//     });
//   } catch (error) {
//     console.error("Error fetching profile:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while fetching profile",
//     });
//   }
// });




// // @desc    Update password
// // @route   PUT /api/v1/auth/updatepassword
// // @access  Private
// exports.updatePassword = asyncHandler(async (req, res, next) => {
//   // FIXED: Add safety check for req.user
//   if (!req.user || !req.user.id) {
//     return next(new ErrorResponse("User not authenticated", 401));
//   }

//   const user = await User.findById(req.user.id).select("+password");

//   // Check current password using bcrypt directly
//   const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);

//   if (!isMatch) {
//     return next(new ErrorResponse("Current password is incorrect", 401));
//   }

//   user.password = req.body.newPassword;
//   await user.save();

//   // Generate new token
//   const token = signToken(user._id);
//   user.password = undefined;

//   res.status(200).json({
//     success: true,
//     token,
//     user: {
//       id: user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       role: user.role,
//     },
//   });
// });

// // @desc    Forgot password
// // @route   POST /api/v1/auth/forgotpassword
// // @access  Public
// exports.forgotPassword = asyncHandler(async (req, res, next) => {
//   const { email } = req.body;

//   if (!email) {
//     return next(new ErrorResponse('Email is required', 400));
//   }

//   // Find the user
//   const user = await User.findOne({ email });
//   if (!user) {
//     return next(new ErrorResponse('There is no user with that email', 404));
//   }

//   // Generate reset token
//   let resetToken;
//   if (typeof user.getResetPasswordToken === 'function') {
//     resetToken = user.getResetPasswordToken();
//     // Update user fields safely
//     await User.updateOne(
//       { _id: user._id },
//       {
//         resetPasswordToken: user.resetPasswordToken,
//         resetPasswordExpire: user.resetPasswordExpire
//       }
//     );
//   } else {
//     resetToken = crypto.randomBytes(20).toString('hex');
//     const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
//     const expire = Date.now() + 10 * 60 * 1000; // 10 minutes

//     // Update only reset token fields to avoid geo validation issues
//     await User.updateOne(
//       { _id: user._id },
//       {
//         resetPasswordToken: hashedToken,
//         resetPasswordExpire: expire
//       }
//     );
//   }

//   // Create reset URL
//   const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

//   try {
//     // Send email
//     await emailService.sendPasswordResetEmail({
//       name: `${user.firstName} ${user.lastName}`,
//       email: user.email,
//       resetUrl,
//       expiryTime: '10 minutes',
//     });

//     res.status(200).json({ success: true, data: 'Email sent' });
//   } catch (err) {
//     console.error('Email sending failed:', err);

//     // Remove reset token if email fails
//     await User.updateOne(
//       { _id: user._id },
//       {
//         $unset: { resetPasswordToken: '', resetPasswordExpire: '' }
//       }
//     );

//     return next(new ErrorResponse('Email could not be sent', 500));
//   }
// });

// // @desc    Reset password
// // @route   PUT /api/v1/auth/resetpassword/:resettoken
// // @access  Public
// exports.resetPassword = asyncHandler(async (req, res, next) => {
//   // Get hashed token
//   const resetPasswordToken = crypto
//     .createHash("sha256")
//     .update(req.params.resettoken)
//     .digest("hex");

//   const user = await User.findOne({
//     resetPasswordToken,
//     resetPasswordExpire: { $gt: Date.now() },
//   });

//   if (!user) {
//     return next(new ErrorResponse("Invalid token", 400));
//   }

//   // Set new password
//   user.password = req.body.password;
//   user.resetPasswordToken = undefined;
//   user.resetPasswordExpire = undefined;
//   await user.save();

//   // Send password reset success email
//   setTimeout(async () => {
//     try {
//       await emailService.sendPasswordResetSuccessEmail({
//         name: `${user.firstName} ${user.lastName}`,
//         email: user.email,
//         resetDate: new Date().toLocaleDateString(),
//         resetTime: new Date().toLocaleTimeString(),
//       });
//     } catch (emailError) {
//       console.error("Failed to send password reset success email:", emailError);
//     }
//   }, 0);

//   // Generate new token
//   const token = signToken(user._id);
//   user.password = undefined;

//   res.status(200).json({
//     success: true,
//     token,
//     user: {
//       id: user._id,
//       firstName: user.firstName,
//       lastName: user.lastName,
//       email: user.email,
//       role: user.role,
//     },
//   });
// });















// const jwt = require('jsonwebtoken');
// const bcrypt = require('bcryptjs');
// const crypto = require('crypto');
// const User = require('../models/User');
// const { Wallet, Transaction } = require('../models/Wallet');
// const ErrorResponse = require('../utils/errorResponse');
// const asyncHandler = require('../middleware/async');
// const emailService = require('../services/emailService');
// const notificationService = require('../services/notificationService');
// const authService = require('../services/authService');
// const { redisClient } = require('../config/redis');
// const cloudinary = require('../config/cloudinary');

// // @desc    Register user
// // @route   POST /api/v1/auth/register
// // @access  Public
// exports.register = asyncHandler(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const {
//       firstName,
//       lastName,
//       email,
//       password,
//       phone,
//       address,
//       city,
//       state,
//       dob,
//       gender,
//       gps,
//     } = req.body;

//     // Check if user already exists
//     const existingUser = await User.findOne({ email }).session(session);
//     if (existingUser) {
//       await session.abortTransaction();
//       session.endSession();
//       return next(new ErrorResponse('Email already registered', 400));
//     }

//     // Parse GPS coordinates if provided
//     let gpsCoordinates = null;
//     if (gps) {
//       try {
//         const parsed = JSON.parse(gps);
//         if (
//           parsed.type === 'Point' &&
//           Array.isArray(parsed.coordinates) &&
//           parsed.coordinates.length === 2
//         ) {
//           gpsCoordinates = parsed;
//         }
//       } catch (err) {
//         // Invalid GPS, ignore
//       }
//     }

//     // Handle profile image upload
//     let profileImage = {
//       public_id: null,
//       url: null,
//       secure_url: null,
//     };

//     if (req.file) {
//       try {
//         const uploadResult = await cloudinary.uploader.upload(req.file.path, {
//           folder: `egas/users/${email.replace(/[^a-zA-Z0-9]/g, '_')}/profile`,
//           transformation: [{ width: 400, height: 400, crop: 'fill' }],
//           quality: 'auto:good',
//         });

//         profileImage = {
//           public_id: uploadResult.public_id,
//           url: uploadResult.secure_url,
//           secure_url: uploadResult.secure_url,
//         };
//       } catch (uploadError) {
//         console.error('Cloudinary upload failed:', uploadError);
//       }
//     }

//     // Create user
//     const user = await User.create([{
//       firstName,
//       lastName,
//       email: email.toLowerCase(),
//       password,
//       phone,
//       address,
//       city,
//       state,
//       dob: dob ? new Date(dob) : undefined,
//       gender,
//       gpsCoordinates,
//       profileImage,
//       role: 'user',
//       isActive: true,
//       emailVerified: false,
//       phoneVerified: false,
//     }], { session });

//     const newUser = user[0];

//     // Create wallet
//     await Wallet.create([{
//       userId: newUser._id,
//       balance: 0,
//     }], { session });

//     await session.commitTransaction();
//     session.endSession();

//     // Generate tokens
//     const tokens = authService.generateTokens(newUser);

//     // Set HTTP-only cookies
//     setTokenCookies(res, tokens);

//     // Send welcome email (async)
//     emailService.sendAccountCreatedEmail(newUser).catch(console.error);

//     // Send SMS notification (async)
//     notificationService.sendAccountCreated(newUser).catch(console.error);

//     // Generate email verification token
//     const verificationToken = authService.generateSecureToken();
//     const hashedToken = authService.hashToken(verificationToken);
    
//     // Store in Redis with 24h expiry
//     await redisClient.set(
//       `email_verify:${newUser._id}`,
//       hashedToken,
//       24 * 60 * 60
//     );

//     // Send verification email (async)
//     emailService.sendEmailVerification(newUser, verificationToken).catch(console.error);

//     res.status(201).json({
//       success: true,
//       message: 'Registration successful. Please verify your email.',
//       data: {
//         user: {
//           id: newUser._id,
//           firstName: newUser.firstName,
//           lastName: newUser.lastName,
//           email: newUser.email,
//           phone: newUser.phone,
//           profileImage: newUser.profileImage,
//           role: newUser.role,
//           emailVerified: newUser.emailVerified,
//           phoneVerified: newUser.phoneVerified,
//         },
//         // Only return tokens in development for debugging
//         ...(process.env.NODE_ENV === 'development' && { tokens }),
//       },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
    
//     if (err.code === 11000) {
//       return next(new ErrorResponse('Email already exists', 400));
//     }
    
//     if (err.name === 'ValidationError') {
//       const messages = Object.values(err.errors).map(val => val.message);
//       return next(new ErrorResponse(messages.join(', '), 400));
//     }

//     return next(new ErrorResponse('Registration failed', 500));
//   }
// });

// // @desc    Login user
// // @route   POST /api/v1/auth/login
// // @access  Public
// exports.login = asyncHandler(async (req, res, next) => {
//   const { email, password } = req.body;

//   // Find user with password field
//   const user = await User.findOne({ 
//     email: email.toLowerCase() 
//   }).select('+password +loginAttempts +lockUntil');

//   if (!user) {
//     // Prevent timing attacks
//     await bcrypt.compare(password, '$2a$10$fakeHashForTimingAttackPrevention');
//     return next(new ErrorResponse('Invalid credentials', 401));
//   }

//   // Check if account is locked
//   if (user.lockUntil && user.lockUntil > Date.now()) {
//     const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
//     res.set('Retry-After', retryAfter);
//     return next(
//       new ErrorResponse(
//         'Account locked due to too many failed attempts. Please try again later.',
//         423
//       )
//     );
//   }

//   // Check password
//   const isMatch = await user.matchPassword(password);

//   if (!isMatch) {
//     // Increment failed attempts
//     user.loginAttempts += 1;

//     if (user.loginAttempts >= 5) {
//       user.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
//       user.loginAttempts = 0;
//     }

//     await user.save({ validateBeforeSave: false });

//     const attemptsLeft = 5 - user.loginAttempts;
//     return next(
//       new ErrorResponse(
//         `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
//         401
//       )
//     );
//   }

//   // Reset login attempts on success
//   if (user.loginAttempts > 0 || user.lockUntil) {
//     user.loginAttempts = 0;
//     user.lockUntil = undefined;
//     await user.save({ validateBeforeSave: false });
//   }

//   // Update last login
//   user.lastLogin = new Date();
//   user.lastLoginIP = req.ip;
//   await user.save({ validateBeforeSave: false });

//   // Generate tokens
//   const tokens = authService.generateTokens(user);

//   // Set HTTP-only cookies
//   setTokenCookies(res, tokens);

//   // Remove sensitive data
//   user.password = undefined;
//   user.loginAttempts = undefined;
//   user.lockUntil = undefined;

//   res.status(200).json({
//     success: true,
//     data: {
//       user: {
//         id: user._id,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         email: user.email,
//         phone: user.phone,
//         profileImage: user.profileImage,
//         role: user.role,
//         emailVerified: user.emailVerified,
//         phoneVerified: user.phoneVerified,
//       },
//       // Only return tokens in development
//       ...(process.env.NODE_ENV === 'development' && { tokens }),
//     },
//   });
// });


// // @desc    Refresh access token
// // @route   POST /api/v1/auth/refresh
// // @access  Public
// exports.refreshToken = asyncHandler(async (req, res, next) => {
//   let refreshToken;

//   // Get refresh token from cookie first
//   if (req.cookies && req.cookies.refreshToken) {
//     refreshToken = req.cookies.refreshToken;
//   }
//   // Fallback to request body
//   else if (req.body.refreshToken) {
//     refreshToken = req.body.refreshToken;
//   }

//   if (!refreshToken) {
//     return next(new ErrorResponse('Refresh token required', 400));
//   }

//   try {
//     const { userId } = await authService.refreshAccessToken(refreshToken);
    
//     const user = await User.findById(userId).select('-password -__v');
    
//     if (!user || !user.isActive) {
//       return next(new ErrorResponse('User not found or inactive', 401));
//     }

//     // Generate new tokens
//     const tokens = authService.generateTokens(user);

//     // Set new cookies
//     setTokenCookies(res, tokens);

//     // Revoke old refresh token
//     await authService.revokeRefreshToken(userId, refreshToken);

//     res.status(200).json({
//       success: true,
//       message: 'Token refreshed successfully',
//     });
//   } catch (error) {
//     // Clear invalid cookies
//     clearTokenCookies(res);
//     return next(new ErrorResponse('Invalid refresh token', 401));
//   }
// });

// // @desc    Logout user
// // @route   POST /api/v1/auth/logout
// // @access  Private
// exports.logout = asyncHandler(async (req, res, next) => {
//   let token;
//   let refreshToken;

//   // Get tokens from cookies
//   if (req.cookies) {
//     token = req.cookies.accessToken;
//     refreshToken = req.cookies.refreshToken;
//   }

//   // Also check headers for mobile apps
//   if (!token && req.headers.authorization?.startsWith('Bearer')) {
//     token = req.headers.authorization.split(' ')[1];
//   }

//   if (token) {
//     await authService.blacklistToken(token);
//   }

//   if (refreshToken && req.user) {
//     await authService.revokeRefreshToken(req.user._id.toString(), refreshToken);
//   }

//   // Clear cookies
//   clearTokenCookies(res);

//   res.status(200).json({
//     success: true,
//     message: 'Logged out successfully',
//   });
// });

// // @desc    Verify email
// // @route   GET /api/v1/auth/verify-email/:token
// // @access  Public
// exports.verifyEmail = asyncHandler(async (req, res, next) => {
//   const { token } = req.params;
//   const { userId } = req.query;

//   if (!token || !userId) {
//     return next(new ErrorResponse('Invalid verification link', 400));
//   }

//   // Get stored token from Redis
//   const storedHash = await redisClient.get(`email_verify:${userId}`);

//   if (!storedHash) {
//     return next(new ErrorResponse('Verification link expired', 400));
//   }

//   // Hash the provided token and compare
//   const hashedToken = authService.hashToken(token);

//   if (hashedToken !== storedHash) {
//     return next(new ErrorResponse('Invalid verification token', 400));
//   }

//   // Update user
//   await User.findByIdAndUpdate(userId, {
//     emailVerified: true,
//   });

//   // Delete used token
//   await redisClient.del(`email_verify:${userId}`);

//   res.status(200).json({
//     success: true,
//     message: 'Email verified successfully',
//   });
// });

// // @desc    Request email verification
// // @route   POST /api/v1/auth/verify-email-request
// // @access  Private
// exports.requestEmailVerification = asyncHandler(async (req, res, next) => {
//   if (req.user.emailVerified) {
//     return next(new ErrorResponse('Email already verified', 400));
//   }

//   // Check if already requested recently
//   const existing = await redisClient.get(`email_verify:${req.user._id}`);
//   if (existing) {
//     return next(new ErrorResponse('Verification email already sent. Please check your inbox.', 400));
//   }

//   const verificationToken = authService.generateSecureToken();
//   const hashedToken = authService.hashToken(verificationToken);
  
//   await redisClient.set(
//     `email_verify:${req.user._id}`,
//     hashedToken,
//     24 * 60 * 60
//   );

//   await emailService.sendEmailVerification(req.user, verificationToken);

//   res.status(200).json({
//     success: true,
//     message: 'Verification email sent',
//   });
// });

// // @desc    Get current user profile
// // @route   GET /api/v1/auth/me
// // @access  Private
// exports.getProfile = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.user._id)
//     .select('-__v')
//     .populate('wallet', 'balance');

//   res.status(200).json({
//     success: true,
//     data: user,
//   });
// });

// // @desc    Update password
// // @route   PUT /api/v1/auth/update-password
// // @access  Private
// exports.updatePassword = asyncHandler(async (req, res, next) => {
//   const { currentPassword, newPassword } = req.body;

//   const user = await User.findById(req.user._id).select('+password');

//   // Check current password
//   const isMatch = await user.matchPassword(currentPassword);

//   if (!isMatch) {
//     return next(new ErrorResponse('Current password is incorrect', 401));
//   }

//   // Update password
//   user.password = newPassword;
//   await user.save();

//   // Generate new tokens
//   const tokens = authService.generateTokens(user);

//   // Revoke all other refresh tokens
//   await authService.revokeAllUserTokens(user._id.toString());

//   res.status(200).json({
//     success: true,
//     message: 'Password updated successfully',
//     data: tokens,
//   });
// });

// // @desc    Forgot password
// // @route   POST /api/v1/auth/forgot-password
// // @access  Public
// exports.forgotPassword = asyncHandler(async (req, res, next) => {
//   const { email } = req.body;

//   const user = await User.findOne({ email: email.toLowerCase() });

//   if (!user) {
//     // Don't reveal user existence
//     return res.status(200).json({
//       success: true,
//       message: 'If an account exists, a password reset email will be sent.',
//     });
//   }

//   // Generate reset token
//   const resetToken = authService.generateSecureToken();
//   const hashedToken = authService.hashToken(resetToken);

//   // Store in Redis with 10 min expiry
//   await redisClient.set(
//     `password_reset:${user._id}`,
//     hashedToken,
//     10 * 60
//   );

//   // Send email
//   await emailService.sendPasswordResetEmail(user, resetToken);

//   res.status(200).json({
//     success: true,
//     message: 'If an account exists, a password reset email will be sent.',
//   });
// });

// // @desc    Reset password
// // @route   POST /api/v1/auth/reset-password
// // @access  Public
// exports.resetPassword = asyncHandler(async (req, res, next) => {
//   const { token, userId, newPassword } = req.body;

//   if (!token || !userId || !newPassword) {
//     return next(new ErrorResponse('Invalid request', 400));
//   }

//   // Get stored token from Redis
//   const storedHash = await redisClient.get(`password_reset:${userId}`);

//   if (!storedHash) {
//     return next(new ErrorResponse('Password reset link expired', 400));
//   }

//   // Hash the provided token and compare
//   const hashedToken = authService.hashToken(token);

//   if (hashedToken !== storedHash) {
//     return next(new ErrorResponse('Invalid reset token', 400));
//   }

//   // Update password
//   const user = await User.findById(userId);
//   user.password = newPassword;
//   await user.save();

//   // Delete used token
//   await redisClient.del(`password_reset:${userId}`);

//   // Revoke all refresh tokens
//   await authService.revokeAllUserTokens(userId);

//   // Send success email
//   await emailService.sendPasswordResetSuccessEmail(user).catch(console.error);

//   res.status(200).json({
//     success: true,
//     message: 'Password reset successful',
//   });
// });


// // // @desc    Update notification preferences
// // // @route   PUT /api/v1/auth/profile/preferences
// // // @access  Private
// exports.updatePreferences = asyncHandler(async (req, res) => {
//   try {
//     const {
//       orderUpdates,
//       deliveryNotifications,
//       promotionalOffers,
//       newsletter,
//     } = req.body;

//     const updatedUser = await User.findByIdAndUpdate(
//       req.user.id,
//       {
//         notificationPreferences: {
//           orderUpdates,
//           deliveryNotifications,
//           promotionalOffers,
//           newsletter,
//         },
//       },
//       { new: true }
//     ).select("-password");

//     res.status(200).json({
//       success: true,
//       message: "Preferences updated successfully",
//       data: updatedUser.notificationPreferences,
//     });
//   } catch (error) {
//     console.error("Error updating preferences:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while updating preferences",
//     });
//   }
// });



// // @desc    Update user profile
// // @route   PUT /api/v1/auth/profile
// // @access  Private
// exports.updateProfile = asyncHandler(async (req, res, next) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       phone,
//       dob,
//       gender,
//       address,
//       city,
//       state,
//       gpsCoordinates,
//     } = req.body;

//     // Validate required fields (optional - based on your requirements)
//     if (!firstName || !lastName || !phone) {
//       return next(new ErrorResponse('First name, last name, and phone are required', 400));
//     }

//     // Validate phone number format
//     const phoneRegex = /^\+?[0-9]{10,15}$/;
//     if (phone && !phoneRegex.test(phone)) {
//       return next(new ErrorResponse('Please provide a valid phone number', 400));
//     }

//     // Validate gender if provided
//     if (gender && !['male', 'female', 'other'].includes(gender)) {
//       return next(new ErrorResponse('Invalid gender value', 400));
//     }

//     // Validate GPS coordinates if provided
//     if (gpsCoordinates) {
//       try {
//         const parsed = typeof gpsCoordinates === 'string' 
//           ? JSON.parse(gpsCoordinates) 
//           : gpsCoordinates;
        
//         if (
//           parsed.type !== 'Point' ||
//           !Array.isArray(parsed.coordinates) ||
//           parsed.coordinates.length !== 2 ||
//           !parsed.coordinates.every(coord => typeof coord === 'number')
//         ) {
//           return next(new ErrorResponse('Invalid GPS coordinates format', 400));
//         }
//       } catch (err) {
//         return next(new ErrorResponse('Invalid GPS coordinates format', 400));
//       }
//     }

//     // Check if phone number is already taken by another user
//     if (phone) {
//       const existingUser = await User.findOne({ 
//         phone, 
//         _id: { $ne: req.user.id } 
//       });
//       if (existingUser) {
//         return next(new ErrorResponse('Phone number already in use', 400));
//       }
//     }

//     // Prepare update object
//     const updateData = {
//       firstName: firstName?.trim(),
//       lastName: lastName?.trim(),
//       phone,
//       address: address?.trim(),
//       city: city?.trim(),
//       state: state?.trim(),
//       updatedAt: new Date(),
//     };

//     // Add optional fields only if provided
//     if (dob) updateData.dob = new Date(dob);
//     if (gender) updateData.gender = gender;
//     if (gpsCoordinates) {
//       updateData.gpsCoordinates = typeof gpsCoordinates === 'string' 
//         ? JSON.parse(gpsCoordinates) 
//         : gpsCoordinates;
//     }

//     // Perform update with session for data consistency
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const updatedUser = await User.findByIdAndUpdate(
//         req.user.id,
//         updateData,
//         { 
//           new: true, 
//           runValidators: true,
//           session 
//         }
//       ).select('-password -__v -loginAttempts -lockUntil');

//       if (!updatedUser) {
//         await session.abortTransaction();
//         session.endSession();
//         return next(new ErrorResponse('User not found', 404));
//       }

//       // If phone number changed, mark as unverified
//       if (phone && phone !== req.user.phone) {
//         updatedUser.phoneVerified = false;
//         await updatedUser.save({ session });
        
//         // Send verification SMS (async)
//         const verificationToken = require('../services/authService').generateSecureToken();
//         await require('../config/redis').redisClient.set(
//           `phone_verify:${req.user.id}`,
//           verificationToken,
//           10 * 60 // 10 minutes
//         );
        
//         // Send verification SMS (implement your SMS service)
//         // smsService.sendVerificationCode(phone, verificationToken).catch(console.error);
//       }

//       await session.commitTransaction();
//       session.endSession();

//       // Clear user cache
//       await require('../config/redis').redisClient.del(`user:${req.user.id}`);

//       res.status(200).json({
//         success: true,
//         message: phone && phone !== req.user.phone 
//           ? 'Profile updated successfully. Please verify your new phone number.'
//           : 'Profile updated successfully',
//         data: updatedUser,
//       });

//     } catch (error) {
//       await session.abortTransaction();
//       session.endSession();
//       throw error;
//     }

//   } catch (error) {
//     console.error('Error updating profile:', error);

//     // Handle specific MongoDB errors
//     if (error.code === 11000) {
//       const field = Object.keys(error.keyPattern)[0];
//       return next(new ErrorResponse(`${field} already exists`, 400));
//     }

//     if (error.name === 'ValidationError') {
//       const messages = Object.values(error.errors).map(val => val.message);
//       return next(new ErrorResponse(messages.join(', '), 400));
//     }

//     if (error.name === 'CastError') {
//       return next(new ErrorResponse('Invalid data format', 400));
//     }

//     return next(new ErrorResponse('Server error while updating profile', 500));
//   }
// });















const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet  = require('../models/Wallet');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const authService = require('../services/authService');
const { redisClient } = require('../config/redis');
const cloudinary = require('../config/cloudinary');

// ==================== HELPER FUNCTIONS ====================

/**
 * Set token cookies in response
 */
const setTokenCookies = (res, tokens) => {
  // Access token cookie (short-lived)
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  // Refresh token cookie (long-lived)
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Clear token cookies
 */
const clearTokenCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

// ==================== AUTH CONTROLLERS ====================

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      city,
      state,
      dob,
      gender,
      gps,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return next(new ErrorResponse('Email already registered', 400));
    }

    // Parse GPS coordinates if provided
    let gpsCoordinates = null;
    if (gps) {
      try {
        const parsed = typeof gps === 'string' ? JSON.parse(gps) : gps;
        if (
          parsed.type === 'Point' &&
          Array.isArray(parsed.coordinates) &&
          parsed.coordinates.length === 2
        ) {
          gpsCoordinates = parsed;
        }
      } catch (err) {
        // Invalid GPS, ignore
      }
    }

    // Handle profile image upload
    let profileImage = {
      public_id: null,
      url: null,
      secure_url: null,
    };

    if (req.file) {
      try {
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: `egas/users/${email.replace(/[^a-zA-Z0-9]/g, '_')}/profile`,
          transformation: [{ width: 400, height: 400, crop: 'fill' }],
          quality: 'auto:good',
        });

        profileImage = {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          secure_url: uploadResult.secure_url,
        };
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
      }
    }

    // Create user
    const user = await User.create([{
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      phone,
      address,
      city,
      state,
      dob: dob ? new Date(dob) : undefined,
      gender,
      gpsCoordinates,
      profileImage,
      role: 'user',
      isActive: true,
      emailVerified: false,
      phoneVerified: false,
    }], { session });

    const newUser = user[0];

    // Create wallet
    await Wallet.create([{
      userId: newUser._id,
      balance: 0,
      currency: 'NGN',
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // Generate tokens using authService
    const tokens = authService.generateTokens(newUser);

    // Set HTTP-only cookies
    setTokenCookies(res, tokens);

    // Send welcome email (async)
    if (emailService.sendAccountCreatedEmail) {
      emailService.sendAccountCreatedEmail(newUser).catch(console.error);
    }

    // Send SMS notification (async)
    if (notificationService.sendAccountCreated) {
      notificationService.sendAccountCreated(newUser).catch(console.error);
    }

    // Generate email verification token
    const verificationToken = authService.generateSecureToken();
    const hashedToken = authService.hashToken(verificationToken);
    
    // Store in Redis with 24h expiry
    if (redisClient && redisClient.isConnected) {
      await redisClient.set(
        `email_verify:${newUser._id}`,
        hashedToken,
        24 * 60 * 60
      );

      // Send verification email (async)
      if (emailService.sendEmailVerification) {
        emailService.sendEmailVerification(newUser, verificationToken).catch(console.error);
      }
    }

    // Remove password from output
    newUser.password = undefined;

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        user: {
          id: newUser._id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          phone: newUser.phone,
          profileImage: newUser.profileImage,
          role: newUser.role,
          emailVerified: newUser.emailVerified,
          phoneVerified: newUser.phoneVerified,
        },
        // Only return tokens in development for debugging
        ...(process.env.NODE_ENV === 'development' && { tokens }),
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    if (err.code === 11000) {
      return next(new ErrorResponse('Email already exists', 400));
    }
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return next(new ErrorResponse(messages.join(', '), 400));
    }

    console.error('Registration error:', err);
    return next(new ErrorResponse('Registration failed', 500));
  }
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  // Find user with password field
  const user = await User.findOne({ 
    email: email.toLowerCase() 
  }).select('+password +loginAttempts +lockUntil');

  if (!user) {
    // Prevent timing attacks
    await bcrypt.compare(password, '$2a$10$fakeHashForTimingAttackPrevention');
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const retryAfter = Math.ceil((user.lockUntil - Date.now()) / 1000);
    res.set('Retry-After', retryAfter);
    return next(
      new ErrorResponse(
        'Account locked due to too many failed attempts. Please try again later.',
        423
      )
    );
  }

  // Check password
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    // Increment failed attempts
    user.loginAttempts = (user.loginAttempts || 0) + 1;

    if (user.loginAttempts >= 5) {
      user.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
      user.loginAttempts = 0;
    }

    await user.save({ validateBeforeSave: false });

    const attemptsLeft = 5 - user.loginAttempts;
    return next(
      new ErrorResponse(
        `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        401
      )
    );
  }

  // Reset login attempts on success
  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });
  }

  // Update last login
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save({ validateBeforeSave: false });

  // Generate tokens using authService
  const tokens = authService.generateTokens(user);

  // Set HTTP-only cookies - NOW setTokenCookies IS DEFINED ✓
  setTokenCookies(res, tokens);

  // Remove sensitive data
  user.password = undefined;
  user.loginAttempts = undefined;
  user.lockUntil = undefined;

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
      // Only return tokens in development
      ...(process.env.NODE_ENV === 'development' && { tokens }),
    },
  });
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
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
    return next(new ErrorResponse('Refresh token required', 400));
  }

  try {
    const { userId } = await authService.refreshAccessToken(refreshToken);
    
    const user = await User.findById(userId).select('-password -__v');
    
    if (!user || !user.isActive) {
      return next(new ErrorResponse('User not found or inactive', 401));
    }

    // Generate new tokens
    const tokens = authService.generateTokens(user);

    // Set new cookies
    setTokenCookies(res, tokens);

    // Revoke old refresh token
    await authService.revokeRefreshToken(userId, refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    // Clear invalid cookies
    clearTokenCookies(res);
    return next(new ErrorResponse('Invalid refresh token', 401));
  }
});

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  let token;
  let refreshToken;

  // Get tokens from cookies
  if (req.cookies) {
    token = req.cookies.accessToken;
    refreshToken = req.cookies.refreshToken;
  }

  // Also check headers for mobile apps
  if (!token && req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
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
    message: 'Logged out successfully',
  });
});

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -__v -loginAttempts -lockUntil')
    .populate('wallet', 'balance currency');

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Please provide current and new password', 400));
  }

  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isMatch = await user.matchPassword(currentPassword);

  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Generate new tokens
  const tokens = authService.generateTokens(user);

  // Revoke all other refresh tokens
  await authService.revokeAllUserTokens(user._id.toString());

  // Set new cookies
  setTokenCookies(res, tokens);

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
    data: {
      ...(process.env.NODE_ENV === 'development' && { tokens }),
    },
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse('Please provide an email address', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Don't reveal user existence
    return res.status(200).json({
      success: true,
      message: 'If an account exists, a password reset email will be sent.',
    });
  }

  // Generate reset token
  const resetToken = authService.generateSecureToken();
  const hashedToken = authService.hashToken(resetToken);

  // Store in Redis with 10 min expiry
  if (redisClient && redisClient.isConnected) {
    await redisClient.set(
      `password_reset:${user._id}`,
      hashedToken,
      10 * 60
    );
  }

  // Send email
  if (emailService.sendPasswordResetEmail) {
    emailService.sendPasswordResetEmail(user, resetToken).catch(console.error);
  }

  res.status(200).json({
    success: true,
    message: 'If an account exists, a password reset email will be sent.',
  });
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { password } = req.body;
  const { resettoken } = req.params;

  if (!password || !resettoken) {
    return next(new ErrorResponse('Please provide password and reset token', 400));
  }

  // Find user by reset token
  const hashedToken = crypto
    .createHash('sha256')
    .update(resettoken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired reset token', 400));
  }

  // Set new password
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Generate tokens
  const tokens = authService.generateTokens(user);

  // Set cookies
  setTokenCookies(res, tokens);

  // Revoke all refresh tokens
  await authService.revokeAllUserTokens(user._id.toString());

  // Send success email
  if (emailService.sendPasswordResetSuccessEmail) {
    emailService.sendPasswordResetSuccessEmail(user).catch(console.error);
  }

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    data: {
      ...(process.env.NODE_ENV === 'development' && { tokens }),
    },
  });
});

// @desc    Update notification preferences
// @route   PUT /api/v1/auth/profile/preferences/:id
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
      req.params.id || req.user._id,
      {
        notificationPreferences: {
          orderUpdates: orderUpdates !== undefined ? orderUpdates : true,
          deliveryNotifications: deliveryNotifications !== undefined ? deliveryNotifications : true,
          promotionalOffers: promotionalOffers !== undefined ? promotionalOffers : false,
          newsletter: newsletter !== undefined ? newsletter : false,
        },
      },
      { new: true }
    ).select('-password -__v');

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: updatedUser.notificationPreferences,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating preferences',
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
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

    // Prepare update object
    const updateData = {
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      phone,
      address: address?.trim(),
      city: city?.trim(),
      state: state?.trim(),
      updatedAt: new Date(),
    };

    // Add optional fields only if provided
    if (dob) updateData.dob = new Date(dob);
    if (gender) updateData.gender = gender;
    if (gpsCoordinates) {
      updateData.gpsCoordinates = typeof gpsCoordinates === 'string' 
        ? JSON.parse(gpsCoordinates) 
        : gpsCoordinates;
    }

    // Handle image upload if file exists
    if (req.file) {
      try {
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: `egas/users/${req.user.email.replace(/[^a-zA-Z0-9]/g, '_')}/profile`,
          transformation: [{ width: 400, height: 400, crop: 'fill' }],
          quality: 'auto:good',
        });

        updateData.profileImage = {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
          secure_url: uploadResult.secure_url,
        };
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -__v -loginAttempts -lockUntil');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return next(new ErrorResponse(messages.join(', '), 400));
    }
    
    return next(new ErrorResponse('Server error while updating profile', 500));
  }
});

// @desc    Verify email
// @route   GET /api/v1/auth/verifyemail/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { userId } = req.query;

  if (!token || !userId) {
    return next(new ErrorResponse('Invalid verification link', 400));
  }

  // Check if using Redis method
  if (redisClient && redisClient.isConnected) {
    // Get stored token from Redis
    const storedHash = await redisClient.get(`email_verify:${userId}`);

    if (!storedHash) {
      return next(new ErrorResponse('Verification link expired', 400));
    }

    // Hash the provided token and compare
    const hashedToken = authService.hashToken(token);

    if (hashedToken !== storedHash) {
      return next(new ErrorResponse('Invalid verification token', 400));
    }

    // Update user
    await User.findByIdAndUpdate(userId, {
      emailVerified: true,
    });

    // Delete used token
    await redisClient.del(`email_verify:${userId}`);
  } else {
    // Fallback to MongoDB method
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
    });

    if (!user) {
      return next(new ErrorResponse('Invalid or expired verification token', 400));
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
});

// @desc    Send verification email
// @route   POST /api/v1/auth/verifyemail
// @access  Private
exports.sendVerificationEmail = asyncHandler(async (req, res, next) => {
  if (req.user.emailVerified) {
    return next(new ErrorResponse('Email already verified', 400));
  }

  // Check if already requested recently (using Redis)
  if (redisClient && redisClient.isConnected) {
    const existing = await redisClient.get(`email_verify:${req.user._id}`);
    if (existing) {
      return next(new ErrorResponse('Verification email already sent. Please check your inbox.', 400));
    }

    const verificationToken = authService.generateSecureToken();
    const hashedToken = authService.hashToken(verificationToken);
    
    await redisClient.set(
      `email_verify:${req.user._id}`,
      hashedToken,
      24 * 60 * 60
    );

    if (emailService.sendEmailVerification) {
      await emailService.sendEmailVerification(req.user, verificationToken);
    }
  } else {
    // Fallback to MongoDB method
    const verificationToken = authService.generateSecureToken();
    const hashedToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    req.user.emailVerificationToken = hashedToken;
    req.user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;
    await req.user.save({ validateBeforeSave: false });

    if (emailService.sendEmailVerification) {
      await emailService.sendEmailVerification(req.user, verificationToken);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Verification email sent',
  });
});
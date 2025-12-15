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

    // 📧 8️⃣ Send welcome email (non-blocking)
    // try {
    //   await emailService.sendAccountCreatedEmail({
    //     name: `${firstName} ${lastName}`,
    //     email: email
    //   });
    // } catch (emailError) {
    //   // Log email error but don't fail the registration
    //   console.error('Failed to send welcome email:', emailError);
    //   // You might want to log this to a monitoring service
    // }

    // 9️⃣ Respond to frontend
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

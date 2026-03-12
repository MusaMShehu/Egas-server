// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto");

// const userSchema = new mongoose.Schema({
//   firstName: {
//     type: String,
//     required: [true, "Please provide first name"],
//     trim: true,
//     maxlength: [50, "First name cannot exceed 50 characters"],
//   },
//   lastName: {
//     type: String,
//     required: [true, "Please provide last name"],
//     trim: true,
//     maxlength: [50, "Last name cannot exceed 50 characters"],
//   },
//   email: {
//     type: String,
//     required: [true, "Please provide email"],
//     unique: true,
//     match: [
//       /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
//       "Please provide a valid email",
//     ],
//   },
//   phone: {
//     type: String,
//     required: [true, "Please provide phone number"],
//     match: [/^\+?[0-9]{10,15}$/, "Please provide a valid phone number"],
//   },
//   password: {
//     type: String,
//     required: [true, "Please provide password"],
//     minlength: [6, "Password must be at least 6 characters"],
//     select: false,
//   },
//   dob: {
//     type: Date,
//   },
//   gender: {
//     type: String,
//     enum: ["male", "female", "other"],
//   },
//   address: {
//     type: String,
//     required: [true, "Please provide address"],
//   },
//   city: {
//     type: String,
//     required: [true, "Please provide city"],
//   },
//   state: {
//     type: String,
//     required: [true, "Please provide state"],
//   },

//   // GeoJSON for GPS coordinates
//   gpsCoordinates: {
//     type: {
//       type: String,
//       enum: ["Point"],
//       required: [true, "GPS type is required"],
//       default: "Point",
//     },
//     coordinates: {
//       type: [Number], // [longitude, latitude]
//       required: [true, "GPS coordinates are required"],
//     },
//   },

//    profileImage: {
//         public_id: {
//             type: String,
//             default: null
//         },
//         url: {
//             type: String,
//             default: null
//         },
//         secure_url: {
//             type: String,
//             default: null
//         }
//     },

//   // walletBalance: {
//   //   type: Number,
//   //   default: 0,
//   // },
//   wallet: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Wallet",
//   },

//   role: {
//     type: String,
//     enum: ["user", "customer", "admin", "delivery", "customer_care"],
//     default: "user",
//   },
//   subscription: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Subscription",
//   },

//   isActive: {
//     type: Boolean,
//     default: true,
//   },
//   resetPasswordToken: String,
//   resetPasswordExpire: Date,
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// // Add 2dsphere index for geospatial queries
// userSchema.index({ gpsCoordinates: "2dsphere" });

// // Encrypt password before saving
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 10);
// });

// // Generate JWT token
// userSchema.methods.getSignedJwtToken = function () {
//   return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
//     expiresIn: process.env.JWT_EXPIRES_IN,
//   });
// };

// // Match user entered password to hashed password in database
// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// // Generate and hash password token
// userSchema.methods.getResetPasswordToken = function () {
//   const resetToken = crypto.randomBytes(20).toString("hex");

//   this.resetPasswordToken = crypto
//     .createHash("sha256")
//     .update(resetToken)
//     .digest("hex");

//   this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

//   return resetToken;
// };

// module.exports = mongoose.model("User", userSchema);






const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Please provide first name'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Please provide last name'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email',
    ],
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    match: [/^\+?[0-9]{10,15}$/, 'Please provide a valid phone number'],
    // unique: true,
    // sparse: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
    validate: {
      validator: function(v) {
        // Password must contain at least one uppercase, one lowercase, one number, one special character
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);
      },
      message: 'Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character',
    },
  },
  dob: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
  },
  address: {
    type: String,
    required: [true, 'Please provide address'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'Please provide city'],
    trim: true,
  },
  state: {
    type: String,
    required: [true, 'Please provide state'],
    trim: true,
  },
  gpsCoordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    },
  },
  profileImage: {
    public_id: String,
    url: String,
    secure_url: String,
  },
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'delivery', 'support'],
    default: 'user',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  loginAttempts: {
    type: Number,
    default: 0,
    select: false,
  },
  lockUntil: {
    type: Date,
    select: false,
  },
  lastLogin: {
    type: Date,
  },
  lastLoginIP: {
    type: String,
    select: false,
  },
  notificationPreferences: {
    orderUpdates: { type: Boolean, default: true },
    deliveryNotifications: { type: Boolean, default: true },
    promotionalOffers: { type: Boolean, default: false },
    newsletter: { type: Boolean, default: false },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userSchema.index({ gpsCoordinates: '2dsphere' });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token (legacy, use authService instead)
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model('User', userSchema);
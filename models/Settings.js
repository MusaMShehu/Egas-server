const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const settingsSchema = new mongoose.Schema({
  language: { type: String, default: "english" },
  currency: { type: String, default: "USD" },
  notifications: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    push: { type: Boolean, default: false },
    orderUpdates: { type: Boolean, default: true },
    deliveryNotifications: { type: Boolean, default: true },
    promotionalOffers: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: false }
  },
  privacy: {
    profileVisibility: { type: String, enum: ["public", "friends", "private"], default: "private" },
    dataSharing: { type: Boolean, default: false },
    locationSharing: { type: Boolean, default: true },
    personalizedAds: { type: Boolean, default: false }
  },
  security: {
    twoFactor: { type: Boolean, default: false },
    loginAlerts: { type: Boolean, default: true },
    sessionTimeout: { type: Number, default: 30 },
    biometricAuth: { type: Boolean, default: false }
  }
});

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  settings: { type: settingsSchema, default: () => ({}) }
});

// hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);

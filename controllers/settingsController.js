const User = require("../models/User");

// @desc Get user settings
// @route GET /api/settings
// @access Private
exports.getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};

// @desc Update user settings
// @route PUT /api/settings
// @access Private
exports.updateSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.settings = { ...user.settings.toObject(), ...req.body };
    await user.save();

    res.json({ message: "Settings updated successfully", settings: user.settings });
  } catch (err) {
    res.status(400).json({ message: "Failed to update settings", error: err.message });
  }
};

// @desc Export personal data
// @route GET /api/settings/export-data
// @access Private
exports.exportData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.setHeader("Content-Disposition", "attachment; filename=personal-data.json");
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(user, null, 2));
  } catch (err) {
    res.status(500).json({ message: "Failed to export data" });
  }
};

// @desc Delete account
// @route DELETE /api/users/me
// @access Private
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete account" });
  }
};

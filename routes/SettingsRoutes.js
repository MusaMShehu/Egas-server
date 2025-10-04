const express = require("express");
const { protect } = require("../middleware/auth");
const {
  getSettings,
  updateSettings,
  exportData,
  deleteAccount
} = require("../controllers/settingsController");

const router = express.Router();

router.get("/", protect, getSettings);
router.put("/", protect, updateSettings);
router.get("/export-data", protect, exportData);
router.delete("/delete-account", protect, deleteAccount);

module.exports = router;

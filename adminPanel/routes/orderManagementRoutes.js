const express = require("express");
const router = express.Router();

// ✅ Middleware
const { protect } = require("../../middleware/auth");
// const admin = require("../middleware/admin");

// ✅ Import controller functions individually
const {
  getAllOrders,
  getDashboardStats,
  getOrderAnalytics,
  exportOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  updateTracking,
  bulkUpdateOrderStatus,
} = require("../controllers/orderManagementController");

// ✅ Protected Admin routes
router.get("/", protect, getAllOrders);
router.get("/stats", protect, getDashboardStats);
router.get("/analytics", protect, getOrderAnalytics);
router.get("/export", protect, exportOrders);
router.get("/:id", protect, getOrderById);
router.patch("/:id/status", protect, updateOrderStatus);
router.patch("/:id/payment-status", protect, updatePaymentStatus);
router.patch("/:id/tracking", protect, updateTracking);
router.patch("/bulk/status", protect, bulkUpdateOrderStatus);

module.exports = router;

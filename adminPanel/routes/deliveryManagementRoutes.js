// routes/deliveries.js
const express = require("express");
const {
  getDeliveries,
  assignDeliveryAgent,
  getAgentDeliveries,
  acceptDelivery,
  markOutForDelivery,
  markAsDelivered,
  markAsFailed,
  confirmDelivery,
  getMyDeliveries,
  getDeliveryStats,
  generateDeliverySchedules,
} = require("../controllers/deliveryManagementController");

const { protect, authorize } = require("../../middleware/auth");

const router = express.Router();

// Admin routes
router.get("/", protect, authorize("admin"), getDeliveries);
router.put("/:id/assign", protect, authorize("admin"), assignDeliveryAgent);
router.get("/stats", protect, authorize("admin"), getDeliveryStats);
router.post("/generate-schedules", protect, authorize("admin"), generateDeliverySchedules);

// Delivery agent routes
router.get("/agent/my-deliveries", protect, authorize("delivery_agent"), getAgentDeliveries);
router.put("/:id/accept", protect, authorize("delivery_agent"), acceptDelivery);
router.put("/:id/out-for-delivery", protect, authorize("delivery_agent"), markOutForDelivery);
router.put("/:id/delivered", protect, authorize("delivery_agent"), markAsDelivered);
router.put("/:id/failed", protect, authorize("delivery_agent"), markAsFailed);

// Customer routes
router.get("/my-deliveries", protect, getMyDeliveries);
router.put("/:id/confirm", protect, confirmDelivery);

module.exports = router;
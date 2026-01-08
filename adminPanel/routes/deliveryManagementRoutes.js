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
  recordPartialDelivery,
  confirmRemnantEntry,
  requestRemnantDelivery,
  getMyRemnant,
  getAllRemnants,
  getAgentRemnantDeliveries,
  getNextDelivery
} = require("../controllers/deliveryManagementController");

const { protect, authorize } = require("../../middleware/auth");

const router = express.Router();

// Admin routes
router.get("/", protect, authorize("admin"), getDeliveries);
router.put("/:id/assign", protect, authorize("admin"), assignDeliveryAgent);
router.get("/stats", protect, authorize("admin"), getDeliveryStats);
router.post("/generate-schedules", protect, authorize("admin"), generateDeliverySchedules);

// Delivery agent routes
router.get("/agent/my-deliveries", protect, authorize("delivery"), getAgentDeliveries);
router.put("/:id/accept", protect, authorize("delivery"), acceptDelivery);
router.put("/:id/out-for-delivery", protect, authorize("delivery"), markOutForDelivery);
router.put("/:id/delivered", protect, authorize("delivery"), markAsDelivered);
router.put("/:id/failed", protect, authorize("delivery"), markAsFailed);

// Customer routes
router.get("/my-deliveries", protect, getMyDeliveries);
router.put("/:id/confirm", protect, confirmDelivery);
router.get('/next-delivery', protect, getNextDelivery);


// New remnant routes
router.put('/:id/partial-delivery', protect, authorize('delivery'), recordPartialDelivery);
router.put('/remnant/:id/confirm', protect, confirmRemnantEntry);
router.post('/remnant/request-delivery', protect, requestRemnantDelivery);
router.get('/remnant/my-remnant', protect, getMyRemnant);
router.get('/remnants', protect, authorize('admin'), getAllRemnants);
router.get('/agent/remnant-deliveries', protect, authorize('delivery'), getAgentRemnantDeliveries);

module.exports = router;
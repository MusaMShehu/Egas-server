// routes/deliveries.js
const express = require("express");
const {
  confirmDelivery,
  getMyDeliveries,
  confirmRemnantEntry,
  requestRemnantDelivery,
  getMyRemnant,
  getNextDelivery,
  getDeliveriesBySubscription,
  getDeliveryPauseHistory,
  syncDeliveryWithSubscription
} = require("../controllers/deliveryController");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router();


router.get("/deliveries-by-subscriptions", protect, getDeliveriesBySubscription);
router.get("/delivery-pause-history", protect, getDeliveryPauseHistory);
router.post("/:id/sync-subscription", protect, syncDeliveryWithSubscription);

router.get("/my-deliveries", protect, getMyDeliveries);
router.put("/:id/confirm", protect, confirmDelivery);
router.get('/next-delivery', protect, getNextDelivery);


// New remnant routes
router.put('/remnant/:id/confirm', protect, confirmRemnantEntry);
router.post('/remnant/request-delivery', protect, requestRemnantDelivery);
router.get('/remnant/my-remnant', protect, getMyRemnant);

module.exports = router;
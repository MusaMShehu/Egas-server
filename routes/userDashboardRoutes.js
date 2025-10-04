const express = require("express");
const {
  getWallet,
  refreshWallet,
  getOrders,
  getSubscriptions,
  getCurrentDelivery,
} = require("../controllers/userDashboardController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.get("/wallet", protect, getWallet);
router.get("/wallet/refresh", protect, refreshWallet);
router.get("/orders", protect, getOrders);
router.get("/subscriptions", protect, getSubscriptions);
router.get("/next-delivery", protect, getCurrentDelivery);

module.exports = router;

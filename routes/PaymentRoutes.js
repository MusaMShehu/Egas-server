const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const {
  
// Wallet Topup
  initiateTopup,
  verifyTopup,
  handleWalletWebhook,
  getWalletBalance,
  getPaymentHistory,
  handlePaymentCallback,
} = require("../controllers/PaymentController");
const { protect } = require("../middleware/auth");


//Handle Payment Callback
router.get('/callback', handlePaymentCallback);

// ✅ Wallet Top-up
router.post("/wallet/topup", protect, initiateTopup);
router.get("/wallet/verify", protect, verifyTopup);
router.post("/wallet/webhook", express.raw({ type: "application/json" }), handleWalletWebhook);
router.get("/wallet/balance", protect, getWalletBalance);
router.get("/wallet/history", protect, getPaymentHistory);

module.exports = router;

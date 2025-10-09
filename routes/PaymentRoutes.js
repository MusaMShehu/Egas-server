const express = require("express");
const bodyParser = require ("body-parser");
// import bodyParser from "body-parser";
const router = express.Router();
const {
  initializeSubscriptionPayment,
  verifySubscriptioTransaction,
  handleWebhook,
  getTransactionHistory,
  getSubscriptionDetails,
  initiateTopup,
  verifyTopup,
  handleTopupWebhook,
  getWalletBalance,
  getPaymentHistory,
  payWithWallet,
  initializeOrderPymentPaystack,
  confirmOrderPaymentPaystack,
  handleOrderPaymentPaystackWebhook,
} = require("../controllers/PaymentController");
const { protect } = require("../middleware/auth");

// ✅ Subscription Payment
router.post("/subscription/initialize", protect, initializeSubscriptionPayment);
router.get("/subscription/verify/:reference", protect, verifySubscriptioTransaction);
router.post("/subscription/webhook", express.raw({ type: "application/json" }), handleWebhook);
router.get("/subscription/history/:userId", protect, getTransactionHistory);
router.get("/subscription/details", protect, getSubscriptionDetails);

// ✅ Wallet Top-up
router.post("/wallet/topup", protect, initiateTopup);
router.get("/wallet/verify", protect, verifyTopup);
router.post("/paystack/webhook", bodyParser.raw({ type: "application/json" }), handleTopupWebhook);
router.get("/wallet/balance", protect, getWalletBalance);
router.get("/wallet/history", protect, getPaymentHistory);

// ✅ Order Payment
router.put("/order/:id/wallet-pay", protect, payWithWallet);
router.post("/order/initialize", protect, initializeOrderPymentPaystack);
router.get("/order/verify/:reference", protect, confirmOrderPaymentPaystack);
router.post("/order/webhook", express.raw({ type: "application/json" }), handleOrderPaymentPaystackWebhook);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  initializeSubscriptionPayment,
  verifySubscriptioTransaction,
  handleWebhook,
  getTransactionHistory,
  getSubscriptionDetails,
  initiateTopup, 
  verifyTopup, 
  getWalletBalance, 
  getPaymentHistory,
  payWithWallet,
  initializeOrderPymentPaystack,
  confirmOrderPaymentPaystack,
  handleOrderPaymentPaystackWebhook
} = require('../controllers/PaymentController');
const {protect} = require('../middleware/auth');


// Subscription payment
router.post('/initialize', protect, initializeSubscriptionPayment);
router.get('/verify/:reference', protect, verifySubscriptioTransaction);
router.post('/webhook', express.raw({type: 'application/json'}), handleWebhook);
router.get('/history/:userId', protect, getTransactionHistory);
router.get('/subscription', protect, getSubscriptionDetails);


// wallet Topup
router.post("/wallet/topup", protect, initiateTopup);
router.get("/verify", protect, verifyTopup);
router.get("/wallet/balance", protect, getWalletBalance);
router.get("/history", protect, getPaymentHistory);


// Order Payment
router.put("/:id/wallet-pay", protect, payWithWallet);
router.post('/initialize', protect, initializeOrderPymentPaystack);
router.get('/verify/:reference', protect, confirmOrderPaymentPaystack);
router.post('/webhook', express.raw({type: 'application/json'}), handleOrderPaymentPaystackWebhook);



module.exports = router;
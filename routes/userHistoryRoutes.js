const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPurchaseHistory,
  getSubscriptionHistory,
  getPaymentHistory
} = require('../controllers/userHistoryController');




router.get('/purchases', protect, getPurchaseHistory);
router.get('/subscriptions', protect, getSubscriptionHistory);
router.get('/payments', protect, getPaymentHistory);

module.exports = router;
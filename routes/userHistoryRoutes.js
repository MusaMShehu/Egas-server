const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getOrderHistory,
  getSubscriptionHistory,
  getPaymentHistory
} = require('../controllers/userHistoryController');



router.get('/orders', protect, getOrderHistory);
router.get('/subscriptions', protect, getSubscriptionHistory);
router.get('/payments', protect, getPaymentHistory);

module.exports = router;

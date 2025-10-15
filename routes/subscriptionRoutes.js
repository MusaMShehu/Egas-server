const express = require('express');
const {
  getSubscriptions,
  getMySubscriptions, 
  getSubscription,
  createSubscription,
  verifySubscriptionPayment,
  updateSubscription,
  cancelSubscription,
  cancelMySubscription,
  renewSubscription,
  processSubscriptions,
  getSubscriptionAnalytics,
  handleWebhook,
  getSubscriptionDeliveries,
  getAllSubscriptionDeliveries,
  pauseSubscription,
  resumeSubscription
} = require('../controllers/subscriptionController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(protect, authorize('admin'), getSubscriptions)
  .post(protect, createSubscription);

router.get('/verify', verifySubscriptionPayment);
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook); // Webhook endpoint (no auth required)
router.get('/my-subscriptions', protect, getMySubscriptions);
router.put('/:id/cancel-my', protect, cancelMySubscription);
router.post('/:id/renew', protect, renewSubscription);
router.get('/process', protect, authorize('admin'), processSubscriptions);
router.get('/analytics', protect, authorize('admin'), getSubscriptionAnalytics);

router
  .route('/:id')
  .get(protect, getSubscription)
  .put(protect, updateSubscription);

  router.get('/:id/deliveries', protect, getSubscriptionDeliveries);

  router.get('/deliveries/all', protect, authorize('admin'), getAllSubscriptionDeliveries);

  router.put('/:id/pause', protect, pauseSubscription);

  router.put('/:id/resume', protect, resumeSubscription);


router
  .route('/:id/cancel')
  .put(protect, authorize('admin'), cancelSubscription);

module.exports = router;
// routes/adminSubscriptions.js
const express = require('express');
const {
  getSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  bulkUpdateSubscriptions,
  bulkDeleteSubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  getSubscriptionAnalytics,
  getSubscriptionStatistics,
  exportSubscriptions
} = require('../controllers/subscriptionManagementController');

const { protect, authorize } = require('../../middleware/auth');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin', 'super-admin'));

// Main subscription routes
router.route('/')
  .get(getSubscriptions)
  .post(createSubscription);

router.route('/bulk/update')
  .put(bulkUpdateSubscriptions);

router.route('/bulk/delete')
  .delete(bulkDeleteSubscriptions);

router.route('/analytics/overview')
  .get(getSubscriptionAnalytics);

router.route('/statistics')
  .get(getSubscriptionStatistics);

router.route('/export')
  .get(exportSubscriptions);

router.route('/:id')
  .get(getSubscription)
  .put(updateSubscription)
  .delete(deleteSubscription);

// Subscription action routes
router.route('/:id/pause')
  .put(pauseSubscription);

router.route('/:id/resume')
  .put(resumeSubscription);

router.route('/:id/cancel')
  .put(cancelSubscription);

module.exports = router;
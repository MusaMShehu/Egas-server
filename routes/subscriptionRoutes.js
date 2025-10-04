const express = require('express');
const {
  getSubscriptions,
  getMySubscriptions, 
  getSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  cancelMySubscription,
  renewSubscription,
  processSubscriptions
} = require('../controllers/subscriptionController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

router
  .route('/')
  .get(protect, getSubscriptions)
  .post(protect, createSubscription);

router.get('/my-subscriptions', protect, getMySubscriptions);
router.put('/:id/cancel', protect, cancelMySubscription);
router.post('/:id/renew', protect, renewSubscription);


router
  .route('/:id')
  .get(/*protect,*/ getSubscription)
  .put(/*protect,*/ updateSubscription);

router
  .route('/:id/cancel')
  .put(/* protect, */cancelSubscription);

router
  .route('/process')
  .get(/* protect, */ authorize('admin'), processSubscriptions);

module.exports = router;
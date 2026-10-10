const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { validateObjectId } = require('../../middleware/validation');

const {
  listRequests,
  getRequest,
  getRejected,
  cancelRequest,
  getDeliveryTimeline,
} = require('../controllers/adminRefillController');

const {
  getQueue,
  completeReconciliation,
} = require('../controllers/adminReconciliationController');

router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

// Refill requests
router.get('/refill-requests', listRequests);
router.get('/refill-requests/rejected', getRejected);
router.get('/refill-requests/:id', validateObjectId('id'), getRequest);
router.post('/refill-requests/:id/cancel', validateObjectId('id'), cancelRequest);

// Delivery timeline (full internal view)
router.get('/deliveries/:id/timeline', validateObjectId('id'), getDeliveryTimeline);

// Reconciliation
router.get('/reconciliation', getQueue);
router.post(
  '/reconciliation/:transactionId/complete',
  validateObjectId('transactionId'),
  completeReconciliation
);

module.exports = router;
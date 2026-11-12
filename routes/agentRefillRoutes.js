const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const featureGuard = require('../middleware/featureGuard');
const { validateObjectId } = require('../middleware/validation');

const {
  createRefillRequest,
  getMyRefillRequests,
  getRefillRequest,
  retryRequest,
  collectFromPlant,
  escalateRequest,
} = require('../controllers/agentRefillController');

const {
  getAvailablePlants,
} = require('../controllers/agentRefillController');

router.use(protect);
router.use(authorize('delivery', 'admin', 'superadmin', 'super-admin'));
router.use(featureGuard('PARTNER_PLANT_WORKFLOW'));

// Plant selection
router.get('/plants/available', 
  // featureGuard('AGENT_PLANT_SELECTION'), 
  getAvailablePlants);

// Refill requests
router.post('/refill-requests', createRefillRequest);
router.get('/refill-requests', getMyRefillRequests);
router.get('/refill-requests/:id', validateObjectId('id'), getRefillRequest);
router.post('/refill-requests/:id/retry', validateObjectId('id'), retryRequest);
router.post('/refill-requests/:id/collect', validateObjectId('id'), collectFromPlant);
router.post('/refill-requests/:id/escalate', validateObjectId('id'), escalateRequest);

module.exports = router;
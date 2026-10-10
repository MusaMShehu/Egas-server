const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const featureGuard = require('../middleware/featureGuard');
const { validateObjectId } = require('../middleware/validation');

const {
  getMyCylinders,
  getCylinderWeightHistory,
} = require('../controllers/customerCylinderController');

const {
  getMyRemnantLedger,
  getMyRemnantSummary,
} = require('../controllers/customerRemnantController');

// All customer-authenticated
router.use(protect);

// Feature-flag cylinders + remnant
router.use(featureGuard('CYLINDER_LEDGER'));

// Cylinders
router.get('/cylinders', getMyCylinders);
router.get('/cylinders/:id/weight-history', validateObjectId('id'), getCylinderWeightHistory);

// Remnant
router.get('/remnant/ledger', featureGuard('REMNANT_LEDGER'), getMyRemnantLedger);
router.get('/remnant/summary', featureGuard('REMNANT_LEDGER'), getMyRemnantSummary);

module.exports = router;
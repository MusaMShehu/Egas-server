const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const featureGuard = require('../middleware/featureGuard');
const { validateObjectId } = require('../middleware/validation');

const {
  registerCylinder,
  lookupCylinder,
  weighCylinder,
  getCustomerCylinders,
  getWeightHistory,
  getCylinderRemnant,
  getCustomerRemnant
} = require('../controllers/agentCylinderController');

// All routes: authenticated + agent/admin
router.use(protect);
router.use(authorize('delivery', 'admin', 'superadmin', 'super-admin'));

// Feature-flag the entire domain
router.use(featureGuard('CYLINDER_LEDGER'));

// -------------------- ROUTES --------------------

// Lookup by tag (most-used fast path)
router.get('/lookup/:tagCode', lookupCylinder);

// Register new cylinder
router.post('/register', registerCylinder);

// Weigh a cylinder
router.post('/:id/weigh', validateObjectId('id'), weighCylinder);

// Customer cylinders
router.get('/customer/:customerId', validateObjectId('customerId'), getCustomerCylinders);

// Weight history
router.get('/:id/weight-history', validateObjectId('id'), getWeightHistory);

// Remnant ledger (cylinder-scoped)
router.get('/:id/remnant', validateObjectId('id'), getCylinderRemnant);

// agentCylinderRoutes.js
router.get('/customer/:customerId/remnant', getCustomerRemnant);


module.exports = router;
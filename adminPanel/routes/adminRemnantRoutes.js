const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { validateObjectId } = require('../../middleware/validation');

const {
  listLedger,
  getUserLedger,
  createAdjustment,
  verifyIntegrity,
} = require('../controllers/adminRemnantController');

router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

router.get('/remnant-ledger', listLedger);
router.get('/remnant-ledger/verify/:userId', validateObjectId('userId'), verifyIntegrity);
router.get('/remnant-ledger/user/:userId', validateObjectId('userId'), getUserLedger);
router.post('/remnant-ledger/adjustment', createAdjustment);

module.exports = router;
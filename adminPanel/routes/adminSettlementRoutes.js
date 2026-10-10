const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { validateObjectId } = require('../../middleware/validation');

const {
  listSettlements,
  getSettlement,
  generateSettlement,
  approveSettlement,
  markSettlementPaid,
} = require('../controllers/adminSettlementController');

router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

router.get('/list-settlements', listSettlements);
router.post('/generate-settlements', generateSettlement);
router.get('/:id', validateObjectId('id'), getSettlement);
router.patch('/:id/approve', validateObjectId('id'), approveSettlement);
router.patch('/:id/mark-paid', validateObjectId('id'), markSettlementPaid);

module.exports = router;
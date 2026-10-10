const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const { validateObjectId } = require('../../middleware/validation');

const {
  listCylinders,
  getCylinder,
  getWeightHistory,
  getCustodyHistory,
  getRemnantHistory,
  flagCylinder,
  retireCylinder,
} = require('../controllers/adminCylinderController');

router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

router.get('/', listCylinders);
router.get('/:id', validateObjectId('id'), getCylinder);
router.get('/:id/weight-history', validateObjectId('id'), getWeightHistory);
router.get('/:id/custody-history', validateObjectId('id'), getCustodyHistory);
router.get('/:id/remnant-history', validateObjectId('id'), getRemnantHistory);
router.patch('/:id/flag', validateObjectId('id'), flagCylinder);
router.patch('/:id/retire', validateObjectId('id'), retireCylinder);

module.exports = router;
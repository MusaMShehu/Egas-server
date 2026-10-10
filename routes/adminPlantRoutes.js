const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

const {
  getPlants,
  getPlant,
  createPlant,
  updatePlant,
  approvePlant,
  suspendPlant,
  activatePlant,
  getPlantStaff,
  addPlantStaff,
  removePlantStaff,
  getPlantPrices,
  createPlantPrice,
  cancelPriceAgreement,
} = require('../controllers/adminPlantController');

// All admin
router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

// Plants
router.route('/').get(getPlants).post(createPlant);
router.route('/:id').get(validateObjectId('id'), getPlant).put(validateObjectId('id'), updatePlant);

// Lifecycle
router.patch('/:id/approve', validateObjectId('id'), approvePlant);
router.patch('/:id/suspend', validateObjectId('id'), suspendPlant);
router.patch('/:id/activate', validateObjectId('id'), activatePlant);

// Staff
router.get('/:id/staff', validateObjectId('id'), getPlantStaff);
router.post('/:id/staff', validateObjectId('id'), addPlantStaff);
router.delete('/:id/staff/:staffId', validateObjectId('id'), validateObjectId('staffId'), removePlantStaff);

// Price agreements
router.get('/:id/price-agreements', validateObjectId('id'), getPlantPrices);
router.post('/:id/price-agreements', validateObjectId('id'), createPlantPrice);
router.patch('/price-agreements/:id/cancel', validateObjectId('id'), cancelPriceAgreement);

module.exports = router;
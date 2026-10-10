const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const {
  getAllConfigs,
  getConfigsByCategory,
  updateConfig,
  getAllFlags,
  updateFlag,
  clearCache,
} = require('../controllers/adminConfigController');

// All routes admin-only
router.use(protect);
router.use(authorize('admin', 'superadmin', 'super-admin'));

// Config
router.get('/', getAllConfigs);
router.get('/category/:category', getConfigsByCategory);
router.post('/clear-cache', clearCache);

// Feature Flags
router.get('/feature-flags', getAllFlags);
router.put('/feature-flags/:key', updateFlag);

router.put('/:key', updateConfig);

module.exports = router;
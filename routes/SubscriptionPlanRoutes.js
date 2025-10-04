const express = require('express');
const router = express.Router();
const {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  restorePlan,
  getAllPlansAdmin,
  updatePlanOrder,
  getPlansByType,
  togglePlanPopular,
  getPopularPlans
} = require('../controllers/SubscriptionPlanController');
const {protect, adminAuth } = require('../middleware/auth');


// Public routes
router.get('/', getAllPlans);
router.get('/popular', getPopularPlans);
router.get('/:id', getPlanById);
router.get('/type/:type', getPlansByType);

// Admin routes
router.post('/', protect, adminAuth, createPlan);
router.put('/:id', protect, adminAuth, updatePlan);
router.delete('/:id', protect, adminAuth, deletePlan);
router.patch('/:id/restore', protect, adminAuth, restorePlan);
router.patch('/:id/toggle-popular', protect, adminAuth, togglePlanPopular);
router.get('/admin/all', protect, adminAuth, getAllPlansAdmin);
router.put('/admin/update-order', protect, adminAuth, updatePlanOrder);

module.exports = router;
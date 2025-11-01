// In your routes file
const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getRecentActivities,
  getChartData,
  getDashboardOverview
} = require('../controllers/adminDashboardController');
const { protect, authorize } = require('../../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/stats', getDashboardStats);
router.get('/recent-activities', getRecentActivities);
router.get('/chart-data', getChartData);
router.get('/overview', getDashboardOverview);

module.exports = router;
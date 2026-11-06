// // routes/reports.js
// const express = require("express");
// const router = express.Router();
// const { protect, authorize } = require("../../middleware/auth");

// // ✅ Import individual controller functions
// const {
//   getSalesReports,
//   getUserReports,
//   getInventoryReports,
//   getSubscriptionReports,
//   getFinancialReports,
//   getRealTimeMetrics,
//   exportReport,
//   getSavedReports,
//   saveReport,
//   deleteSavedReport,
//   getSchedules,
//   createSchedule,
//   updateSchedule,
//   deleteSchedule,
//   getRecipients,
// } = require("../controllers/reportManagementController");

// // Apply auth middleware to all routes
// router.use(protect);
// // router.use(authorize("admin", "customer_care"));

// // Main report endpoints
// router.get("/sales", getSalesReports);
// router.get("/users", getUserReports);
// router.get("/inventory", getInventoryReports);
// router.get("/subscriptions", getSubscriptionReports);
// router.get("/financial", getFinancialReports);

// // Real-time data
// router.get("/realtime-metrics", getRealTimeMetrics);

// // Export functionality
// router.post("/export/:reportType", exportReport);

// // Saved reports management
// router.get("/saved", getSavedReports);
// router.post("/saved", saveReport);
// router.delete("/saved/:id", deleteSavedReport);

// // Report scheduling
// router.get("/schedules", getSchedules);
// router.post("/schedules", createSchedule);
// router.patch("/schedules/:id", updateSchedule);
// router.delete("/schedules/:id", deleteSchedule);

// // Recipients management (for scheduled reports)
// router.get("/recipients", getRecipients);

// module.exports = router;























const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middleware/auth');
const {
  getSalesReports,
  getUserReports,
  getInventoryReports,
  getSubscriptionReports,
  getFinancialReports,
  getRealTimeMetrics,
  getHealthReport,
  exportReport,
} = require('../controllers/reportManagementController');

router.use(protect);
router.use(authorize('admin', 'super_admin', 'super-admin', 'customer_care'));

router.get('/sales', getSalesReports);
router.get('/users', getUserReports);
router.get('/inventory', getInventoryReports);
router.get('/subscriptions', getSubscriptionReports);
router.get('/financial', getFinancialReports);
router.get('/realtime-metrics', getRealTimeMetrics);
router.get('/health', getHealthReport);

router.get('/export/:reportType', exportReport);

module.exports = router;
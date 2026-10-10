const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const plantScope = require('../middleware/plantScope');
const featureGuard = require('../middleware/featureGuard');
const { validateObjectId } = require('../middleware/validation');

const {
  listRequests,
  getRequest,
  receiveCylinder,
  submitInspection,
  recordQuantity,
  confirmRefill,
  listTransactions,
  getTransaction,
} = require('../controllers/plantRefillController');

const {
  getDashboard,
  getMetrics,
  getActivity,
} = require('../controllers/plantDashboardController');

const {
  listStaff,
  inviteStaff,
  updateStaffRole,
  toggleStaffStatus,
  removeStaff,
} = require('../controllers/plantStaffController');

const {
  getProfile,
  updateProfile,
} = require('../controllers/plantProfileController');

// All routes: authenticated + plant-scoped
router.use(protect);
router.use(plantScope({ requirePlant: true }));
router.use(featureGuard('PARTNER_PLANT_WORKFLOW'));

// ------------------------------------------------------------------
// Helper: restrict to specific plant roles
// ------------------------------------------------------------------
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role ${req.user.role} is not authorized for this action`,
    });
  }
  next();
};

// -------------------- DASHBOARD --------------------
router.get('/dashboard', getDashboard);
router.get('/dashboard/metrics', getMetrics);
router.get('/activity', getActivity);

// -------------------- REFILL REQUESTS --------------------
router.get('/refill-requests', listRequests);
router.get('/refill-requests/:id', validateObjectId('id'), getRequest);

// Operations (plant_operator and above)
router.post(
  '/refill-requests/:id/receive',
  validateObjectId('id'),
  allowRoles('plant_admin', 'plant_supervisor', 'plant_operator'),
  receiveCylinder
);

router.post(
  '/refill-requests/:id/inspect',
  validateObjectId('id'),
  allowRoles('plant_admin', 'plant_supervisor', 'plant_operator'),
  submitInspection
);

router.post(
  '/refill-requests/:id/record-quantity',
  validateObjectId('id'),
  allowRoles('plant_admin', 'plant_supervisor', 'plant_operator'),
  recordQuantity
);

router.post(
  '/refill-requests/:id/confirm',
  validateObjectId('id'),
  allowRoles('plant_admin', 'plant_supervisor', 'plant_operator'),
  confirmRefill
);

// -------------------- TRANSACTIONS --------------------
router.get(
  '/transactions',
  allowRoles('plant_admin', 'plant_supervisor'),
  listTransactions
);

router.get(
  '/transactions/:id',
  validateObjectId('id'),
  allowRoles('plant_admin', 'plant_supervisor'),
  getTransaction
);

// -------------------- STAFF MANAGEMENT --------------------
router.get('/staff', allowRoles('plant_admin'), listStaff);
router.post('/staff', allowRoles('plant_admin'), inviteStaff);
router.put('/staff/:id', validateObjectId('id'), allowRoles('plant_admin'), updateStaffRole);
router.patch(
  '/staff/:id/toggle-status',
  validateObjectId('id'),
  allowRoles('plant_admin'),
  toggleStaffStatus
);
router.delete(
  '/staff/:id',
  validateObjectId('id'),
  allowRoles('plant_admin'),
  removeStaff
);

// -------------------- PROFILE --------------------
router.get('/profile', getProfile);
router.put('/profile', allowRoles('plant_admin'), updateProfile);

module.exports = router;
const express = require('express');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  updateWalletBalance,
  getUsersByLocation,
  bulkDeleteUsers,
  bulkUpdateStatus,
  getUserStats
} = require('../controllers/userManagementController');

const { protect, authorize } = require('../../middleware/auth');

const router = express.Router();

// Protect all routes
router.use(protect);

// Admin only routes
router.use(authorize('admin'));

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/stats/overview')
  .get(getUserStats);

router.route('/location/nearby')
  .get(getUsersByLocation);

router.route('/bulk/delete')
  .delete(bulkDeleteUsers);

router.route('/bulk/status')
  .patch(bulkUpdateStatus);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

router.route('/:id/status')
  .patch(toggleUserStatus);

router.route('/:id/wallet')
  .patch(updateWalletBalance);

module.exports = router;
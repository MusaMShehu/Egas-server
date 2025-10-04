const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  uploadUserPhoto,
  getUserDashboardStats,
  updatePassword,
  updateEmail,
  deleteAccount
} = require('../controllers/userController');


const {
  protect, 
  authorize, 
  userAuth, 
  adminAuth,
  optionalAuth,
  refreshSession  
}  = require('../middleware/auth');


router
  .route('/')
  .get(protect, authorize('admin'), getUsers)
  .post(protect, authorize('admin'), createUser);

router
  .route('/user/:id')
  .get(protect, authorize('admin'), getUser)
  .put(protect, authorize('admin'), updateUser)
  .delete(protect, authorize('admin'), deleteUser);

router
  .route('/picture/:id')
  .put(protect, uploadUserPhoto);

router
  .route('/profile')
  .get(protect, authorize('admin'), getUserDashboardStats);

router
  .route('/me/password')
  .put(protect, updatePassword);

router
  .route('/me/email')
  .put(protect, updateEmail);

router
  .route('/me')
  .delete(protect, deleteAccount);  



module.exports = router;
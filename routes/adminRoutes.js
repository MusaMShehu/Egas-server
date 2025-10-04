const express = require('express');
const adminRoute = express.Router();
const {
  protect, 
  authorize, 
  userAuth, 
  adminAuth,
  optionalAuth,
  refreshSession  
}  = require('../middleware/auth');

const { 
  getAdminDashboard,
  getAllUsers,
  getAllSubscriptions,
  getAllProducts,
  getAllOrders,
  createNewProduct,
  createNewUser, 
  updateUser,
  updateProduct,
  updateUserSubscription,
  updateUserStatus,
  deleteUser,
  uploadUserPhoto,
  assignOrders
} = require('../controllers/adminController');
const { uploadMultiple, uploadSingle } = require('../middleware/uploadMiddleware');


adminRoute.get('/dashboard', protect, adminAuth, getAdminDashboard);
adminRoute.get('/users', getAllUsers);
adminRoute.get('/subscriptions', getAllSubscriptions);
adminRoute.get('/products', getAllProducts);
adminRoute.get('/orders', getAllOrders);

adminRoute.post('/product', uploadMultiple('attachments', 5), createNewProduct);
adminRoute.post('/users', uploadSingle, createNewUser);

adminRoute.put('/users/:id',  updateUser);
adminRoute.put('/users/:id/picture', uploadSingle, uploadUserPhoto);
adminRoute.put('/status/:id',  updateUserStatus);
adminRoute.put('/product/:id', uploadMultiple('attachments', 5), updateProduct);
adminRoute.put('/subscription/:id',  updateUserSubscription);
adminRoute.put('/order/assign/:id', assignOrders);

adminRoute.delete('/users/:id', deleteUser);


module.exports = adminRoute;


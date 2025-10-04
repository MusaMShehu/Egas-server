const express = require('express');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductPhoto
} = require('../controllers/productController');

const router = express.Router();

// const {
//   protect, 
//   authorize, 
//   userAuth, 
//   adminAuth,
//   optionalAuth,
//   refreshSession  
// }  = require('../middleware/auth');

router
  .route('/')
  .get(getProducts)
  .post(/*protect, authorize('admin'),*/ createProduct);

router
  .route('/:id')
  .get(getProduct)
  .put(/*protect, authorize('admin'),*/ updateProduct)
  .delete(/*protect, authorize('admin'),*/ deleteProduct);

router
  .route('/:id/photo')
  .put(/*protect, authorize('admin'),*/ uploadProductPhoto);

module.exports = router;
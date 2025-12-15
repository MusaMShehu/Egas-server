const express = require("express");
const Product = require("../../models/Product");

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  uploadProductPhoto,
  bulkDeleteProducts,
  toggleProductStatus,
  updateProductStock,
  getProductAnalytics,
} = require("../controllers/productManagementController");


const { protect, authorize } = require("../../middleware/auth");
const advancedResults = require("../../middleware/advancedResults");
const { productUpload } = require('../../middleware/upload');

const router = express.Router();

// Admin authorization middleware
router.use(protect);
router.use(authorize("admin", "superadmin"));

// Product Routes
router
  .route("/")
  .get(advancedResults(Product), getProducts)
  .post(createProduct);

router.route("/:id")
  .get(getProduct);

router.route("/update-product/:id")
  .put(updateProduct);

router.route("/delete-product/:id")
  .delete(deleteProduct);

router.route("/products/bulk-delete")
  .delete(bulkDeleteProducts);

// Uploads
router.post('/upload', authorize, productUpload.array('images', 5), uploadProductPhoto)
// router.put('/upload', authorize, productUpload.array('images', 5), uploadProductPhoto)
router.delete('/:productId/image/:publicId', authorize, deleteProductImage)

// create product with image
// router.post('/', authorize, )

router.route("/products/:id/toggle-status")
  .patch(toggleProductStatus);

router.route("/products/:id/stock")
  .patch(updateProductStock);

router.route("/products/analytics/overview")
  .get(getProductAnalytics);


module.exports = router;

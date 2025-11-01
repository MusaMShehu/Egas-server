const express = require("express");
const Product = require("../../models/Product");

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductPhoto,
  bulkDeleteProducts,
  toggleProductStatus,
  updateProductStock,
  getProductAnalytics,
} = require("../controllers/productManagementController");


const { protect, authorize } = require("../../middleware/auth");
const advancedResults = require("../../middleware/advancedResults");
const upload = require("../../middleware/upload")

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

router.route("/:id/photo")
.put(upload.single("photo"), uploadProductPhoto);

router.route("/products/:id/toggle-status")
  .patch(toggleProductStatus);

router.route("/products/:id/stock")
  .patch(updateProductStock);

router.route("/products/analytics/overview")
  .get(getProductAnalytics);


module.exports = router;

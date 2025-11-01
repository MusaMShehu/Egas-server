const express = require("express");
const SubscriptionPlan = require("../../models/SubscriptionPlan");

const {
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  togglePlanStatus,
  togglePlanPopular,
  updateDisplayOrder,
  bulkUpdateDisplayOrders,
  calculatePrice,
  getPlanAnalytics,
  duplicatePlan,
} = require("../controllers/subsPlanManagementController");

const { protect, authorize } = require("../../middleware/auth");
const advancedResults = require("../../middleware/advancedResults");
const upload = require("../../middleware/upload")

const router = express.Router();

// Admin authorization middleware
router.use(protect);
router.use(authorize("admin", "superadmin"));


// Subscription Plan Routes
router
  .route("/")
  .get(advancedResults(SubscriptionPlan), getSubscriptionPlans)
  .post(createSubscriptionPlan);

router.route("/analytics/overview").get(getPlanAnalytics);

router
  .route("/bulk-display-order")
  .patch(bulkUpdateDisplayOrders);

router
  .route("/:id")
  .get(getSubscriptionPlan)
  .put(updateSubscriptionPlan)
  .delete(deleteSubscriptionPlan);

router.route("/:id/toggle-status").patch(togglePlanStatus);

router.route("/:id/toggle-popular").patch(togglePlanPopular);

router.route("/:id/display-order").patch(updateDisplayOrder);

router.route("/:id/calculate-price").post(calculatePrice);

router.route("/:id/duplicate").post(duplicatePlan);

module.exports = router;

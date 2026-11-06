// adminPanel/controllers/adminAlertsController.js
const asyncHandler = require('../../middleware/async');
const Dispute = require('../../models/Dispute');
const PlantRefillTransaction = require('../../models/PlantRefillTransaction');
const PlantSettlement = require('../../models/PlantSettlement');
const Delivery = require('../../models/Delivery');
const Subscription = require('../../models/Subscription');
const SupportTicket = require('../../models/SupportTicket');
const Cylinder = require('../../models/Cylinder');
const PartnerPlant = require('../../models/PartnerPlant');
const Product = require('../../models/Product');
const ConfigService = require('../../services/configService');

// @desc    Get aggregated alerts across all admin domains
// @route   GET /api/v1/admin/dashboard/alerts
// @access  Private/Admin
exports.getAlerts = asyncHandler(async (req, res) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const toleranceKg = await ConfigService.getConfig('PLANT_VARIANCE_TOLERANCE_KG', 0.2);

  const [
    openDisputes,
    unreconciledTxn,
    pendingSettlements,
    failedDeliveries,
    expiringSubscriptions,
    openTickets,
    flaggedCylinders,
    pendingPlants,
    lowStockProducts,
    largeVarianceTxn,
  ] = await Promise.all([
    Dispute.countDocuments({ status: { $in: ['open', 'under_review'] } }),

    PlantRefillTransaction.countDocuments({
      status: 'confirmed',
      isSettled: false,
    }),

    PlantSettlement.countDocuments({
      status: { $in: ['draft', 'pending_review', 'approved'] },
    }),

    Delivery.countDocuments({
      status: 'failed',
      failedAt: { $gte: sevenDaysAgo },
    }),

    Subscription.countDocuments({
      status: 'active',
      endDate: { $gte: now, $lte: tomorrow },
    }),

    SupportTicket.countDocuments({
      status: { $in: ['open', 'in-progress'] },
    }),

    Cylinder.countDocuments({
      status: 'flagged',
      isDeleted: false,
    }),

    PartnerPlant.countDocuments({
      status: 'pending_approval',
      isDeleted: false,
    }),

    Product.countDocuments({
      isActive: true,
      stock: { $lte: 10 },
    }),

    // Transactions whose variance exceeds tolerance — need dispute / reconcile
    PlantRefillTransaction.countDocuments({
      status: 'confirmed',
      isSettled: false,
      $expr: { $gt: [{ $abs: { $ifNull: ['$variance', 0] } }, toleranceKg] },
    }),
  ]);

  const alerts = [
    {
      key: 'open_disputes',
      severity: 'danger',
      count: openDisputes,
      label: 'Open disputes',
      description: 'Disputes awaiting resolution',
      href: '/admin/disputes',
    },
    {
      key: 'large_variance',
      severity: 'danger',
      count: largeVarianceTxn,
      label: 'Transactions beyond tolerance',
      description: 'Confirmed refills with variance beyond tolerance — dispute them',
      href: '/admin/refills',
    },
    {
      key: 'unreconciled',
      severity: 'warning',
      count: unreconciledTxn,
      label: 'Pending reconciliation',
      description: 'Confirmed refill transactions not yet reconciled',
      href: '/admin/refills',
    },
    {
      key: 'pending_settlements',
      severity: 'warning',
      count: pendingSettlements,
      label: 'Settlements in flight',
      description: 'Draft / approved settlements not yet paid',
      href: '/admin/settlements',
    },
    {
      key: 'failed_deliveries',
      severity: 'warning',
      count: failedDeliveries,
      label: 'Failed deliveries (7d)',
      description: 'Failed deliveries in the last 7 days',
      href: '/admin/deliveries',
    },
    {
      key: 'expiring_subscriptions',
      severity: 'info',
      count: expiringSubscriptions,
      label: 'Expiring subscriptions',
      description: 'Active subscriptions expiring within 24 hours',
      href: '/admin/subscriptions',
    },
    {
      key: 'open_tickets',
      severity: 'info',
      count: openTickets,
      label: 'Open support tickets',
      description: 'Tickets awaiting first response or resolution',
      href: '/admin/support',
    },
    {
      key: 'flagged_cylinders',
      severity: 'warning',
      count: flaggedCylinders,
      label: 'Flagged cylinders',
      description: 'Cylinders flagged as unsafe — review or retire',
      href: '/admin/cylinders',
    },
    {
      key: 'pending_plants',
      severity: 'info',
      count: pendingPlants,
      label: 'Plants awaiting approval',
      description: 'Partner plants pending approval',
      href: '/admin/plants',
    },
    {
      key: 'low_stock',
      severity: 'warning',
      count: lowStockProducts,
      label: 'Low stock products',
      description: 'Active products with 10 or fewer in stock',
      href: '/admin/products',
    },
  ];

  // Only return alerts that are actually > 0
  res.status(200).json({
    success: true,
    data: alerts.filter((a) => a.count > 0),
  });
});
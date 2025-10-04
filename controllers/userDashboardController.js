const Wallet = require("../models/wallet");
const Order = require("../models/Order");
const Subscription = require("../models/Subscription");

/**
 * @desc Get user wallet balance
 * @route GET /api/v1/dashboard/wallet
 */
exports.getWallet = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user._id });
  if (!wallet) {
    return res.status(200).json({ success: true, balance: 0 });
  }

  res.status(200).json({
    success: true,
    balance: wallet.balance,
  });
};

/**
 * @desc Refresh wallet balance (dummy example: re-fetch from DB or external service)
 * @route GET /api/v1/dashboard/wallet/refresh
 */
exports.refreshWallet = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user._id });
  if (!wallet) {
    return res.status(200).json({ success: true, balance: 0 });
  }

  res.status(200).json({
    success: true,
    balance: wallet.balance,
  });
};

/**
 * @desc Get recent user orders
 * @route GET /api/v1/dashboard/orders?limit=5
 */
exports.getOrders = async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const orders = await Order.find({ user: req.user._id })
    .populate("products.product")
    .sort({ createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
};

/**
 * @desc Get user subscriptions
 * @route GET /api/v1/dashboard/subscriptions?limit=5
 */
exports.getSubscriptions = async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const subscriptions = await Subscription.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions,
  });
};

/**
 * @desc Get current delivery tracking (based on latest subscription)
 * @route GET /api/v1/dashboard/next-delivery
 */
exports.getCurrentDelivery = async (req, res) => {
  const subscription = await Subscription.findOne({ user: req.user._id }).sort({
    createdAt: -1,
  });

  if (!subscription) {
    return res.status(200).json({
      success: true,
      message: "No active subscription found",
    });
  }

  res.status(200).json({
    success: true,
    plan: subscription.plan,
    status: subscription.status,
    startDate: subscription.startDate,
    nextRenewal: subscription.nextRenewal,
    amount: subscription.amount,
  });
};

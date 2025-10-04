const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment'); // make sure this is correct
const Transaction = require('../models/Transaction'); 
const asyncHandler = require('../middleware/async');

// Pagination helper
const paginate = (req) => {
  let { page = 1, limit = 10 } = req.query;
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ✅ Orders
exports.getOrderHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req);
  const filter = { user: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.q) {
    filter.$or = [
      { orderId: { $regex: req.query.q, $options: 'i' } },
      { 'items.name': { $regex: req.query.q, $options: 'i' } }
    ];
  }

  const total = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: orders,
  });
});

// ✅ Subscriptions
exports.getSubscriptionHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req);
  const filter = { userId: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.q) {
    filter.$or = [
      { planName: { $regex: req.query.q, $options: 'i' } },
      { subscriptionId: { $regex: req.query.q, $options: 'i' } }
    ];
  }

  const total = await Subscription.countDocuments(filter);
  const subscriptions = await Subscription.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: subscriptions.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: subscriptions, // ✅ fixed
  });
});

// ✅ Payments
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req);
  const filter = { userId: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const total = await Transaction.countDocuments(filter); // ✅ use Payment
  const transactions = await Transaction.find(filter)     // ✅ use Payment
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: transactions.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: transactions, // ✅ consistent with frontend
  });
});

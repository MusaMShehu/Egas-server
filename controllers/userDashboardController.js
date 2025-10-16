const Order = require('../models/Order');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Wallet = require('../models/wallet');
const asyncHandler = require('../middleware/async');

const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// Helper: compute next delivery date based on frequency
function getNextDeliveryDate(subscription) {
  if (!subscription || subscription.status !== 'active') return null;

  const lastDelivery = subscription.lastDeliveryDate || subscription.startDate || new Date();
  const freq = subscription.deliveryFrequency?.toLowerCase();
  const nextDelivery = new Date(lastDelivery);

  switch (freq) {
    case 'daily':
      nextDelivery.setDate(lastDelivery.getDate() + 1);
      break;
    case 'weekly':
      nextDelivery.setDate(lastDelivery.getDate() + 7);
      break;
    case 'bi-weekly':
      nextDelivery.setDate(lastDelivery.getDate() + 14);
      break;
    case 'monthly':
      nextDelivery.setMonth(lastDelivery.getMonth() + 1);
      break;
    case 'quarterly':
      nextDelivery.setMonth(lastDelivery.getMonth() + 3);
      break;
    default:
      nextDelivery.setDate(lastDelivery.getDate() + 30);
      break;
  }

  return nextDelivery;
}

exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  // --- ORDERS ---
  // Fetch all paid orders for the user
const orders = await Order.find({
  user: userId,
  paymentStatus: "completed",
})
  .sort({ createdAt: -1 })
  .lean();

// Calculate total order spending
const orderTotal = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

// Calculate monthly spending (orders placed this month)
const orderMonthly = orders
  .filter(o => o.createdAt >= startOfMonth(new Date()))
  .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

// Count active (non-delivered/cancelled) orders
const activeOrderCount = await Order.countDocuments({
  user: userId,
  orderStatus: { $in: ["processing", "in-transit"] },
});


  // --- SUBSCRIPTIONS ---
  const subscriptions = await Subscription.find({
    userId,
    status: { $in: ['active', 'paused', 'expired'] },
  }).sort({ createdAt: -1 });

  const subscriptionTotal = subscriptions.reduce((sum, s) => sum + (s.price || 0), 0);
  const subscriptionMonthly = subscriptions
    .filter(s => s.createdAt >= startOfMonth())
    .reduce((sum, s) => sum + (s.price || 0), 0);

  const activeSubscriptions = subscriptions
    .filter(s => s.status === 'active')
    .map(s => ({
      name: s.name || s.planName || 'Unnamed Plan',
      status: s.status,
      deliveryFrequency: s.deliveryFrequency || 'monthly',
      nextDeliveryDate: getNextDeliveryDate(s),
    }));

  const nextDeliveryDate =
    activeSubscriptions.length > 0
      ? activeSubscriptions
          .map(s => s.nextDeliveryDate)
          .filter(Boolean)
          .sort((a, b) => a - b)[0] || null
      : null;

  const recentSubscriptions = subscriptions.slice(0, 3);

  
 // --- WALLET ---
const wallet = await Wallet.findOne({ userId }).lean();

let walletBalance = 0;
let topupTotal = 0;
let topupMonthly = 0;
let topupActivities = [];

if (wallet) {
  walletBalance = wallet.balance || 0;

  const transactions = wallet.transactions || [];
  const topups = transactions.filter(t => t.type?.toLowerCase() === 'credit');

  // Total top-up (all time)
  topupTotal = topups.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Monthly top-up
  topupMonthly = topups
    .filter(t => new Date(t.date) >= startOfMonth())
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // 5 most recent transactions
  topupActivities = transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map(t => ({
      type: 'wallet_transaction',
      title: t.description || (t.type === 'Credit' ? 'Wallet Credit' : 'Wallet Debit'),
      amount: t.amount,
      status: t.type,
      createdAt: t.date,
    }));
} else {
  console.warn(`⚠️ No wallet found for user ${userId}`);
}

  // --- COMBINED MONTHLY SPENDING (Orders + Subscriptions) ---
  const orderAgg = await Order.aggregate([
    { $match: { userId, status: 'paid' } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        total: { $sum: '$totalAmount' },
      },
    },
  ]);

  const subAgg = await Subscription.aggregate([
    { $match: { userId, status: { $in: ['active', 'expired'] } } },
    {
      $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        total: { $sum: '$price' },
      },
    },
  ]);

  const merged = {};
  orderAgg.forEach(o => {
    const key = `${o._id.year}-${o._id.month}`;
    merged[key] = (merged[key] || 0) + o.total;
  });
  subAgg.forEach(s => {
    const key = `${s._id.year}-${s._id.month}`;
    merged[key] = (merged[key] || 0) + s.total;
  });

  const spendingByMonth = Object.entries(merged)
    .map(([key, total]) => {
      const [year, month] = key.split('-').map(Number);
      return { _id: { year, month }, total };
    })
    .sort((a, b) =>
      a._id.year === b._id.year ? a._id.month - b._id.month : a._id.year - b._id.year
    )
    .slice(-6);

  // --- TOTAL SPENDING ---
  const totalSpent = orderTotal + subscriptionTotal;
  const thisMonthSpent = orderMonthly + subscriptionMonthly;

  // --- RECENT ITEMS ---
  const recentOrders = orders.slice(0, 3);

  // --- MERGED RECENT ACTIVITIES ---
  const orderActivities = orders.slice(0, 5).map(o => ({
    type: 'order',
    title: `Order #${o._id.toString().slice(-6)}`,
    amount: o.totalAmount,
    status: o.status,
    createdAt: o.createdAt,
  }));

  const subActivities = subscriptions.slice(0, 5).map(s => ({
    type: 'subscription',
    title: s.name || s.planName || 'Subscription Plan',
    amount: s.price,
    status: s.status,
    createdAt: s.createdAt,
  }));

  // 5 most recent transactions
// const topupActivities = transactions
//   .sort((a, b) => new Date(b.date) - new Date(a.date))
//   .slice(0, 5)
//   .map(t => ({
//     type: 'wallet_transaction',
//     title: t.description || (t.type === 'Credit' ? 'Wallet Credit' : 'Wallet Debit'),
//     amount: t.amount,
//     status: t.type,
//     createdAt: t.date,
//   }));

  const recentActivities = [...orderActivities, ...subActivities, ...topupActivities]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  // --- RESPONSE ---
 res.status(200).json({
  success: true,
  data: {
    totalSpent,
    thisMonthSpent,
    orderTotal,
    subscriptionTotal,
    topupTotal,
    orderMonthly,
    subscriptionMonthly,
    topupMonthly,
    orderCount: orders.length,
    activeOrderCount,
    nextDeliveryDate,
    subscriptionCount: subscriptions.length,
    activeSubscriptions,
    walletBalance,
    recentOrders,
    recentSubscriptions,
    spendingByMonth,
    recentActivities: [
      ...orderActivities,
      ...subActivities,
      ...topupActivities
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8),
  },
});
});

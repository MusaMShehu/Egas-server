const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
// const Wallet = require('../models/Wallet');

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get active orders count
    const activeOrders = await Order.countDocuments({ 
      userId, 
      status: { $in: ['Processing', 'Shipped', 'In Transit'] } 
    });

    // Get upcoming deliveries
    const upcomingDeliveries = await Order.findOne({ 
      userId, 
      status: { $in: ['Processing', 'Shipped', 'In Transit'] } 
    }).sort({ deliveryDate: 1 });

    // Get subscription status
    const subscription = await Subscription.findOne({ userId, status: 'Active' });

    // Get wallet balance
    const wallet = await Wallet.findOne({ userId });

    res.json({
      activeOrders,
      upcomingDeliveries: {
        count: upcomingDeliveries ? 1 : 0,
        nextDelivery: upcomingDeliveries?.deliveryDate || null
      },
      subscription: subscription ? {
        status: subscription.status,
        plan: subscription.plan
      } : { status: 'Inactive' },
      walletBalance: wallet?.balance || 0
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

exports.refreshBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    // In a real application, this would fetch from a payment gateway
    // For demo purposes, we'll just return the current balance
    res.json({ balance: wallet.balance });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

exports.getQuickActions = async (req, res) => {
  // This would typically come from a database or configuration
  const quickActions = [
    { icon: 'fa-fire-flame-curved', text: 'Order Gas', action: 'order_gas' },
    { icon: 'fa-repeat', text: 'Manage Subscription', action: 'manage_subscription' },
    { icon: 'fa-wallet', text: 'Top Up Wallet', action: 'top_up_wallet' },
    { icon: 'fa-headset', text: 'Contact Support', action: 'contact_support' }
  ];

  res.json(quickActions);
};
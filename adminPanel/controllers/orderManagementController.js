// controllers/orderController.js
const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');

// Get all orders with filtering and pagination
exports.getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      paymentStatus,
      paymentMethod,
      deliveryOption,
      dateRange,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    let filter = {};

    // Status filter
    if (status && status !== 'all') {
      filter.orderStatus = status;
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      filter.paymentStatus = paymentStatus;
    }

    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      filter.paymentMethod = paymentMethod;
    }

    // Delivery option filter
    if (deliveryOption && deliveryOption !== 'all') {
      filter.deliveryOption = deliveryOption;
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let startDate = new Date();

      switch (dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          filter.createdAt = { $gte: startDate };
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          filter.createdAt = { $gte: startDate };
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          filter.createdAt = { $gte: startDate };
          break;
        default:
          break;
      }
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { orderId: searchRegex },
        { reference: searchRegex },
        { deliveryAddress: searchRegex },
        { 'user.firstName': searchRegex },
        { 'user.lastName': searchRegex },
        { 'user.email': searchRegex }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with population
    const orders = await Order.find(filter)
      .populate('user', 'firstName lastName email phone')
      .populate('products.product', 'name sku images')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count for pagination
    const total = await Order.countDocuments(filter);

    res.status(200).json({
      success: true,
      orders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('products.product', 'name sku images category weight');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus } = req.body;
    const validStatuses = ['processing', 'in-transit', 'delivered', 'cancelled'];

    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status'
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus },
      { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // If order is delivered, set delivery date
    if (orderStatus === 'delivered' && !order.deliveryDate) {
      order.deliveryDate = new Date();
      await order.save();
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const validStatuses = ['pending', 'completed', 'failed'];

    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus },
      { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
};

// Update tracking information
exports.updateTracking = async (req, res) => {
  try {
    const { tracking } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { tracking },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tracking information updated successfully',
      order
    });
  } catch (error) {
    console.error('Update tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tracking information',
      error: error.message
    });
  }
};

// Bulk update order status
exports.bulkUpdateOrderStatus = async (req, res) => {
  try {
    const { orderIds, orderStatus } = req.body;
    const validStatuses = ['processing', 'in-transit', 'delivered', 'cancelled'];

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order IDs are required'
      });
    }

    if (!validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status'
      });
    }

    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { orderStatus }
    );

    // If orders are being delivered, set delivery date
    if (orderStatus === 'delivered') {
      await Order.updateMany(
        { _id: { $in: orderIds }, deliveryDate: { $exists: false } },
        { deliveryDate: new Date() }
      );
    }

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} orders updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating orders',
      error: error.message
    });
  }
};

// Get order analytics
exports.getOrderAnalytics = async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    const now = new Date();
    let startDate = new Date();

    // Calculate start date based on period
    switch (period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get orders within date range
    const orders = await Order.find({
      createdAt: { $gte: startDate }
    }).populate('products.product', 'name');

    // Calculate basic metrics
    const totalOrders = orders.length;
    const completedOrders = orders.filter(order => 
      order.paymentStatus === 'completed'
    ).length;
    const cancelledOrders = orders.filter(order => 
      order.orderStatus === 'cancelled'
    ).length;
    
    const totalRevenue = orders
      .filter(order => order.paymentStatus === 'completed')
      .reduce((sum, order) => sum + order.totalAmount, 0);

    const averageOrderValue = completedOrders > 0 
      ? totalRevenue / completedOrders 
      : 0;

    const conversionRate = totalOrders > 0 
      ? (completedOrders / totalOrders) * 100 
      : 0;

    // Status distribution
    const statusDistribution = orders.reduce((acc, order) => {
      acc[order.orderStatus] = (acc[order.orderStatus] || 0) + 1;
      return acc;
    }, {});

    // Payment status distribution
    const paymentDistribution = orders.reduce((acc, order) => {
      acc[order.paymentStatus] = (acc[order.paymentStatus] || 0) + 1;
      return acc;
    }, {});

    // Payment method distribution
    const paymentMethodDistribution = orders.reduce((acc, order) => {
      acc[order.paymentMethod] = (acc[order.paymentMethod] || 0) + 1;
      return acc;
    }, {});

    // Delivery option distribution
    const deliveryDistribution = orders.reduce((acc, order) => {
      acc[order.deliveryOption] = (acc[order.deliveryOption] || 0) + 1;
      return acc;
    }, {});

    // Trends data
    const trends = orders.reduce((acc, order) => {
      const date = new Date(order.createdAt);
      let key;
      
      if (period === '7days') {
        key = date.toLocaleDateString('en-US', { weekday: 'short' });
      } else if (period === '30days') {
        key = `Week ${Math.ceil(date.getDate() / 7)}`;
      } else {
        key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      if (!acc[key]) {
        acc[key] = { orders: 0, revenue: 0 };
      }
      
      acc[key].orders += 1;
      if (order.paymentStatus === 'completed') {
        acc[key].revenue += order.totalAmount;
      }
      
      return acc;
    }, {});

    // Product sales
    const productSales = orders.reduce((acc, order) => {
      order.products.forEach(item => {
        const productName = item.product?.name || 'Unknown Product';
        if (!acc[productName]) {
          acc[productName] = { quantity: 0, revenue: 0 };
        }
        acc[productName].quantity += item.quantity;
        acc[productName].revenue += item.quantity * item.price;
      });
      return acc;
    }, {});

    const topProducts = Object.entries(productSales)
      .sort(([,a], [,b]) => b.quantity - a.quantity)
      .slice(0, 5)
      .reduce((acc, [product, data]) => {
        acc[product] = data;
        return acc;
      }, {});

    res.status(200).json({
      success: true,
      analytics: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        averageOrderValue,
        conversionRate,
        statusDistribution,
        paymentDistribution,
        paymentMethodDistribution,
        deliveryDistribution,
        trends,
        topProducts,
        period
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    // Today's stats
    const todaysOrders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    const todaysRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Total stats
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await User.countDocuments({ role: 'user' });
    
    const totalRevenue = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Pending orders
    const pendingOrders = await Order.countDocuments({
      orderStatus: 'processing'
    });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      stats: {
        todaysOrders,
        todaysRevenue: todaysRevenue[0]?.total || 0,
        totalOrders,
        totalCustomers,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders,
        recentOrders
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

// Export orders to CSV/Excel
exports.exportOrders = async (req, res) => {
  try {
    const { format = 'csv', ...filters } = req.query;

    // Build filter (similar to getAllOrders)
    let filter = {};
    
    if (filters.status && filters.status !== 'all') {
      filter.orderStatus = filters.status;
    }
    
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      filter.paymentStatus = filters.paymentStatus;
    }

    // Get orders for export
    const orders = await Order.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('products.product', 'name')
      .sort({ createdAt: -1 });

    // Transform data for export
    const exportData = orders.map(order => ({
      orderId: order.orderId,
      reference: order.reference || '',
      customer: `${order.user.firstName} ${order.user.lastName}`,
      email: order.user.email,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      deliveryOption: order.deliveryOption,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt,
      deliveryDate: order.deliveryDate || '',
      products: order.products.map(p => 
        `${p.product.name} (Qty: ${p.quantity})`
      ).join('; ')
    }));

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.json');
      return res.json(exportData);
    }

    // CSV format
    const headers = [
      'Order ID',
      'Reference',
      'Customer',
      'Email',
      'Total Amount',
      'Delivery Fee',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Delivery Option',
      'Delivery Address',
      'Created At',
      'Delivery Date',
      'Products'
    ];

    const csvData = exportData.map(order => [
      order.orderId,
      order.reference,
      order.customer,
      order.email,
      order.totalAmount,
      order.deliveryFee,
      order.paymentMethod,
      order.paymentStatus,
      order.orderStatus,
      order.deliveryOption,
      order.deliveryAddress,
      order.createdAt,
      order.deliveryDate,
      order.products
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
    res.send(csvContent);

  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting orders',
      error: error.message
    });
  }
};
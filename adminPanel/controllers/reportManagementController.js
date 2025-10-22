// controllers/reportsController.js
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Subscription = require('../../models/Subscription');
const Transaction = require('../../models/Transaction');
const Payment = require('../../models/Payment');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');

// @desc    Get sales reports
// @route   GET /api/v1/admin/reports/sales
// @access  Private/Admin
exports.getSalesReports = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, category, status, paymentMethod, deliveryOption, search } = req.query;

  // Build base query
  let query = {};
  
  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Additional filters
  if (category && category !== 'all') {
    const productIds = await getProductIdsByCategory(category);
    query['products.product'] = { $in: productIds };
  }
  
  if (status && status !== 'all') query.orderStatus = status;
  if (paymentMethod && paymentMethod !== 'all') query.paymentMethod = paymentMethod;
  if (deliveryOption && deliveryOption !== 'all') query.deliveryOption = deliveryOption;

  let orders = await Order.find(query)
    .populate('user', 'firstName lastName email')
    .populate('products.product', 'name category price')
    .sort({ createdAt: -1 });

  // Search functionality
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    orders = orders.filter(order => 
      order.orderId?.match(searchRegex) ||
      order.user?.firstName?.match(searchRegex) ||
      order.user?.lastName?.match(searchRegex) ||
      order.user?.email?.match(searchRegex) ||
      order._id.toString().match(searchRegex)
    );
  }

  // Calculate metrics
  const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Generate report data
  const dailySales = await getDailySalesData(startDate, endDate, query);
  const topProducts = await getTopProducts(orders);
  const salesByCategory = await getSalesByCategory(orders);

  // Comparison data
  const comparisonData = await getSalesComparisonData(startDate, endDate, totalSales, totalOrders, averageOrderValue);

  res.status(200).json({
    success: true,
    count: orders.length,
    data: {
      summary: {
        totalSales,
        totalOrders,
        averageOrderValue,
        salesChange: comparisonData.salesChange,
        ordersChange: comparisonData.ordersChange,
        aovChange: comparisonData.aovChange,
        conversionRate: calculateConversionRate(startDate, endDate),
        conversionChange: 0
      },
      charts: {
        dailySales,
        topProducts,
        salesByCategory
      },
      detailedOrders: orders.slice(0, 50).map(order => ({
        id: order._id,
        orderId: order.orderId,
        date: order.createdAt,
        customer: `${order.user?.firstName} ${order.user?.lastName}`,
        email: order.user?.email,
        products: order.products.length,
        amount: order.totalAmount,
        status: order.orderStatus,
        paymentMethod: order.paymentMethod,
        deliveryStatus: order.tracking?.status || 'pending'
      }))
    }
  });
});

// @desc    Get user reports
// @route   GET /api/v1/admin/reports/users
// @access  Private/Admin
exports.getUserReports = asyncHandler(async (req, res, next) => {
  try {
    const { startDate, endDate, userRole, status, search } = req.query;

    // Initialize query
    let query = {};

    // ✅ Date validation
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && isNaN(start.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid startDate format' });
    }

    if (end && isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid endDate format' });
    }

    // ✅ Build date filter only if valid
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = start;
      if (end) query.createdAt.$lte = end;
    }

    // ✅ Other filters
    if (userRole && userRole !== 'all') query.role = userRole;
    if (status && status !== 'all') query.isActive = status === 'active';

    // Fetch users
    let users = await User.find(query).select('-password');

    // ✅ Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      users = users.filter(user => 
        user.firstName?.match(searchRegex) ||
        user.lastName?.match(searchRegex) ||
        user.email?.match(searchRegex) ||
        user.phone?.match(searchRegex) ||
        user._id.toString().match(searchRegex)
      );
    }

    const totalUsers = await User.countDocuments();
    const newUsers = users.length;

    // ✅ Call helper safely
    const activeUsers = await getActiveUsersCount(start, end);

    res.status(200).json({
      success: true,
      count: users.length,
      data: {
        summary: {
          totalUsers,
          newUsers,
          activeUsers,
          usersChange: 0,
          registrationChange: 0,
          activeChange: 0,
          conversionRate: 0,
          conversionChange: 0
        },
        charts: {
          dailyUsers: await getDailyUserData(start, end),
          userDemographics: await getUserDemographics(users),
          acquisitionSources: await getAcquisitionSources(start, end),
          userTiers: await getUserTiers(users)
        },
        detailedUsers: users.slice(0, 50).map(user => ({
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phone,
          signupDate: user.createdAt,
          lastActive: user.lastLogin,
          status: user.isActive ? 'active' : 'inactive',
          orders: 0,
          totalSpend: 0,
          tier: getUserTier(user),
          isOnline: Math.random() > 0.7
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error in getUserReports:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// @desc    Get inventory reports
// @route   GET /api/v1/admin/reports/inventory
// @access  Private/Admin
exports.getInventoryReports = asyncHandler(async (req, res, next) => {
  const { category, status, search } = req.query;

  // Build query
  let query = {};
  
  if (category && category !== 'all') query.category = category;
  if (status && status !== 'all') {
    if (status === 'low') query.stock = { $lte: 10 };
    else if (status === 'out') query.stock = 0;
    else if (status === 'healthy') query.stock = { $gt: 10 };
  }

  let products = await Product.find(query);

  // Search functionality
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    products = products.filter(product => 
      product.name?.match(searchRegex) ||
      product.category?.match(searchRegex) ||
      product._id.toString().match(searchRegex)
    );
  }

  const totalProducts = await Product.countDocuments();
  const lowStockItems = await Product.countDocuments({ stock: { $lte: 10, $gt: 0 } });
  const outOfStockItems = await Product.countDocuments({ stock: 0 });
  const inventoryValue = products.reduce((sum, product) => sum + (product.price * product.stock), 0);

  res.status(200).json({
    success: true,
    count: products.length,
    data: {
      summary: {
        totalProducts,
        lowStockItems,
        outOfStockItems,
        inventoryValue,
        productsChange: 0,
        lowStockChange: 0,
        outOfStockChange: 0,
        valueChange: 0,
        stockTurnover: calculateStockTurnover(),
        turnoverChange: 0,
        carryingCost: inventoryValue * 0.25,
        costChange: 0
      },
      charts: {
        stockLevels: products.slice(0, 20).map(product => ({
          product: product.name,
          current: product.stock,
          minimum: 10,
          maximum: 100
        })),
        categoryDistribution: await getCategoryDistribution(products),
        lowStockAlerts: products
          .filter(p => p.stock <= 10)
          .map(product => ({
            product: product.name,
            category: product.category,
            currentStock: product.stock,
            minimumRequired: 10,
            daysOfSupply: calculateDaysOfSupply(product),
            status: product.stock === 0 ? 'Critical' : product.stock <= 5 ? 'Warning' : 'Low'
          })),
        inventoryMovement: await getInventoryMovement()
      },
      detailedInventory: products.map(product => ({
        id: product._id,
        name: product.name,
        category: product.category,
        currentStock: product.stock,
        minStock: 10,
        maxStock: 100,
        unitCost: product.price,
        totalValue: product.price * product.stock,
        turnoverRate: Math.random() * 10,
        lastRestocked: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        status: product.stock === 0 ? 'Out of Stock' : 
               product.stock <= 5 ? 'Low Stock' : 
               product.stock <= 10 ? 'Warning' : 'Healthy'
      }))
    }
  });
});

// @desc    Get subscription reports
// @route   GET /api/v1/admin/reports/subscriptions
// @access  Private/Admin
exports.getSubscriptionReports = asyncHandler(async (req, res, next) => {
  try {
    const { startDate, endDate, subscriptionType, frequency, status, search } = req.query;

    // 🧹 Validate and sanitize date inputs
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && isNaN(start.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid startDate format' });
    }

    if (end && isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid endDate format' });
    }

    // 🧩 Build query safely
    let query = {};

    if (start || end) {
      // Only include valid date filters
      query = {
        ...(start && { endDate: { $gte: start } }),
        ...(end && { startDate: { $lte: end } })
      };
    }

    // 🧠 Add other filters
    if (subscriptionType && subscriptionType !== 'all') query.planType = subscriptionType;
    if (frequency && frequency !== 'all') query.frequency = frequency;
    if (status && status !== 'all') query.status = status;

    // 🗃️ Fetch subscriptions
    let subscriptions = await Subscription.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('deliveries');

    // 🔍 Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      subscriptions = subscriptions.filter(sub => 
        sub.planName?.match(searchRegex) ||
        sub.userId?.firstName?.match(searchRegex) ||
        sub.userId?.lastName?.match(searchRegex) ||
        sub.userId?.email?.match(searchRegex) ||
        sub._id.toString().match(searchRegex)
      );
    }

    // 📊 Summary calculations
    const totalSubscriptions = await Subscription.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ 
      status: 'active',
      endDate: { $gte: new Date() }
    });

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: {
        summary: {
          totalSubscriptions,
          activeSubscriptions,
          trialSubscriptions: await Subscription.countDocuments({ status: 'pending' }),
          mrr: await calculateMRR(subscriptions),
          renewalRate: await calculateRenewalRate(start, end),
          churnRate: await calculateChurnRate(start, end),
          subscriptionsChange: 0,
          activeChange: 0,
          mrrChange: 0,
          renewalChange: 0,
          churnChange: 0,
          arpu: calculateARPU(subscriptions),
          arpuChange: 0
        },
        charts: {
          subscriptionTrend: await getSubscriptionTrend(start, end),
          planDistribution: await getPlanDistribution(subscriptions),
          planPerformance: await getPlanPerformance(subscriptions),
          upcomingRenewals: await getUpcomingRenewals()
        },
        detailedSubscriptions: subscriptions.slice(0, 50).map(sub => ({
          id: sub._id,
          customer: `${sub.userId?.firstName} ${sub.userId?.lastName}`,
          email: sub.userId?.email,
          plan: sub.planName,
          type: sub.planType,
          startDate: sub.startDate,
          endDate: sub.endDate,
          status: sub.status,
          mrr: sub.price,
          totalValue: sub.price * (sub.subscriptionPeriod || 1),
          renewalDate: sub.endDate
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error in getSubscriptionReports:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// @desc    Get financial reports
// @route   GET /api/v1/admin/reports/financial
// @access  Private/Admin
exports.getFinancialReports = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const revenueData = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        },
        paymentStatus: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  const totalRevenue = revenueData[0]?.totalRevenue || 0;
  const totalExpenses = totalRevenue * 0.6;
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        revenueChange: 0,
        expensesChange: 0,
        profitChange: 0,
        marginChange: 0,
        cashFlow: netProfit * 0.8,
        cashFlowChange: 0,
        roi: (netProfit / totalExpenses) * 100,
        roiChange: 0,
        grossProfit: totalRevenue * 0.7,
        operatingIncome: netProfit * 0.9
      },
      charts: {
        monthlyFinancials: await getMonthlyFinancials(startDate, endDate),
        incomeStatement: generateIncomeStatement(totalRevenue, totalExpenses),
        expenseBreakdown: generateExpenseBreakdown(totalExpenses),
        financialRatios: calculateFinancialRatios(totalRevenue, totalExpenses, netProfit)
      },
      detailedFinancials: (await getMonthlyFinancials(startDate, endDate)).map(item => ({
        date: item.month,
        revenue: item.revenue,
        expenses: item.expenses,
        profit: item.revenue - item.expenses,
        margin: ((item.revenue - item.expenses) / item.revenue) * 100,
        cashFlow: (item.revenue - item.expenses) * 0.8,
        roi: ((item.revenue - item.expenses) / item.expenses) * 100,
        growthRate: 0
      }))
    }
  });
});

// @desc    Get real-time metrics
// @route   GET /api/v1/admin/reports/real-time
// @access  Private/Admin
exports.getRealTimeMetrics = asyncHandler(async (req, res, next) => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const activeUsers = await User.countDocuments({
    lastLogin: { $gte: new Date(now.getTime() - 15 * 60 * 1000) }
  });

  const liveOrders = await Order.countDocuments({
    createdAt: { $gte: oneHourAgo },
    orderStatus: { $in: ['processing', 'in-transit'] }
  });

  const revenueToday = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: oneDayAgo },
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

  const subscriptionsActive = await Subscription.countDocuments({
    status: 'active',
    endDate: { $gte: now }
  });

  const pendingDeliveries = await Order.countDocuments({
    orderStatus: 'in-transit'
  });

  res.status(200).json({
    success: true,
    data: {
      metrics: {
        activeUsers,
        liveOrders,
        revenueToday: revenueToday[0]?.total || 0,
        subscriptionsActive,
        pendingDeliveries,
        systemHealth: 99.9,
        responseTime: 45,
        errorRate: 0.02,
        uptime: 99.98
      },
      trends: {
        activeUsersTrend: 2.5,
        liveOrdersTrend: -1.2,
        revenueTrend: 5.7,
        subscriptionsTrend: 3.1,
        deliveriesTrend: -0.5,
        healthTrend: 0.1
      },
      alerts: await getSystemAlerts(),
      recentActivities: await getRecentActivities(),
      sparklines: {
        activeUsersSparkline: "0,8 25,12 50,15 75,18 100,20",
        liveOrdersSparkline: "0,15 25,12 50,8 75,10 100,12",
        revenueSparkline: "0,5000 25,7500 50,12000 75,8000 100,15000"
      }
    }
  });
});

// @desc    Export reports
// @route   GET /api/v1/admin/reports/export/:reportType
// @access  Private/Admin
exports.exportReport = asyncHandler(async (req, res, next) => {
  const { reportType } = req.params;
  const { format = 'json', ...config } = req.query;

  // Get report data based on type
  const reportData = await generateExportData(reportType, config);

  if (format === 'csv') {
    const csvData = convertToCSV(reportData, reportType);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csvData);
  }

  if (format === 'pdf') {
    // PDF export implementation would go here
    return next(new ErrorResponse('PDF export not yet implemented', 501));
  }

  if (format === 'excel') {
    // Excel export implementation would go here
    return next(new ErrorResponse('Excel export not yet implemented', 501));
  }

  // Default JSON response
  res.status(200).json({
    success: true,
    data: reportData,
    exportedAt: new Date().toISOString(),
    reportType,
    format
  });
});

// @desc    Get saved reports
// @route   GET /api/v1/admin/reports/saved
// @access  Private/Admin
exports.getSavedReports = asyncHandler(async (req, res, next) => {
  // Mock saved reports - in real app, you'd have a SavedReport model
  const savedReports = [
    {
      id: '1',
      name: 'Weekly Sales Performance',
      type: 'sales',
      description: 'Weekly overview of sales metrics and trends',
      savedAt: new Date().toISOString(),
      lastRun: new Date().toISOString(),
      filters: { status: 'completed' },
      dateRange: {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      }
    }
  ];

  res.status(200).json({
    success: true,
    count: savedReports.length,
    data: savedReports
  });
});


// @desc    Save report configuration
// @route   POST /api/v1/reports/saved
// @access  Private/Admin
exports.saveReport = asyncHandler(async (req, res, next) => {
  const { name, type, description, filters, dateRange } = req.body;

  if (!name || !type) {
    return next(new ErrorResponse('Name and type are required', 400));
  }

  const savedReport = {
    id: Date.now().toString(),
    name,
    type,
    description,
    filters,
    dateRange,
    savedAt: new Date().toISOString(),
    lastRun: new Date().toISOString()
  };

  res.status(201).json({
    success: true,
    message: 'Report saved successfully',
    data: {
      savedReport
    }
  });
});

// @desc    Delete saved report
// @route   DELETE /api/v1/reports/saved/:id
// @access  Private/Admin
exports.deleteSavedReport = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  res.status(200).json({
    success: true,
    message: 'Report deleted successfully'
  });
});



// @desc    Get report schedules
// @route   GET /api/v1/admin/reports/schedules
// @access  Private/Admin
exports.getSchedules = asyncHandler(async (req, res, next) => {
  // Mock schedules - in real app, you'd have a Schedule model
  const schedules = [
    {
      id: '1',
      name: 'Daily Sales Report',
      frequency: 'daily',
      deliveryTime: '09:00',
      format: 'pdf',
      enabled: true,
      recipients: ['admin@company.com'],
      lastRun: new Date().toISOString(),
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  res.status(200).json({
    success: true,
    count: schedules.length,
    data: schedules
  });
});


// @desc    Create report schedule
// @route   POST /api/v1/reports/schedules
// @access  Private/Admin
exports.createSchedule = asyncHandler(async (req, res, next) => {
  const { name, frequency, deliveryTime, format, recipients, enabled } = req.body;

  if (!name || !frequency || !deliveryTime) {
    return next(new ErrorResponse('Name, frequency, and delivery time are required', 400));
  }

  const schedule = {
    id: Date.now().toString(),
    name,
    frequency,
    deliveryTime,
    format: format || 'pdf',
    recipients: recipients || [],
    enabled: enabled !== undefined ? enabled : true,
    lastRun: null,
    nextRun: calculateNextRun(frequency, deliveryTime)
  };

  res.status(201).json({
    success: true,
    message: 'Schedule created successfully',
    data: {
      schedule
    }
  });
});

// @desc    Update report schedule
// @route   PUT /api/v1/reports/schedules/:id
// @access  Private/Admin
exports.updateSchedule = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  res.status(200).json({
    success: true,
    message: 'Schedule updated successfully'
  });
});

// @desc    Delete report schedule
// @route   DELETE /api/v1/reports/schedules/:id
// @access  Private/Admin
exports.deleteSchedule = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  res.status(200).json({
    success: true,
    message: 'Schedule deleted successfully'
  });
});

// @desc    Get report recipients
// @route   GET /api/v1/reports/recipients
// @access  Private/Admin
exports.getRecipients = asyncHandler(async (req, res, next) => {
  const recipients = [
    {
      id: '1',
      name: 'Admin User',
      email: 'admin@company.com',
      role: 'admin'
    },
    {
      id: '2',
      name: 'Manager User',
      email: 'manager@company.com',
      role: 'manager'
    }
  ];

  res.status(200).json({
    success: true,
    count: recipients.length,
    data: {
      recipients
    }
  });
});


// Helper Functions
const getDailySalesData = async (startDate, endDate, filter) => {
  const dailyData = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        },
        paymentStatus: 'completed'
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        amount: { $sum: "$totalAmount" },
        orders: { $sum: 1 },
        averageValue: { $avg: "$totalAmount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return dailyData.map(day => ({
    date: day._id,
    amount: day.amount,
    orders: day.orders,
    averageValue: day.averageValue
  }));
};

const getTopProducts = async (orders) => {
  const productSales = {};
  
  orders.forEach(order => {
    order.products.forEach(item => {
      const productId = item.product?._id?.toString();
      if (productId) {
        if (!productSales[productId]) {
          productSales[productId] = {
            name: item.product?.name,
            unitsSold: 0,
            revenue: 0
          };
        }
        productSales[productId].unitsSold += item.quantity;
        productSales[productId].revenue += item.quantity * item.price;
      }
    });
  });

  return Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
};

const getSalesByCategory = async (orders) => {
  const categorySales = {};
  
  orders.forEach(order => {
    order.products.forEach(item => {
      const category = item.product?.category || 'uncategorized';
      if (!categorySales[category]) {
        categorySales[category] = {
          category,
          sales: 0,
          units: 0,
          products: new Set()
        };
      }
      categorySales[category].sales += item.quantity * item.price;
      categorySales[category].units += item.quantity;
      categorySales[category].products.add(item.product?.name);
    });
  });

  const totalSales = Object.values(categorySales).reduce((sum, cat) => sum + cat.sales, 0);
  
  return Object.values(categorySales).map(cat => ({
    category: cat.category,
    sales: cat.sales,
    units: cat.units,
    products: cat.products.size,
    marketShare: totalSales > 0 ? (cat.sales / totalSales) * 100 : 0
  }));
};

const getSalesComparisonData = async (startDate, endDate, currentSales, currentOrders, currentAOV) => {
  if (!startDate || !endDate) {
    return { salesChange: 0, ordersChange: 0, aovChange: 0 };
  }

  const prevStartDate = new Date(new Date(startDate).getTime() - (new Date(endDate) - new Date(startDate)));
  const prevEndDate = new Date(startDate);
  
  const prevOrders = await Order.find({
    createdAt: { $gte: prevStartDate, $lte: prevEndDate }
  });
  
  const prevTotalSales = prevOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const prevTotalOrders = prevOrders.length;
  const prevAOV = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;

  return {
    salesChange: prevTotalSales > 0 ? ((currentSales - prevTotalSales) / prevTotalSales) * 100 : 0,
    ordersChange: prevTotalOrders > 0 ? ((currentOrders - prevTotalOrders) / prevTotalOrders) * 100 : 0,
    aovChange: prevAOV > 0 ? ((currentAOV - prevAOV) / prevAOV) * 100 : 0
  };
};

const calculateConversionRate = (startDate, endDate) => {
  return Math.random() * 10 + 2;
};

const getActiveUsersCount = async (startDate, endDate) => {
  return await Order.distinct('user', {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).then(users => users.length);
};

const getUserDemographics = async (users) => {
  const demographics = {
    '18-24': 0,
    '25-34': 0,
    '35-44': 0,
    '45-54': 0,
    '55+': 0
  };

  users.forEach(user => {
    const ageGroup = getRandomAgeGroup();
    demographics[ageGroup]++;
  });

  return Object.entries(demographics).map(([group, count]) => ({
    group,
    count,
    percentage: (count / users.length) * 100
  }));
};

const getRandomAgeGroup = () => {
  const groups = ['18-24', '25-34', '35-44', '45-54', '55+'];
  return groups[Math.floor(Math.random() * groups.length)];
};

const getAcquisitionSources = async (startDate, endDate) => {
  return [
    { source: 'Organic Search', type: 'organic', users: 450, conversionRate: 4.2, cpa: 0, ltv: 1250, roi: 0 },
    { source: 'Social Media', type: 'social', users: 320, conversionRate: 3.1, cpa: 15, ltv: 980, roi: 320 },
    { source: 'Email Marketing', type: 'email', users: 280, conversionRate: 5.8, cpa: 8, ltv: 1560, roi: 480 },
    { source: 'Referral', type: 'referral', users: 150, conversionRate: 8.5, cpa: 5, ltv: 2100, roi: 620 }
  ];
};

const getUserTiers = async (users) => {
  return [
    { tier: 'Bronze', criteria: '1-2 orders', users: Math.floor(users.length * 0.6), avgSessions: 2.1, avgOrders: 1.5, avgSpend: 4500, retentionRate: 45 },
    { tier: 'Silver', criteria: '3-5 orders', users: Math.floor(users.length * 0.3), avgSessions: 4.8, avgOrders: 3.8, avgSpend: 12500, retentionRate: 68 },
    { tier: 'Gold', criteria: '6+ orders', users: Math.floor(users.length * 0.1), avgSessions: 8.2, avgOrders: 7.5, avgSpend: 28500, retentionRate: 82 }
  ];
};

const getUserTier = (user) => {
  const tiers = ['Bronze', 'Silver', 'Gold'];
  return tiers[Math.floor(Math.random() * tiers.length)];
};

const getCategoryDistribution = async (products) => {
  const distribution = {};
  
  products.forEach(product => {
    const category = product.category || 'uncategorized';
    if (!distribution[category]) {
      distribution[category] = 0;
    }
    distribution[category] += product.stock * product.price;
  });

  const totalValue = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  
  return Object.entries(distribution).map(([category, value]) => ({
    category,
    value,
    percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
  }));
};

const calculateDaysOfSupply = (product) => {
  return Math.floor(product.stock / (Math.random() * 5 + 1));
};

const getInventoryMovement = async () => {
  return [
    { product: '6kg Gas Cylinder', startingStock: 150, received: 50, sold: 45, returns: 2, endingStock: 157, movement: 7 },
    { product: '12kg Gas Cylinder', startingStock: 80, received: 30, sold: 35, returns: 1, endingStock: 76, movement: -4 },
    { product: 'Gas Regulator', startingStock: 200, received: 100, sold: 85, returns: 5, endingStock: 220, movement: 20 }
  ];
};

const calculateStockTurnover = () => {
  return Math.random() * 8 + 2;
};

const calculateMRR = async (subscriptions) => {
  return subscriptions
    .filter(sub => sub.status === 'active')
    .reduce((sum, sub) => sum + sub.price, 0);
};

const calculateRenewalRate = async (startDate, endDate) => {
  return 85 + (Math.random() * 10 - 5);
};

const calculateChurnRate = async (startDate, endDate) => {
  return 8 + (Math.random() * 4 - 2);
};

const getSubscriptionTrend = async (startDate, endDate) => {
  const periods = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return periods.map(period => ({
    period,
    new: Math.floor(Math.random() * 50 + 20),
    cancelled: Math.floor(Math.random() * 15 + 5),
    renewed: Math.floor(Math.random() * 40 + 30)
  }));
};

const getPlanDistribution = async (subscriptions) => {
  const distribution = {};
  
  subscriptions.forEach(sub => {
    const plan = sub.planName;
    if (!distribution[plan]) {
      distribution[plan] = 0;
    }
    distribution[plan]++;
  });

  const total = subscriptions.length;
  
  return Object.entries(distribution).map(([plan, subscribers]) => ({
    plan,
    subscribers,
    percentage: total > 0 ? (subscribers / total) * 100 : 0
  }));
};

const getPlanPerformance = async (subscriptions) => {
  return [
    { name: 'Basic Monthly', type: 'preset', frequency: 'Monthly', subscribers: 150, mrr: 45000, churnRate: 8.5, ltv: 54000, healthScore: 82 },
    { name: 'Premium Quarterly', type: 'preset', frequency: 'Quarterly', subscribers: 75, mrr: 67500, churnRate: 5.2, ltv: 129600, healthScore: 91 },
    { name: 'Custom Plan', type: 'custom', frequency: 'Weekly', subscribers: 45, mrr: 31500, churnRate: 12.3, ltv: 25600, healthScore: 68 }
  ];
};

const getUpcomingRenewals = async () => {
  const customers = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Wilson', 'Tom Brown'];
  return customers.map((customer, index) => ({
    customer,
    email: `${customer.toLowerCase().replace(' ', '.')}@example.com`,
    plan: ['Basic Monthly', 'Premium Quarterly', 'Custom Plan'][index % 3],
    renewalDate: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000),
    daysUntilRenewal: index + 1,
    amount: [15000, 22500, 10500][index % 3],
    status: ['active', 'pending', 'active'][index % 3],
    autoRenew: index % 2 === 0
  }));
};

const getMonthlyFinancials = async (startDate, endDate) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return months.map(month => ({
    month,
    revenue: Math.floor(Math.random() * 500000 + 300000),
    expenses: Math.floor(Math.random() * 350000 + 200000),
    profitMargin: Math.random() * 30 + 10
  }));
};

const generateIncomeStatement = (revenue, expenses) => {
  return [
    { category: 'Product Sales', amount: revenue * 0.85, percentage: 85 },
    { category: 'Service Revenue', amount: revenue * 0.15, percentage: 15 },
    { category: 'Cost of Goods Sold', amount: expenses * 0.4, percentage: 40, trend: -2.5 },
    { category: 'Operating Expenses', amount: expenses * 0.35, percentage: 35, trend: 1.2 },
    { category: 'Marketing', amount: expenses * 0.15, percentage: 15, trend: -0.8 },
    { category: 'Administrative', amount: expenses * 0.1, percentage: 10, trend: 0.5 }
  ];
};

const generateExpenseBreakdown = (totalExpenses) => {
  return [
    { category: 'Inventory Costs', amount: totalExpenses * 0.4, budget: totalExpenses * 0.38, variance: 5.3, status: 'Over Budget' },
    { category: 'Employee Salaries', amount: totalExpenses * 0.25, budget: totalExpenses * 0.26, variance: -3.8, status: 'Under Budget' },
    { category: 'Marketing', amount: totalExpenses * 0.15, budget: totalExpenses * 0.14, variance: 7.1, status: 'Over Budget' },
    { category: 'Utilities & Rent', amount: totalExpenses * 0.1, budget: totalExpenses * 0.1, variance: 0, status: 'On Budget' },
    { category: 'Software & Tools', amount: totalExpenses * 0.05, budget: totalExpenses * 0.06, variance: -16.7, status: 'Under Budget' },
    { category: 'Other Expenses', amount: totalExpenses * 0.05, budget: totalExpenses * 0.06, variance: -16.7, status: 'Under Budget' }
  ];
};

const calculateFinancialRatios = (revenue, expenses, netProfit) => {
  return [
    { name: 'Gross Profit Margin', value: `${((revenue - expenses * 0.4) / revenue * 100).toFixed(1)}%`, description: 'Percentage of revenue after COGS', trend: 2.1, benchmark: '35%' },
    { name: 'Operating Margin', value: `${(netProfit / revenue * 100).toFixed(1)}%`, description: 'Percentage of operating profit', trend: 1.8, benchmark: '15%' },
    { name: 'Return on Investment', value: `${(netProfit / expenses * 100).toFixed(1)}%`, description: 'Profit generated per investment', trend: 3.2, benchmark: '20%' },
    { name: 'Current Ratio', value: '2.8', description: 'Ability to pay short-term obligations', trend: 0.5, benchmark: '2.0' },
    { name: 'Debt to Equity', value: '0.4', description: 'Financial leverage ratio', trend: -0.2, benchmark: '0.6' }
  ];
};

const calculateARPU = (subscriptions) => {
  const activeSubs = subscriptions.filter(sub => sub.status === 'active');
  const totalRevenue = activeSubs.reduce((sum, sub) => sum + sub.price, 0);
  return activeSubs.length > 0 ? totalRevenue / activeSubs.length : 0;
};

const getRecentActivities = async () => {
  return [
    { icon: 'fa-shopping-cart', message: 'New order #ORD-1234 placed', time: '2 mins ago', user: 'John Doe', type: 'success' },
    { icon: 'fa-user-plus', message: 'New user registration', time: '5 mins ago', user: 'System', type: 'info' },
    { icon: 'fa-truck', message: 'Order #ORD-1230 delivered', time: '15 mins ago', user: 'Delivery Team', type: 'success' },
    { icon: 'fa-exclamation-triangle', message: 'Low stock alert for 6kg cylinders', time: '30 mins ago', user: 'Inventory System', type: 'warning' }
  ];
};

const getSystemAlerts = async () => {
  return [
    { 
      title: 'High Server Load', 
      message: 'CPU usage above 85% for 15 minutes', 
      severity: 'warning', 
      timestamp: '10 minutes ago' 
    },
    { 
      title: 'Database Backup Completed', 
      message: 'Nightly backup completed successfully', 
      severity: 'info', 
      timestamp: '2 hours ago' 
    }
  ];
};

const getProductIdsByCategory = async (category) => {
  const products = await Product.find({ category }).select('_id');
  return products.map(p => p._id);
};

const getDailyUserData = async (startDate, endDate) => {
  // Mock implementation
  return [];
};

const generateExportData = async (reportType, config) => {
  // This would generate data for export based on report type
  switch (reportType) {
    case 'sales':
      return { type: 'sales', data: 'Sales export data' };
    case 'users':
      return { type: 'users', data: 'Users export data' };
    case 'inventory':
      return { type: 'inventory', data: 'Inventory export data' };
    case 'subscriptions':
      return { type: 'subscriptions', data: 'Subscriptions export data' };
    case 'financial':
      return { type: 'financial', data: 'Financial export data' };
    default:
      return { type: 'unknown', data: [] };
  }
};

const convertToCSV = (data, reportType) => {
  // Basic CSV conversion implementation
  const headers = ['Report Type', 'Data'];
  const rows = [[reportType, JSON.stringify(data)]];
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');

  return csvContent;
};
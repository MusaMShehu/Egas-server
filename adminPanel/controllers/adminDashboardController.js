const User = require('../../models/User');
const Order = require('../../models/Order');
const Subscription = require('../../models/Subscription');
const ActivityLog = require('../../models/ActivityLog');
const asyncHandler = require('../../middleware/async');
const ErrorResponse = require('../../utils/errorResponse');

// Helper function to calculate growth percentage
const calculateGrowth = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

// Helper function to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  
  const lastYear = new Date(today);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  
  return { today, yesterday, lastWeek, lastMonth, lastYear };
};

// @desc    Get dashboard statistics
// @route   GET /api/v1/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const { today, yesterday, lastWeek, lastMonth, lastYear } = getDateRanges();

  // Total Users
  const totalUsers = await User.countDocuments();
  const totalUsersYesterday = await User.countDocuments({
    createdAt: { $lt: today }
  });
  const totalUsersLastWeek = await User.countDocuments({
    createdAt: { $lt: lastWeek }
  });
  const totalUsersLastMonth = await User.countDocuments({
    createdAt: { $lt: lastMonth }
  });
  const totalUsersLastYear = await User.countDocuments({
    createdAt: { $lt: lastYear }
  });

  // Active Users (users with activity in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const activeUsers = await User.countDocuments({
    lastActive: { $gte: thirtyDaysAgo }
  });
  
  const activeUsersYesterday = await User.countDocuments({
    lastActive: { $gte: new Date(yesterday.getTime() - 30 * 24 * 60 * 60 * 1000), $lt: yesterday }
  });

  // Active Subscriptions
  const activeSubscriptions = await Subscription.countDocuments({
    status: 'active',
    endDate: { $gte: new Date() }
  });
  
  const activeSubscriptionsYesterday = await Subscription.countDocuments({
    status: 'active',
    endDate: { $gte: yesterday },
    updatedAt: { $lt: today }
  });

  // Total Orders (completed payment and processing status)
  const totalOrders = await Order.countDocuments({
    paymentStatus: 'completed',
    orderStatus: 'processing'
  });
  
  const totalOrdersYesterday = await Order.countDocuments({
    paymentStatus: 'completed',
    orderStatus: 'processing',
    createdAt: { $lt: today }
  });

  // Today's Deliveries
  const todaysDeliveries = await Order.countDocuments({
    deliveryDate: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
    orderStatus: 'delivered'
  });
  
  const yesterdaysDeliveries = await Order.countDocuments({
    deliveryDate: { $gte: yesterday, $lt: today },
    orderStatus: 'delivered'
  });

  // Today's Revenue
  const todaysRevenueResult = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'completed',
        createdAt: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalAmount' }
      }
    }
  ]);
  
  const yesterdaysRevenueResult = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'completed',
        createdAt: { $gte: yesterday, $lt: today }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$totalAmount' }
      }
    }
  ]);

  const todaysRevenue = todaysRevenueResult[0]?.total || 0;
  const yesterdaysRevenue = yesterdaysRevenueResult[0]?.total || 0;

  // Calculate growth percentages
  const stats = {
    totalUsers: {
      value: totalUsers,
      growth: {
        day: calculateGrowth(totalUsers, totalUsersYesterday),
        week: calculateGrowth(totalUsers, totalUsersLastWeek),
        month: calculateGrowth(totalUsers, totalUsersLastMonth),
        year: calculateGrowth(totalUsers, totalUsersLastYear)
      }
    },
    activeUsers: {
      value: activeUsers,
      growth: {
        day: calculateGrowth(activeUsers, activeUsersYesterday),
        week: calculateGrowth(activeUsers, await User.countDocuments({
          lastActive: { $gte: new Date(lastWeek.getTime() - 30 * 24 * 60 * 60 * 1000), $lt: lastWeek }
        })),
        month: calculateGrowth(activeUsers, await User.countDocuments({
          lastActive: { $gte: new Date(lastMonth.getTime() - 30 * 24 * 60 * 60 * 1000), $lt: lastMonth }
        })),
        year: calculateGrowth(activeUsers, await User.countDocuments({
          lastActive: { $gte: new Date(lastYear.getTime() - 30 * 24 * 60 * 60 * 1000), $lt: lastYear }
        }))
      }
    },
    activeSubscriptions: {
      value: activeSubscriptions,
      growth: {
        day: calculateGrowth(activeSubscriptions, activeSubscriptionsYesterday),
        week: calculateGrowth(activeSubscriptions, await Subscription.countDocuments({
          status: 'active',
          endDate: { $gte: lastWeek },
          updatedAt: { $lt: lastWeek }
        })),
        month: calculateGrowth(activeSubscriptions, await Subscription.countDocuments({
          status: 'active',
          endDate: { $gte: lastMonth },
          updatedAt: { $lt: lastMonth }
        })),
        year: calculateGrowth(activeSubscriptions, await Subscription.countDocuments({
          status: 'active',
          endDate: { $gte: lastYear },
          updatedAt: { $lt: lastYear }
        }))
      }
    },
    totalOrders: {
      value: totalOrders,
      growth: {
        day: calculateGrowth(totalOrders, totalOrdersYesterday),
        week: calculateGrowth(totalOrders, await Order.countDocuments({
          paymentStatus: 'completed',
          orderStatus: 'processing',
          createdAt: { $lt: lastWeek }
        })),
        month: calculateGrowth(totalOrders, await Order.countDocuments({
          paymentStatus: 'completed',
          orderStatus: 'processing',
          createdAt: { $lt: lastMonth }
        })),
        year: calculateGrowth(totalOrders, await Order.countDocuments({
          paymentStatus: 'completed',
          orderStatus: 'processing',
          createdAt: { $lt: lastYear }
        }))
      }
    },
    todaysDeliveries: {
      value: todaysDeliveries,
      growth: {
        day: calculateGrowth(todaysDeliveries, yesterdaysDeliveries),
        week: calculateGrowth(todaysDeliveries, await Order.countDocuments({
          deliveryDate: { $gte: lastWeek, $lt: new Date(lastWeek.getTime() + 24 * 60 * 60 * 1000) },
          orderStatus: 'delivered'
        })),
        month: calculateGrowth(todaysDeliveries, await Order.countDocuments({
          deliveryDate: { $gte: lastMonth, $lt: new Date(lastMonth.getTime() + 24 * 60 * 60 * 1000) },
          orderStatus: 'delivered'
        })),
        year: calculateGrowth(todaysDeliveries, await Order.countDocuments({
          deliveryDate: { $gte: lastYear, $lt: new Date(lastYear.getTime() + 24 * 60 * 60 * 1000) },
          orderStatus: 'delivered'
        }))
      }
    },
    todaysRevenue: {
      value: todaysRevenue,
      growth: {
        day: calculateGrowth(todaysRevenue, yesterdaysRevenue),
        week: calculateGrowth(todaysRevenue, (await Order.aggregate([
          {
            $match: {
              paymentStatus: 'completed',
              createdAt: { $gte: lastWeek, $lt: new Date(lastWeek.getTime() + 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' }
            }
          }
        ]))[0]?.total || 0),
        month: calculateGrowth(todaysRevenue, (await Order.aggregate([
          {
            $match: {
              paymentStatus: 'completed',
              createdAt: { $gte: lastMonth, $lt: new Date(lastMonth.getTime() + 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' }
            }
          }
        ]))[0]?.total || 0),
        year: calculateGrowth(todaysRevenue, (await Order.aggregate([
          {
            $match: {
              paymentStatus: 'completed',
              createdAt: { $gte: lastYear, $lt: new Date(lastYear.getTime() + 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' }
            }
          }
        ]))[0]?.total || 0)
      }
    }
  };

  res.status(200).json({
    success: true,
    data: {
      stats
    }
  });
});

// @desc    Get recent activities
// @route   GET /api/v1/dashboard/recent-activities
// @access  Private/Admin
exports.getRecentActivities = asyncHandler(async (req, res, next) => {
  const activities = await ActivityLog.find()
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(10);

  res.status(200).json({
    success: true,
    count: activities.length,
    data: {
      activities
    }
  });
});

// @desc    Get chart data for analytics
// @route   GET /api/v1/dashboard/chart-data
// @access  Private/Admin
exports.getChartData = asyncHandler(async (req, res, next) => {
  const { period = 'month' } = req.query;
  let groupByFormat, startDate;

  switch (period) {
    case 'week':
      groupByFormat = '%Y-%m-%d';
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'year':
      groupByFormat = '%Y-%m';
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case 'month':
    default:
      groupByFormat = '%Y-%m-%d';
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  // Revenue chart data
  const revenueData = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'completed',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupByFormat,
            date: '$createdAt'
          }
        },
        revenue: { $sum: '$totalAmount' },
        orders: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // User registration data
  const userData = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: groupByFormat,
            date: '$createdAt'
          }
        },
        users: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      revenue: revenueData,
      users: userData,
      period
    }
  });
});

// @desc    Get dashboard overview with combined data
// @route   GET /api/v1/dashboard/overview
// @access  Private/Admin
exports.getDashboardOverview = asyncHandler(async (req, res, next) => {
  // Get stats, recent activities, and chart data in parallel
  const [stats, recentActivities, chartData] = await Promise.all([
    // We'll reuse the stats logic but call the function directly
    (async () => {
      const { today, yesterday, lastWeek, lastMonth, lastYear } = getDateRanges();
      
      const totalUsers = await User.countDocuments();
      const activeSubscriptions = await Subscription.countDocuments({
        status: 'active',
        endDate: { $gte: new Date() }
      });
      const totalOrders = await Order.countDocuments({
        paymentStatus: 'completed',
        orderStatus: 'processing'
      });

      // Today's Revenue
      const todaysRevenueResult = await Order.aggregate([
        {
          $match: {
            paymentStatus: 'completed',
            createdAt: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ]);

      return {
        totalUsers,
        activeSubscriptions,
        totalOrders,
        todaysRevenue: todaysRevenueResult[0]?.total || 0
      };
    })(),
    
    ActivityLog.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(5),
    
    // Simple chart data for overview
    Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed',
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ])
  ]);

  res.status(200).json({
    success: true,
    data: {
      stats,
      recentActivities,
      weeklyRevenue: chartData
    }
  });
});
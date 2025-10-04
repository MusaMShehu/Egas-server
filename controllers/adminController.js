const express = require('express');
const route = express.Router();
// const auth = require('../middlewares/auth');
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
// const Subscription = require('../models/Subscription');
const Subscription = require('../models/SubscriptionPlan');
const SupportTicket = require('../models/SupportTicket');
const asyncHandler = require('../middleware/async');

// // Middleware to check admin role
// const adminAuth = (req, res, next) => {
//     if (req.user.role !== 'admin') {
//         return res.status(403).json({ msg: 'Admin access required' });
//     }
//     next();
// };

// @route   GET api/admin/dashboard
// @desc    Get admin dashboard data
// @access  Private (Admin)
exports.getAdminDashboard = async (req, res) => {
    try {
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get today's orders
        const todaysOrders = await Order.find({
            createdAt: { $gte: today, $lt: tomorrow }
        }).countDocuments();
        
        // Get active subscriptions
        const activeSubscriptions = await Subscription.find({
            status: 'active'
        }).countDocuments();
        
        // Get today's revenue
        const todaysRevenue = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: today, $lt: tomorrow },
                    status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' }
                }
            }
        ]);
        
        // Get inventory levels
        const inventory = await Product.aggregate([
            {
                $group: {
                    _id: null,
                    totalStock: { $sum: '$stock' },
                    totalCapacity: { $sum: '$capacity' }
                }
            }
        ]);
        
        // Get recent orders
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name');
        
        // Get staff performance
        const staffPerformance = await Order.aggregate([
            {
                $match: {
                    status: 'delivered',
                    deliveredAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
                }
            },
            {
                $group: {
                    _id: '$assignedTo',
                    completed: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'staff'
                }
            },
            {
                $unwind: '$staff'
            },
            {
                $project: {
                    staffName: '$staff.name',
                    completed: 1,
                    efficiency: {
                        $divide: ['$completed', 20] // Assuming 20 is the target
                    }
                }
            }
        ]);
        
        res.json({
            todaysOrders,
            activeSubscriptions,
            todaysRevenue: todaysRevenue.length > 0 ? todaysRevenue[0].total : 0,
            inventoryLevel: inventory.length > 0 ? 
                Math.round((inventory[0].totalStock / inventory[0].totalCapacity) * 100) : 0,
            recentOrders,
            staffPerformance
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/admin/users
// @desc    Get all users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, role } = req.query;
        
        const query = {};
        if (role) query.role = role;
        
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const count = await User.countDocuments(query);
        
        res.json({
            users,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/admin/users/:id
// @desc    Update user (suspend/activate/change role)
// @access  Private (Admin)
exports.updateUserStatus = async (req, res) => {
    try {
        const { status, role } = req.body;
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        
        // Prevent modifying other admins
        if (user.role === 'admin' && req.user.id !== user._id.toString()) {
            return res.status(403).json({ msg: 'Cannot modify other admins' });
        }
        
        if (status) user.status = status;
        if (role) user.role = role;
        
        await user.save();
        
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/admin/orders
// @desc    Get all orders with filters
// @access  Private (Admin)
exports.getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, from, to } = req.query;
        
        const query = {};
        if (status) query.status = status;
        
        if (from && to) {
            query.createdAt = {
                $gte: new Date(from),
                $lte: new Date(to)
            };
        }
        
        const orders = await Order.find(query)
            .populate('user', 'name email')
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const count = await Order.countDocuments(query);
        
        res.json({
            orders,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/admin/orders/:id/assign
// @desc    Assign order to staff
// @access  Private (Admin)
exports.assignOrders = async (req, res) => {
    try {
        const { staffId } = req.body;
        
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        
        const staff = await User.findById(staffId);
        if (!staff || staff.role !== 'staff') {
            return res.status(400).json({ msg: 'Invalid staff member' });
        }
        
        order.assignedTo = staffId;
        order.status = 'assigned';
        await order.save();
        
        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/admin/products
// @desc    Get all products
// @access  Private (Admin)
exports.getAllProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ name: 1 });
        res.json(products);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   POST api/admin/products
// @desc    Create new product
// @access  Private (Admin)
exports.createNewProduct = async (req, res) => {
    try {
        const { name, description, price, stock, capacity, type } = req.body;
        
        const newProduct = new Product({
            name,
            description,
            price,
            stock,
            capacity,
            type
        });
        
        const product = await newProduct.save();
        
        res.json(product);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/admin/products/:id
// @desc    Update product
// @access  Private (Admin)
exports.updateProduct = async (req, res) => {
    try {
        const { name, description, price, stock } = req.body;
        
        let product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }
        
        if (name) product.name = name;
        if (description) product.description = description;
        if (price) product.price = price;
        if (stock) product.stock = stock;
        
        await product.save();
        
        res.json(product);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/admin/subscriptions
// @desc    Get all subscriptions
// @access  Private (Admin)
exports.getAllSubscriptions = async (req, res) => {
    try {
        const subscriptions = await Subscription.find()
            .populate('user', 'name email')
            .populate('product', 'name price')
            .sort({ nextDeliveryDate: 1 });
            
        res.json(subscriptions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/admin/subscriptions/:id
// @desc    Update subscription
// @access  Private (Admin)
exports.updateUserSubscription = async (req, res) => {
    try {
        const { status, nextDeliveryDate } = req.body;
        
        let subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ msg: 'Subscription not found' });
        }
        
        if (status) subscription.status = status;
        if (nextDeliveryDate) subscription.nextDeliveryDate = nextDeliveryDate;
        
        await subscription.save();
        
        res.json(subscription);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createNewUser = asyncHandler(async (req, res, next) => {
  const user = await User.create(req.body);

  res.status(201).json({
    success: true,
    data: user,
  });
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Upload photo for user
// @route   PUT /api/v1/users/:id/photo
// @access  Private
exports.uploadUserPhoto = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`No user with the id of ${req.params.id}`, 404));
  }

  // Make sure user is updating their own photo or admin
  if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(`User ${req.user.id} is not authorized to update this user`, 401)
    );
  }

  if (!req.files) {
    return next(new ErrorResponse(`Please upload a file`, 400));
  }

  const file = req.files.file;

  // Check if the file is an image
  if (!file.mimetype.startsWith('image')) {
    return next(new ErrorResponse(`Please upload an image file`, 400));
  }

  // Check file size
  if (file.size > Number(process.env.MAX_FILE_UPLOAD)) {
    return next(
      new ErrorResponse(
        `Please upload an image less than ${process.env.MAX_FILE_UPLOAD} bytes`,
        400
      )
    );
  }

  // Create custom filename
  file.name = `photo_${user._id}${path.parse(file.name).ext}`;

  // Move file
  file.mv(`${process.env.FILE_UPLOAD_PATH}/users/${file.name}`, async (err) => {
    if (err) {
      console.error(err);
      return next(new ErrorResponse(`Problem with file upload`, 500));
    }

    await User.findByIdAndUpdate(req.params.id, { profilePic: file.name });

    res.status(200).json({
      success: true,
      data: file.name,
    });
  });
});


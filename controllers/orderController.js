const axios = require("axios");
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";


// @desc    Get all orders
// @route   GET /api/v1/orders
// @route   GET /api/v1/users/:userId/orders
// @access  Private
// @desc    Get all orders for a user (or all if admin)
// @route   GET /api/v1/orders
// @access  Private
exports.getOrders = asyncHandler(async (req, res, next) => {
  let query;

  // If the logged-in user is admin, fetch all orders
  if (req.user.role === 'admin') {
    query = Order.find()
      .populate('products.product')
      .populate('user', 'firstName lastName email phone');
  } else {
    // Otherwise, only fetch orders for that user
    query = Order.find({ user: req.user.id })
      .populate('products.product')
      // .populate('user', 'firstName lastName email phone');
  }

  const orders = await query;

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});


// @desc    Get single order
// @route   GET /api/v1/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params._id)
    .populate('products.product')
    .populate('user', 'firstName lastName email phone');

  if (!order) {
    return next(
      new ErrorResponse(`No order with the id of ${req.params._id}`, 404)
    );
  }

  // Make sure user is order owner or admin
  if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user._id} is not authorized to access this order`,
        401
      )
    );
  }

  res.status(200).json({
    success: true,
    data: order
  });
});

// @desc    Create order
// @route   POST /api/v1/orders
// @access  Private
/**
 * @desc    Create new order (Wallet / Paystack / COD supported)
 * @route   POST /api/v1/orders
 * @access  Private
 */
exports.createOrder = asyncHandler(async (req, res, next) => {
  if (!req.body) req.body = {};
  req.body.user = req.user._id;

  const {
    products: items,
    deliveryOption,
    address,
    city,
    postalCode,
    country,
    paymentMethod, // <- NEW: pass "wallet", "paystack", or "cod"
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new ErrorResponse("Please provide at least one product", 400));
  }

  let totalAmount = 0;
  const products = [];

  // ✅ Validate products & stock
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) {
      return next(new ErrorResponse(`No product with id ${item.product}`, 404));
    }
    if (product.stock < item.quantity) {
      return next(
        new ErrorResponse(
          `Not enough stock for ${product.name}. Available: ${product.stock}`,
          400
        )
      );
    }
    totalAmount += product.price * item.quantity;
    products.push({
      product: product._id,
      quantity: item.quantity,
      price: product.price,
    });
  }

  // ✅ Add delivery fee
  let deliveryFee = 0;
  if (deliveryOption === "express") {
    deliveryFee = 1000;
    totalAmount += deliveryFee;
  }

  // ✅ Build order data
  req.body.deliveryAddress = `${address}, ${city}, ${postalCode}, ${country}`;
  req.body.orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  req.body.products = products;
  req.body.totalAmount = totalAmount;
  req.body.deliveryFee = deliveryFee;
  req.body.isPaid = false;
  req.body.paymentMethod = paymentMethod || "cod";

  // ✅ Create order in DB
  const order = await Order.create(req.body);

  // ✅ Reduce stock
  for (const item of products) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity },
    });
  }

  // 🔑 Handle Paystack payment initialization
  if (paymentMethod === "paystack") {
    try {
      const amountInKobo = Math.round(order.totalAmount * 100);

      const response = await axios.post(
        PAYSTACK_INITIALIZE_URL,
        {
          email: req.user.email,
          amount: amountInKobo,
          reference: `PSK-${order._id}-${Date.now()}`,
          callback_url: `${process.env.FRONTEND_URL}/payment/callback/${order._id}`,
        },
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        }
      );

      const data = response.data.data;

      order.paymentResult = {
        reference: data.reference,
        status: "pending",
      };
      await order.save();

      return res.status(201).json({
        success: true,
        data: order,
        paystack: {
          authorization_url: data.authorization_url,
          reference: data.reference,
        },
      });
    } catch (err) {
      console.error("Paystack init error:", err.response?.data || err.message);
      return next(new ErrorResponse("Unable to initialize Paystack transaction", 500));
    }
  }

  // ✅ COD or Wallet (wallet flow handled in /pay/wallet endpoint)
  res.status(201).json({
    success: true,
    data: order,
  });
});

/**
 * @desc    Update order (Admin only)
 * @route   PUT /api/v1/orders/:id
 * @access  Private/Admin
 */
exports.updateOrder = asyncHandler(async (req, res, next) => {
  let order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse(`No order with the id of ${req.params.id}`, 404));
  }

  // Authorization (optional: uncomment if needed)
  // if (req.user.role !== "admin") {
  //   return next(new ErrorResponse("Not authorized to update order", 401));
  // }

  order = await Order.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: order,
  });
});

// @desc    Delete order
// @route   DELETE /api/v1/orders/:id
// @access  Private/Admin
exports.deleteOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params._id);

  if (!order) {
    return next(
      new ErrorResponse(`No order with the id of ${req.params._id}`, 404)
    );
  }

  // if (req.user.role !== 'admin') {
  //   return next(
  //     new ErrorResponse(
  //       `User ${req.user._id} is not authorized to delete this order`,
  //       401
  //     )
  //   );
  // }

  await order.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get order statistics
// @route   GET /api/v1/orders/stats
// @access  Private/Admin
exports.getOrderStats = asyncHandler(async (req, res, next) => {
  const stats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: stats
  });
});

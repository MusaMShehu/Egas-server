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
    paymentMethod, // "wallet", "paystack", or "cod"
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
      productName: product.name, // Add product name like in subscription
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
  const deliveryAddress = `${address}, ${city}, ${postalCode}, ${country}`;
  const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Create order in DB first (with pending status for paystack)
  const orderData = {
    user: req.user._id,
    orderId,
    products,
    totalAmount,
    deliveryFee,
    deliveryAddress,
    deliveryOption: deliveryOption || 'standard',
    paymentMethod: paymentMethod || "cod",
    paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
    orderStatus: "pending",
    isPaid: false
  };

  const order = await Order.create(orderData);

  // ✅ Handle Paystack payment initialization (similar to subscription)
  if (paymentMethod === "paystack") {
    try {
      const response = await paystack.post('/transaction/initialize', {
        email: req.user.email,
        amount: Math.round(totalAmount * 100), // Convert to kobo
        metadata: { 
          userId: req.user._id,
          orderId: order._id,
          type: 'order'
        },
        callback_url: `${process.env.FRONTEND_URL}/orders/verify`,
        webhook_url: `${process.env.BASE_URL}/api/v1/orders/webhook`
      });

      const { authorization_url, reference } = response.data.data;

      // Update order with payment reference
      order.paymentResult = {
        reference: reference,
        status: "pending",
        gateway: "paystack"
      };
      order.reference = reference;
      await order.save();

      return res.status(201).json({
        success: true,
        data: order,
        authorization_url,
        reference,
        message: "Order created. Redirect to complete payment."
      });

    } catch (error) {
      console.error('Paystack Order Error:', error.response?.data || error.message);
      // Delete the order if payment initialization fails
      await Order.findByIdAndDelete(order._id);
      return next(new ErrorResponse('Payment initialization failed: ' + (error.response?.data?.message || error.message), 500));
    }
  }

  // ✅ Handle Wallet payment
  if (paymentMethod === "wallet") {
    try {
      const user = await User.findById(req.user._id);
      
      if (!user) {
        await Order.findByIdAndDelete(order._id);
        return next(new ErrorResponse('User not found', 404));
      }

      if (user.walletBalance < totalAmount) {
        await Order.findByIdAndDelete(order._id);
        return next(new ErrorResponse('Insufficient wallet balance', 400));
      }

      // Deduct from wallet
      user.walletBalance -= totalAmount;
      await user.save();

      // Update order status
      order.paymentStatus = 'completed';
      order.orderStatus = 'processing';
      order.isPaid = true;
      order.paidAt = new Date();
      order.paymentResult = {
        status: "completed",
        gateway: "wallet",
        paidAt: new Date()
      };
      await order.save();

      // Reduce stock for wallet payments
      for (const item of products) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: -item.quantity },
        });
      }

      return res.status(201).json({
        success: true,
        data: order,
        message: "Order created and paid with wallet successfully"
      });

    } catch (error) {
      console.error('Wallet Payment Error:', error);
      await Order.findByIdAndDelete(order._id);
      return next(new ErrorResponse('Wallet payment failed', 500));
    }
  }

  // ✅ Handle COD (Cash on Delivery)
  if (paymentMethod === "cod" || !paymentMethod) {
    // For COD, just create the order without payment
    // Reduce stock for COD orders as well
    for (const item of products) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    return res.status(201).json({
      success: true,
      data: order,
      message: "Order created successfully (Cash on Delivery)"
    });
  }

  // If we get here, it's an unknown payment method
  await Order.findByIdAndDelete(order._id);
  return next(new ErrorResponse('Unknown payment method', 400));
});

// @desc    Verify order payment
// @route   GET /api/v1/orders/verify
// @access  Private
exports.verifyOrderPayment = asyncHandler(async (req, res, next) => {
  const { reference } = req.query;
  if (!reference) return next(new ErrorResponse('Reference missing', 400));

  let response;
  try {
    response = await paystack.get(`/transaction/verify/${reference}`);
  } catch (error) {
    console.error('Paystack Verification Error:', error.response?.data || error.message);
    return next(new ErrorResponse('Payment verification failed', 500));
  }

  const data = response.data.data;

  if (data.status !== 'success') {
    return next(new ErrorResponse('Payment not successful', 400));
  }

  // Process successful payment
  await processSuccessfulOrderPayment(data);

  const order = await Order.findOne({ reference })
    .populate('products.product')
    .populate('user', 'firstName lastName email phone');

  if (!order) {
    return next(new ErrorResponse('Order not found after verification', 404));
  }

  return res.status(200).json({
    success: true,
    message: "Payment verified successfully",
    orderId: order._id,
    data: order,
  });
});

// @desc    Order Webhook Handler
// @route   POST /api/v1/orders/webhook
// @access  Public
exports.handleOrderWebhook = asyncHandler(async (req, res, next) => {
  // Validate webhook signature (similar to subscription webhook)
  const signature = req.headers['x-paystack-signature'];
  if (!signature) {
    console.error('Webhook signature missing');
    return res.status(400).json({ status: false, message: 'Signature missing' });
  }

  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== signature) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ status: false, message: 'Invalid signature' });
  }

  const event = req.body;
  console.log('Order Webhook received:', event.event, 'Reference:', event.data?.reference);

  // Immediately respond to Paystack
  res.status(200).json({ status: true, message: 'Webhook received' });

  // Process the webhook event asynchronously
  try {
    if (event.event === 'charge.success') {
      await handleSuccessfulOrderCharge(event.data);
    }
  } catch (error) {
    console.error('Order Webhook processing error:', error);
  }
});

// Process successful order charge
const handleSuccessfulOrderCharge = async (data) => {
  try {
    const { reference, metadata, status } = data;
    
    if (status === 'success') {
      await processSuccessfulOrderPayment(data);
    }
  } catch (error) {
    console.error('Error handling successful order charge:', error);
  }
};

// Process successful order payment
const processSuccessfulOrderPayment = async (data) => {
  const { reference, metadata, amount } = data;
  const { userId, orderId, type } = metadata;

  if (type !== 'order') return;

  const order = await Order.findOne({
    $or: [{ reference }, { 'paymentResult.reference': reference }],
    paymentStatus: "pending",
  });

  if (!order) {
    console.error("Order not found for reference:", reference);
    return;
  }

  // Update order status
  order.paymentStatus = "completed";
  order.orderStatus = "processing";
  order.isPaid = true;
  order.paidAt = new Date();
  
  if (!order.paymentResult) {
    order.paymentResult = {};
  }
  
  order.paymentResult.status = "completed";
  order.paymentResult.gateway = "paystack";
  order.paymentResult.paidAt = new Date();
  order.paymentResult.amount = amount / 100;
  
  await order.save();

  // Reduce stock for successful payments
  for (const item of order.products) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity },
    });
  }

  console.log("Order payment completed successfully:", order._id);
};

// @desc    Pay with wallet for existing order
// @route   POST /api/v1/orders/:id/pay/wallet
// @access  Private
exports.payOrderWithWallet = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse(`No order with the id of ${req.params.id}`, 404));
  }

  // Make sure user is order owner
  if (order.user.toString() !== req.user._id.toString()) {
    return next(
      new ErrorResponse(
        `User ${req.user._id} is not authorized to pay for this order`,
        401
      )
    );
  }

  if (order.isPaid) {
    return next(new ErrorResponse('Order is already paid', 400));
  }

  const user = await User.findById(req.user._id);
  
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (user.walletBalance < order.totalAmount) {
    return next(new ErrorResponse('Insufficient wallet balance', 400));
  }

  // Deduct from wallet
  user.walletBalance -= order.totalAmount;
  await user.save();

  // Update order status
  order.paymentStatus = 'completed';
  order.orderStatus = 'processing';
  order.isPaid = true;
  order.paidAt = new Date();
  order.paymentMethod = 'wallet';
  order.paymentResult = {
    status: "completed",
    gateway: "wallet",
    paidAt: new Date()
  };
  await order.save();

  // Reduce stock
  for (const item of order.products) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity },
    });
  }

  res.status(200).json({
    success: true,
    data: order,
    message: "Order paid successfully with wallet"
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

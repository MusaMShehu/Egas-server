require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const compression = require("compression");
const cookieParser = require("cookie-parser"); // Add this
const { createServer } = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const morgan = require("morgan");

// Config imports
const database = require("./config/db");
const { redisClient, createCacheMiddleware } = require("./config/redis");
const { queue, connection } = require("./services/notifications/notificationQueue");

// Middleware imports
const security = require("./middleware/security");
const errorHandler = require("./middleware/error");
const { protect, authorize, optionalAuth } = require('./middleware/auth');
const {
  validate,
  validateObjectId,
  schemas,
} = require("./middleware/validation");
const { responseMiddleware } = require("./utils/apiResponse");
const logger = require("./utils/logger");

// Route imports
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const subscriptionPlanRoutes = require("./routes/SubscriptionPlanRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const paymentRoutes = require("./routes/PaymentRoutes");
const supportRoutes = require("./routes/supportRoutes");
const settingsRoutes = require("./routes/SettingsRoutes");
const dashboardRoutes = require("./routes/userDashboardRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const userHistoryRoutes = require("./routes/userHistoryRoutes");
const smsRoutes = require("./routes/smsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerCylinderRoutes = require('./routes/customerCylinderRoutes');
const notificationRoutes = require("./routes/notificationRoutes");


// Admin panel routes
const adminDashboard = require("./adminPanel/routes/adminDashboardRoutes");
const adminUserManagement = require("./adminPanel/routes/userManagementRoutes");
const adminSubscriptionManagement = require("./adminPanel/routes/subscriptionManagementRoutes");
const adminOrderManagement = require("./adminPanel/routes/orderManagementRoutes");
const adminReportManagement = require("./adminPanel/routes/reportManagementRoutes");
const adminDeliveryManagement = require("./adminPanel/routes/deliveryManagementRoutes");
const adminProductManagement = require("./adminPanel/routes/productManagementRoutes");
const adminSubscriptionPlanManagement = require("./adminPanel/routes/subsPlanManagementRoutes");
const adminSupportManagement = require("./adminPanel/routes/supportManagementRoutes");
const adminConfigRoutes = require('./adminPanel/routes/adminConfigRoutes');
const agentCylinderRoutes = require('./routes/agentCylinderRoutes');
const agentRefillRoutes = require('./routes/agentRefillRoutes');
const adminRefillRoutes = require('./adminPanel/routes/adminRefillRoutes');
const adminCylinderRoutes = require('./adminPanel/routes/adminCylinderRoutes');
const adminRemnantRoutes = require('./adminPanel/routes/adminRemnantRoutes');
const adminDisputeRoutes = require('./adminPanel/routes/adminDisputeRoutes');
const adminSettlementRoutes = require('./adminPanel/routes/adminSettlementRoutes');

// REFILLING PLANT
const plantAuthRoutes = require('./routes/plantAuthRoutes');
const adminPlantRoutes = require('./routes/adminPlantRoutes');
const plantRoutes = require('./routes/plantRoutes');

// Initialize app
const app = express();
const httpServer = createServer(app);

// Cookie parser middleware - MUST be before routes
app.use(cookieParser());

// Socket.IO setup for real-time features
const io = new Server(httpServer, {
  cors: {
    origin: security.corsOptions.origin,
    credentials: true, // Important for cookies
  },
  transports: ["websocket", "polling"],
});
app.set('io', io);

// Security middleware
app.use(security.helmet);
app.use(security.cors);
app.use(compression());

// Request parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined", { stream: logger.stream }));
}



// Security sanitization
// NOTE: mongoSanitize is applied to body only, not query (to avoid breaking operators)
// app.use(security.mongoSanitize);
// app.use(security.xss);
// app.use(security.hpp);
// app.use(security.sanitizeInput);

// Apply rate limiting
app.use("/api/v1/auth", security.authLimiter);
app.use("/api/v1/payments/wallet", security.walletLimiter);
app.use("/api/sms", security.smsLimiter);
app.use("/api", security.apiLimiter);

// API Response wrapper
app.use(responseMiddleware);

// Cache middleware for public GET endpoints
app.use("/api/v1/products", createCacheMiddleware(300, "products"));
app.use("/api/v1/subscription-plans", createCacheMiddleware(3600, "plans"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      redis: redisClient.isConnected ? "connected" : "disconnected",
    },
  });
});

app.get("/ready", (req, res) => {
  if (mongoose.connection.readyState === 1 && redisClient.isConnected) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not ready" });
  }
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/user/history", userHistoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
app.use("/api/v1/subscription-plans", subscriptionPlanRoutes);
app.use("/api/v1/delivery", deliveryRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/upload", uploadRoutes);
app.use("/api/sms", smsRoutes);
app.use('/api/v1/customer', customerCylinderRoutes);
app.use("/api/v1/notifications", notificationRoutes);

// Admin API Routes
app.use(
  "/api/v1/admin/dashboard",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminDashboard,
);
app.use(
  "/api/v1/admin/users",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminUserManagement,
);
app.use(
  "/api/v1/admin/subscriptions",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminSubscriptionManagement,
);
app.use(
  "/api/v1/admin/orders",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminOrderManagement,
);
app.use(
  "/api/v1/admin/products",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminProductManagement,
);
app.use(
  "/api/v1/admin/subscription-plans",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminSubscriptionPlanManagement,
);
app.use(
  "/api/v1/admin/reports",
  protect,
  authorize("admin", "superadmin", "super-admin", "customer_care"),
  adminReportManagement,
);
app.use(
  "/api/v1/admin/delivery",
  protect,
  authorize("admin", "superadmin", "delivery", "super-admin"),
  adminDeliveryManagement,
);
app.use(
  "/api/v1/admin/supports",
  protect,
  authorize("admin", "superadmin", "super-admin", "customer_care", "support"),
  adminSupportManagement,
);
app.use(
  "/api/v1/admin/config",
  protect,
  authorize("admin", "superadmin", "super-admin"),
  adminConfigRoutes,
);
app.use(
  '/api/v1/admin/refills',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminRefillRoutes
);

app.use(
  '/api/v1/admin/cylinders',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminCylinderRoutes
);

app.use(
  '/api/v1/admin/remnants',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminRemnantRoutes
);

app.use(
  '/api/v1/admin/disputes',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminDisputeRoutes
);

app.use(
  '/api/v1/admin/settlements',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminSettlementRoutes
);

// DELIVERY AGENT
app.use('/api/v1/agent', agentRefillRoutes);
app.use('/api/v1/agent/cylinders', agentCylinderRoutes);

// Plant portal
app.use('/api/v1/plant', plantRoutes);
app.use('/api/v1/plant/auth', plantAuthRoutes);
app.use(
  '/api/v1/admin/plants',
  protect,
  authorize('admin', 'superadmin', 'super-admin'),
  adminPlantRoutes
);

// Socket.IO authentication middleware

// io.use(async (socket, next) => {
//   try {
//     const token = socket.handshake?.auth?.token;
//     if (!token) {
//       return next(new Error('Authentication required'));
//     }

//     const authService = require('./services/authService');
//     const verification = await authService.verifyAccessToken(token);

//     if (!verification.valid) {
//       return next(new Error('Invalid token'));
//     }

//     const User = require('./models/User');
//     const user = await User.findById(verification.decoded.userId)
//       .select('_id role plantId')
//       .lean();

//     if (!user || !user.role) {
//       return next(new Error('User not found'));
//     }

//     socket.userId = user._id.toString();
//     socket.userRole = user.role;
//     socket.plantId = user.plantId ? user.plantId.toString() : null;

//     next();
//   } catch (error) {
//     console.error('Socket auth error:', error.message);
//     next(new Error('Authentication failed'));
//   }
// });


// io.on('connection', (socket) => {
//   console.log(`User connected: ${socket.userId}`);
//   // Personal user room (existing)
//   socket.join(`user:${socket.userId}`);
//   // Role-based rooms
//   const userRole = socket.userRole || null; // populated by auth middleware
//   const plantId = socket.plantId || null;
//   // Agent personal room
//   if (userRole === 'delivery') {
//     socket.join(`agent:${socket.userId}`);
//   }
//   // Plant room
//   if (plantId) {
//     socket.join(`plant:${plantId}`);
//   }
//   // Admin ops room
//   if (['admin', 'superadmin', 'super-admin', 'customer_care'].includes(userRole)) {
//     socket.join('admin:ops');
//   }
//   // Order tracking (existing)
//   socket.on('track-order', (orderId) => {
//     socket.join(`order:${orderId}`);
//   });
//   socket.on('disconnect', () => {
//     console.log(`User disconnected: ${socket.userId}`);
//   });
// });

const cookie = require('cookie');
const authService = require('./services/authService');
const User = require('./models/User');

io.use(async (socket, next) => {
  try {
    // First check explicitly supplied token (mobile or other clients).
    let token = socket.handshake?.auth?.token;

    // Otherwise, read the HTTP-only accessToken cookie.
    if (!token) {
      const cookieHeader = socket.handshake?.headers?.cookie;

      if (cookieHeader) {
        const cookies = cookie.parse(cookieHeader);
        token = cookies.accessToken;
      }
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const verification = await authService.verifyAccessToken(token);

    if (!verification.valid) {
      return next(new Error('Invalid token'));
    }

    const user = await User.findById(verification.decoded.userId)
      .select('_id role plantId isActive')
      .lean();

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    socket.userId = user._id.toString();
    socket.userRole = user.role;
    socket.plantId = user.plantId
      ? user.plantId.toString()
      : null;

    next();
  } catch (error) {
    console.error('[Socket Authentication Error]', error.message);
    next(new Error('Authentication failed'));
  }
});


// 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found',
//   });
// });

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await database.connect();

    // Connect to Redis
    // await redisClient.connect();
    try {
      await redisClient.connect();
      console.log("✅ Redis connected successfully");
    } catch (error) {
      console.warn("⚠️ Redis connection failed, continuing without Redis");
    }

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔒 Security features enabled`);
      console.log(`🍪 HTTP-only cookies enabled for token storage`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

require("./services/notifications/notificationWorker");

startServer();

// // Graceful shutdown
// const gracefulShutdown = async () => {
//   console.log('Received shutdown signal, closing connections...');

// Optional: clean up on shutdown
// const { queue, connection } = require("./services/notificationQueue");
// process.on("SIGTERM", async () => {
//   try { await queue.close(); await connection.quit(); } catch {}
// });

//   httpServer.close(async () => {
//     console.log('HTTP server closed');

//     try {
//       await mongoose.connection.close();
//       console.log('MongoDB connection closed');

//       await redisClient.quit();
//       console.log('Redis connection closed');

//       process.exit(0);
//     } catch (error) {
//       console.error('Error during shutdown:', error);
//       process.exit(1);
//     }
//   });

//   // Force close after 10 seconds
//   setTimeout(() => {
//     console.error('Could not close connections in time, forcefully shutting down');
//     process.exit(1);
//   }, 10000);
// };

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);

module.exports = { app, io };

// require("dotenv").config();
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const path = require("path");
// const http = require("http");
// const errorHandler = require("./middleware/error");
// const connectDB = require("./config/db");
// require("./jobs/subscriptionExpirationJob");
// require('./jobs/subscriptionReminders');

// // Route files
// const auth = require("./routes/authRoutes");
// const users = require("./routes/userRoutes");
// const admin = require("./routes/adminRoutes");
// const products = require("./routes/productRoutes");
// const orders = require("./routes/orderRoutes");
// const cart = require("./routes/cartRoutes");
// const subscriptions = require("./routes/subscriptionRoutes");
// const subscriptionPlans = require("./routes/SubscriptionPlanRoutes");
// const payments = require("./routes/PaymentRoutes");
// const support = require("./routes/supportRoutes");
// const settings = require("./routes/SettingsRoutes");
// const dashboardOverview = require("./routes/userDashboardRoutes");
// const uploadRoutes = require("./routes/uploadRoutes");
// const userHistoryRoutes = require("./routes/userHistoryRoutes");

// // ===============================
// // ✅ ADMIN SECTION
// // ===============================
// const adminDashboard = require ("./adminPanel/routes/adminDashboardRoutes")
// const adminUserManagement = require ("./adminPanel/routes/userManagementRoutes");
// const adminSubscriptionManagement = require ("./adminPanel/routes/subscriptionManagementRoutes");
// const adminOrderManagement = require ("./adminPanel/routes/orderManagementRoutes");
// const adminReportManagement = require ("./adminPanel/routes/reportManagementRoutes");
// const adminDeliveryManagement = require ("./adminPanel/routes/deliveryManagementRoutes");
// const adminProductManagement = require ("./adminPanel/routes/productManagementRoutes");
// const adminSubscriptionPlanManagement = require ("./adminPanel/routes/subsPlanManagementRoutes");
// const adminSupportManagement = require ("./adminPanel/routes/supportManagementRoutes");

// const app = express();

// app.use(cors({origin:"*"}));
// // ===============================
// // ✅ Enhanced and Safe CORS Setup
// // ===============================
// const allowedOrigins = [
//   "http://localhost:3000",
//   "http://localhost:3001",
//   "https://egas-nigeria.netlify.app",
//   "https://egas-ng.onrender.com",
//   "https://www.egas.com.ng"
// ];

// app.use((req, res, next) => {
//   const origin = req.headers.origin;

//   if (allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//   }

//   res.setHeader(
//     "Access-Control-Allow-Methods",
//     "GET, POST, PUT, PATCH, DELETE, OPTIONS"
//   );
//   res.setHeader(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Authorization, x-requested-with"
//   );
//   res.setHeader("Access-Control-Allow-Credentials", "true");

//   if (req.method === "OPTIONS") {
//     return res.sendStatus(200);
//   }

//   next();
// });

// // ===============================
// // ✅ Body Parsing Middleware
// // ===============================
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// // ===============================
// // ✅ Serve Static Files (uploads)
// // ===============================
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // ===============================
// // ✅ Database Connection
// // ===============================
// connectDB();

// // ===============================
// // ✅ API ROUTES
// // ===============================
// app.use("/api/v1/auth", auth);
// app.use("/api/v1/users", users);
// app.use("/api/v1/user/history", userHistoryRoutes);
// app.use("/api/v1/products", products);
// app.use("/api/v1/orders", orders);
// app.use("/api/v1/cart", cart);
// app.use("/api/v1/subscriptions", subscriptions);
// app.use("/api/v1/subscription-plans", subscriptionPlans);
// app.use("/api/v1/payments", payments);
// app.use("/api/v1/support", support);
// app.use("/api/v1/settings", settings);
// app.use("/api/v1/dashboard", dashboardOverview);
// app.use("/api/v1/upload", uploadRoutes);

// // ===============================
// // ✅ ADMIN API ROUTES
// // ===============================
// app.use("/api/v1/admin/dashboard", adminDashboard)
// app.use("/api/v1/admin/users", adminUserManagement);
// app.use("/api/v1/admin/subscriptions", adminSubscriptionManagement);
// app.use("/api/v1/admin/orders", adminOrderManagement);
// app.use("/api/v1/admin/products", adminProductManagement);
// app.use("/api/v1/admin/subscription-plans", adminSubscriptionPlanManagement);
// app.use("/api/v1/admin/reports", adminReportManagement);
// app.use("/api/v1/admin/delivery", adminDeliveryManagement);
// app.use("/api/v1/admin/supports", adminSupportManagement);

// // ===============================
// // ✅ Health Check Route
// // ===============================
// app.get("/api/health", (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: "Server is running 🚀",
//     env: process.env.NODE_ENV || "development",
//   });
// });

// // ===============================
// // ✅ Global Error Handler
// // ===============================
// app.use(errorHandler);

// // ===============================
// // ✅ Start Server
// // ===============================
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });

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

// Middleware imports
const security = require("./middleware/security");
const errorHandler = require("./middleware/error");
const { protect, optionalAuth } = require("./middleware/auth");
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

// Admin API Routes
app.use(
  "/api/v1/admin/dashboard",
  protect,
  security.apiKeyAuth,
  adminDashboard,
);
app.use(
  "/api/v1/admin/users",
  protect,
  security.apiKeyAuth,
  adminUserManagement,
);
app.use(
  "/api/v1/admin/subscriptions",
  protect,
  security.apiKeyAuth,
  adminSubscriptionManagement,
);
app.use(
  "/api/v1/admin/orders",
  protect,
  security.apiKeyAuth,
  adminOrderManagement,
);
app.use(
  "/api/v1/admin/products",
  protect,
  security.apiKeyAuth,
  adminProductManagement,
);
app.use(
  "/api/v1/admin/subscription-plans",
  protect,
  security.apiKeyAuth,
  adminSubscriptionPlanManagement,
);
app.use(
  "/api/v1/admin/reports",
  protect,
  security.apiKeyAuth,
  adminReportManagement,
);
app.use(
  "/api/v1/admin/delivery",
  protect,
  security.apiKeyAuth,
  adminDeliveryManagement,
);
app.use(
  "/api/v1/admin/supports",
  protect,
  security.apiKeyAuth,
  adminSupportManagement,
);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const authService = require("./services/authService");
    const verification = await authService.verifyAccessToken(token);

    if (verification.valid) {
      socket.userId = verification.decoded.userId;
      next();
    } else {
      next(new Error("Invalid token"));
    }
  } catch (error) {
    next(new Error("Authentication failed"));
  }
}).on("connection", (socket) => {
  console.log(`User connected: ${socket.userId}`);

  // Join user to personal room
  socket.join(`user:${socket.userId}`);

  // Handle order tracking
  socket.on("track-order", (orderId) => {
    socket.join(`order:${orderId}`);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
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

startServer();

// // Graceful shutdown
// const gracefulShutdown = async () => {
//   console.log('Received shutdown signal, closing connections...');

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

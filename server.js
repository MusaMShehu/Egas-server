require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const errorHandler = require("./middleware/error");
const connectDB = require("./config/db");

// Route files
const auth = require("./routes/authRoutes");
const users = require("./routes/userRoutes");
const admin = require("./routes/adminRoutes");
const products = require("./routes/productRoutes");
const orders = require("./routes/orderRoutes");
const cart = require("./routes/cartRoutes");
const subscriptions = require("./routes/subscriptionRoutes");
const subscriptionPlans = require("./routes/SubscriptionPlanRoutes");
const payments = require("./routes/PaymentRoutes");
const support = require("./routes/supportRoutes");
const settings = require("./routes/SettingsRoutes");
const dashboardOverview = require("./routes/userDashboardRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const userHistoryRoutes = require("./routes/userHistoryRoutes");

const app = express();

// --- CORS CONFIGURATION ---
const allowedOrigins = [
  "http://localhost:3000",                     // local frontend
  "https://egas-ng.onrender.com/",             // production frontend
  "https://egas-ng.netlify.app",                  // custom domain if you have one
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // allow cookies or authorization headers
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  })
);

// ===============================
// ✅ Body Parsing Middleware
// ===============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===============================
// ✅ Serve Static Files (uploads)
// ===============================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================
// ✅ Database Connection
// ===============================
connectDB();

// ===============================
// ✅ API ROUTES
// ===============================
app.use("/api/v1/auth", auth);
app.use("/api/v1/users", users);
app.use("/api/v1/user/history", userHistoryRoutes);
app.use("/api/v1/admin", admin);
app.use("/api/v1/products", products);
app.use("/api/v1/orders", orders);
app.use("/api/v1/cart", cart);
app.use("/api/v1/subscriptions", subscriptions);
app.use("/api/v1/subscription-plans", subscriptionPlans);
app.use("/api/v1/payments", payments);
app.use("/api/v1/support", support);
app.use("/api/v1/settings", settings);
app.use("/api/v1/dashboard", dashboardOverview);
app.use("/api/v1/upload", uploadRoutes);

// ===============================
// ✅ Health Check Route
// ===============================
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running 🚀",
    env: process.env.NODE_ENV || "development",
  });
});

// ===============================
// ✅ Global Error Handler
// ===============================
app.use(errorHandler);

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");

const connectDB = require("./config/db");
const errorHandler = require("./middleware/error");

// Route files
const auth = require("./routes/authRoutes");
const users = require("./routes/userRoutes");
const admin = require("./routes/adminRoutes");
const products = require("./routes/productRoutes");
const orders = require("./routes/orderRoutes");
const cart = require("./routes/cartRoutes");
const subscriptions = require("./routes/subscriptionRoutes");
const subscriptionsPlan = require("./routes/SubscriptionPlanRoutes");
const payments = require("./routes/PaymentRoutes");
const support = require("./routes/supportRoutes");
const settings = require("./routes/SettingsRoutes");
const dashboardOverview = require("./routes/userDashboardRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const userHistoryRoutes = require('./routes/userHistoryRoutes');


const app = express();

// ✅ Allow CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://egas-nigeria.netlify.app",
    ],
    credentials: true,
  })
);


// ✅ Proper JSON and URL-encoded body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ✅ Static uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Session configuration
// app.use(
//   session({
//     secret: process.env.SESSION_SECRET || "*MusaShehu@6872#",
//     resave: false,
//     saveUninitialized: false,
//     store: MongoStore.create({
//       mongoUrl: process.env.MONGODB_URI,
//     }),
//     cookie: {
//       secure: process.env.NODE_ENV === "production",
//       maxAge: 24 * 60 * 60 * 1000, // 24 hours
//     },
//   })
// );

// ✅ Connect DB
connectDB();

// ✅ Mount routers
app.use("/api/v1/auth", auth);
app.use("/api/v1/users", users);
app.use('/api/v1/user/history', userHistoryRoutes);
app.use("/api/v1/admin", admin);
app.use("/api/v1/products", products);
app.use("/api/v1/orders", orders);
app.use("/api/v1/cart", cart);
app.use("/api/v1/subscriptions", subscriptions);
app.use("/api/v1/subscription-plans", subscriptionsPlan);
app.use("/api/v1/payments", payments);
app.use("/api/v1/support", support);
app.use("/api/v1/settings", settings);
app.use("/api/v1/dashboard", dashboardOverview);
app.use("/api/v1/upload", uploadRoutes);

// ✅ Error handler middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

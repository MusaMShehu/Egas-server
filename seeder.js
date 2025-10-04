// seeder.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Wallet = require("./models/Wallet");
const User = require("./models/User");

dotenv.config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    // 👤 Get any user (or adjust to target a specific user)
    const user = await User.findOne();
    if (!user) {
      console.log("❌ No users found in DB. Please create a user first.");
      process.exit(1);
    }

    // 💰 Seed wallet balance
    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        balance: 2000000, // initial balance in ₦
      });
      console.log(`✅ Wallet created with balance ₦${wallet.balance}`);
    } else {
      wallet.balance = 20000; // overwrite existing balance
      await wallet.save();
      console.log(`✅ Wallet updated to balance ₦${wallet.balance}`);
    }

    process.exit();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

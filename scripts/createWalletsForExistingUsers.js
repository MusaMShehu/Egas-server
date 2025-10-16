require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/wallet');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  }
};

const createWallets = async () => {
  try {
    const users = await User.find({});
    console.log(`🔍 Found ${users.length} total users`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const existingWallet = await Wallet.findOne({ userId: user._id });

      if (existingWallet) {
        console.log(`⚠️ Wallet already exists for user: ${user.email || user._id}`);
        skippedCount++;
        continue;
      }

      await Wallet.create({
        userId: user._id,
        balance: 0,
        transactions: [],
      });

      console.log(`✅ Wallet created for user: ${user.email || user._id}`);
      createdCount++;
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`🆕 Wallets created: ${createdCount}`);
    console.log(`⏭️ Skipped existing: ${skippedCount}`);
  } catch (err) {
    console.error('❌ Error during wallet-user sync:', err);
  } finally {
    mongoose.connection.close();
  }
};

connectDB().then(createWallets);

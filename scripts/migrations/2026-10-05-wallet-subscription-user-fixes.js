/**
 * Migration: Wallet/Subscription/User schema fixes
 * Date: 2026-10-05
 * Purpose: Backfill missing fields after schema updates
 *
 * Run: node scripts/migrations/2026-10-05-wallet-subscription-user-fixes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const run = async () => {
  console.log('🚀 Starting migration: wallet/subscription/user fixes...');

  try {
    await connectDB.connect();

    const db = mongoose.connection.db;

    // 1. Wallet: add transactions[], version to all docs missing them
    const walletResult = await db.collection('wallets').updateMany(
      {
        $or: [
          { transactions: { $exists: false } },
          { version: { $exists: false } },
        ],
      },
      {
        $set: {
          transactions: [],
          version: 0,
        },
      }
    );
    console.log(`✅ Wallets updated: ${walletResult.modifiedCount}`);

    // 2. Subscription: set nextDeliveryDate, originalStartDate
    const subscriptionResult = await db.collection('subscriptions').updateMany(
      {
        $or: [
          { nextDeliveryDate: { $exists: false } },
          { originalStartDate: { $exists: false } },
        ],
      },
      [
        {
          $set: {
            // Calculate nextDeliveryDate from startDate + 1 frequency cycle
            nextDeliveryDate: {
              $cond: [
                { $eq: ['$frequency', 'Daily'] },
                { $add: ['$startDate', 24 * 60 * 60 * 1000] },
                {
                  $cond: [
                    { $eq: ['$frequency', 'Weekly'] },
                    { $add: ['$startDate', 7 * 24 * 60 * 60 * 1000] },
                    {
                      $cond: [
                        { $eq: ['$frequency', 'Bi-weekly'] },
                        { $add: ['$startDate', 14 * 24 * 60 * 60 * 1000] },
                        {
                          $cond: [
                            { $eq: ['$frequency', 'Monthly'] },
                            { $add: ['$startDate', 30 * 24 * 60 * 60 * 1000] },
                            null,
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            originalStartDate: { $ifNull: ['$originalStartDate', '$startDate'] },
          },
        },
      ]
    );
    console.log(`✅ Subscriptions updated: ${subscriptionResult.modifiedCount}`);

    // 3. User: ensure plantId is null for all non-plant users (safety)
    const userResult = await db.collection('users').updateMany(
      {
        plantId: { $exists: false },
      },
      {
        $set: { plantId: null },
      }
    );
    console.log(`✅ Users updated: ${userResult.modifiedCount}`);

    // 4. Delivery: set plantWorkflowStatus for all existing deliveries
    const deliveryResult = await db.collection('deliveries').updateMany(
      {
        plantWorkflowStatus: { $exists: false },
      },
      {
        $set: {
          plantWorkflowStatus: 'not_started',
          cylinderId: null,
          plantRefillRequestId: null,
        },
      }
    );
    console.log(`✅ Deliveries updated: ${deliveryResult.modifiedCount}`);

    console.log('🎉 Migration complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

run();
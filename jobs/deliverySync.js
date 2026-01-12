// cron/deliverySync.js
const cron = require('node-cron');
const Delivery = require('../models/Delivery');
const Subscription = require('../models/Subscription');

// Run every hour to check for sync issues
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Running delivery sync cron job...');
  
  try {
    // Find subscriptions with status mismatches
    const subscriptions = await Subscription.find({
      $or: [
        { status: 'paused' },
        { status: 'active' }
      ]
    });

    let totalSynced = 0;
    
    for (const subscription of subscriptions) {
      const deliveries = await Delivery.find({
        subscriptionId: subscription._id,
        $or: [
          { status: 'paused', subscriptionStatus: 'active' },
          { status: { $in: ['pending', 'assigned', 'accepted', 'out_for_delivery'] }, subscriptionStatus: 'paused' }
        ]
      });

      if (deliveries.length > 0) {
        // Sync logic here
        const synced = await syncDeliveriesWithSubscription(subscription);
        totalSynced += synced;
      }
    }

    console.log(`✅ Sync complete: ${totalSynced} deliveries synchronized`);
  } catch (error) {
    console.error('❌ Cron job error:', error);
  }
});

const syncDeliveriesWithSubscription = async (subscription) => {
  // Implementation similar to autoSyncDeliveries middleware
};
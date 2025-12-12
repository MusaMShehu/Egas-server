// jobs/subscriptionExpirationJob.js
const cron = require('node-cron');
const SubscriptionExpirationService = require('../services/subscriptionExpirationService');

// Run every day at 3:00 AM - Simply marks subscriptions as expired
const subscriptionExpirationJob = cron.schedule("0 0 * * *", async () => {
  console.log('🕐 Running scheduled subscription expiration check');
  
  try {
    const result = await SubscriptionExpirationService.checkAndExpireSubscriptions();
    console.log('✅ Scheduled expiration check completed', result);
  } catch (error) {
    console.error('❌ Scheduled expiration check failed:', error);
  }
}, {
  scheduled: false,
  timezone: "Africa/Lagos"
});

// Start the job
subscriptionExpirationJob.start();
console.log('📅 Subscription expiration cron job scheduled');

module.exports = subscriptionExpirationJob;
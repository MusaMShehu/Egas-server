// jobs/emailJobs.js
const cron = require('node-cron');
const emailService = require('../services/emailService');
const Subscription = require('../models/Subscription');

// Run daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  try {
    // Send subscription ending alerts (7 days before)
    const endingSubscriptions = await Subscription.find({
      endDate: { 
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        $gte: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
      },
      status: 'active'
    }).populate('userId');
    
    for (const subscription of endingSubscriptions) {
      const daysLeft = Math.ceil((subscription.endDate - new Date()) / (24 * 60 * 60 * 1000));
      await emailService.sendSubscriptionEndingAlert(subscription, subscription.userId, daysLeft);
    }

    // Send delivery reminders (1 day before)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowDeliveries = await Subscription.find({
      nextDeliveryDate: {
        $gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
        $lt: new Date(tomorrow.setHours(23, 59, 59, 999))
      },
      status: 'active'
    }).populate('userId');
    
    for (const subscription of tomorrowDeliveries) {
      await emailService.sendSubscriptionDeliveryReminder(subscription, subscription.userId);
    }
  } catch (error) {
    console.error('Error in scheduled email job:', error);
  }
});
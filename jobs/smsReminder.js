// server/jobs/smsReminders.js
const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const smsService = require('../services/enhancedSmsService');

// Run daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  try {
    // Send subscription ending alerts (3 days before)
    const endingSubscriptions = await Subscription.find({
      endDate: { 
        $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        $gt: new Date() 
      },
      status: 'active'
    }).populate('userId');

    for (const subscription of endingSubscriptions) {
      const daysLeft = Math.ceil((subscription.endDate - new Date()) / (24 * 60 * 60 * 1000));
      await smsService.sendSubscriptionEndingAlert(
        subscription.userId._id,
        subscription._id,
        subscription.productName,
        daysLeft
      );
    }

    // Send delivery reminders (1 day before)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const upcomingDeliveries = await Subscription.find({
      nextDelivery: tomorrow,
      status: 'active'
    }).populate('userId');

    for (const subscription of upcomingDeliveries) {
      await smsService.sendSubscriptionDeliveryReminder(
        subscription.userId._id,
        subscription._id,
        subscription.planName,
        subscription.nextDelivery
      );
    }
  } catch (error) {
    console.error('SMS reminder job error:', error);
  }
});
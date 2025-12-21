// jobs/emailJobs.js
const cron = require("node-cron");
const emailService = require("../services/emailService");
const Subscription = require("../models/Subscription");

// Run daily at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    // 2. Subscription ending alerts (7, 3, 1 days before)
    const alertDays = [7, 3, 1];

    for (const days of alertDays) {
      const alertDate = new Date(today);
      alertDate.setDate(alertDate.getDate() + days);

      const endingSubscriptions = await Subscription.find({
        status: "active",
        endDate: {
          $gte: new Date(alertDate.setHours(0, 0, 0, 0)),
          $lt: new Date(alertDate.setHours(23, 59, 59, 999)),
        },
      }).populate("userId");

      for (const subscription of endingSubscriptions) {
        try {
          await emailService.sendSubscriptionEndingAlert(
            subscription,
            subscription.userId,
            days
          );
          console.log(
            `Sent ${days}-day ending alert for subscription ${subscription._id}`
          );
        } catch (error) {
          console.error(
            `Failed to send ending alert for subscription ${subscription._id}:`,
            error
          );
        }
      }
    }

    // Send delivery reminders (1 day before)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowDeliveries = await Subscription.find({
      nextDeliveryDate: {
        $gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
        $lt: new Date(tomorrow.setHours(23, 59, 59, 999)),
      },
      status: "active",
    }).populate("userId");

    for (const subscription of tomorrowDeliveries) {
      await emailService.sendSubscriptionDeliveryReminder(
        subscription,
        subscription.userId
      );
    }
    console.log("Scheduled email jobs completed");
  } catch (error) {
    console.error("Error in scheduled email jobs:", error);
  }
});

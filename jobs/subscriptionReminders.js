const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

class SubscriptionCronJobs {
    constructor() {
        this.init();
    }

    init() {
        // Run every day at 9 AM
        cron.schedule('0 9 * * *', async () => {
            await this.checkSubscriptionReminders();
            await this.checkSubscriptionEndings();
        });
    }

    async checkSubscriptionReminders() {
        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const subscriptions = await Subscription.find({
                nextDeliveryDate: {
                    $gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
                    $lt: new Date(tomorrow.setHours(23, 59, 59, 999))
                },
                status: 'active',
                isPaused: false
            }).populate('user', 'phone name');

            for (const subscription of subscriptions) {
                if (subscription.user.phone) {
                    await NotificationService.sendSubscriptionReminder(
                        subscription,
                        subscription.user
                    );
                }
            }

            console.log(`Sent ${subscriptions.length} subscription reminders`);
        } catch (error) {
            console.error('Subscription reminder error:', error);
        }
    }

    async checkSubscriptionEndings() {
        try {
            const threeDaysLater = new Date();
            threeDaysLater.setDate(threeDaysLater.getDate() + 3);
            
            const subscriptions = await Subscription.find({
                endDate: {
                    $gte: new Date(threeDaysLater.setHours(0, 0, 0, 0)),
                    $lt: new Date(threeDaysLater.setHours(23, 59, 59, 999))
                },
                status: 'active',
                autoRenew: false
            }).populate('user', 'phone name');

            for (const subscription of subscriptions) {
                if (subscription.user.phone) {
                    await NotificationService.sendSubscriptionEnding(
                        subscription,
                        subscription.user
                    );
                }
            }

            console.log(`Sent ${subscriptions.length} subscription ending alerts`);
        } catch (error) {
            console.error('Subscription ending alert error:', error);
        }
    }
}

module.exports = new SubscriptionCronJobs();
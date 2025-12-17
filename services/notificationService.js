const SendChampService = require('./sendchampService');
const SMSTemplates = require('./smsTemplates');
const SMSLog = require('../models/SMSLogs');
const User = require('../models/User');

class NotificationService {
    constructor() {
        this.sendChamp = SendChampService;
    }

    
    async sendNotification(phone, message, type, metadata = {}) {
        try {
            // Send SMS
            const result = await this.sendChamp.sendSMS(phone, message);
            
            // Log the SMS
            const smsLog = new SMSLog({
                recipient: phone,
                message,
                type,
                status: result.success ? 'sent' : 'failed',
                provider: 'sendchamp',
                providerResponse: result.data,
                metadata
            });

            await smsLog.save();

            return {
                success: result.success,
                logId: smsLog._id,
                data: result.data,
                message: result.message
            };
        } catch (error) {
            console.error('Notification Service Error:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to send notification'
            };
        }
    }

   
    async getUserPhone(userId) {
        try {
            const user = await User.findById(userId).select('phone');
            if (!user) throw new Error('User not found');
            // if (!user.phoneVerified) throw new Error('Phone not verified');
            return user.phone;
        } catch (error) {
            throw new Error(`Failed to get user phone: ${error.message}`);
        }
    }

    // Account Notifications
    async sendAccountCreated(user) {
        const message = SMSTemplates.accountCreated(user);
        return await this.sendNotification(
            user.phone,
            message,
            'account_created',
            { userId: user._id }
        );
    }

    // Order Notifications
    async sendOrderCreated(order, user) {
        const message = SMSTemplates.orderCreated({
            userName: user.name,
            orderId: order.orderNumber
        });
        return await this.sendNotification(
            user.phone,
            message,
            'order_created',
            { orderId: order._id, userId: user._id }
        );
    }

    async sendOrderConfirmed(order, user) {
        const message = SMSTemplates.orderConfirmed({
            orderId: order.orderNumber,
            estimatedDelivery: order.estimatedDelivery
        });
        return await this.sendNotification(
            user.phone,
            message,
            'order_confirmed',
            { orderId: order._id, userId: user._id }
        );
    }

    async sendOrderOutForDelivery(order, user, deliveryContact) {
        const message = SMSTemplates.orderOutForDelivery({
            orderId: order.orderNumber,
            deliveryContact
        });
        return await this.sendNotification(
            user.phone,
            message,
            'order_out_for_delivery',
            { orderId: order._id, userId: user._id }
        );
    }

    async sendOrderDelivered(order, user) {
        const message = SMSTemplates.orderDelivered({
            orderId: order.orderNumber
        });
        return await this.sendNotification(
            user.phone,
            message,
            'order_delivered',
            { orderId: order._id, userId: user._id }
        );
    }

    // Subscription Notifications
    async sendSubscriptionCreated(subscription, user) {
        const message = SMSTemplates.subscriptionCreated({
            userName: user.name,
            planName: subscription.plan.name,
            nextDeliveryDate: subscription.nextDeliveryDate.toLocaleDateString()
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_created',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    async sendSubscriptionReminder(subscription, user) {
        const message = SMSTemplates.subscriptionReminder({
            planName: subscription.plan.name,
            deliveryDate: subscription.nextDeliveryDate.toLocaleDateString()
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_reminder',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    async sendSubscriptionFulfilled(subscription, user, deliveryId) {
        const message = SMSTemplates.subscriptionFulfilled({
            planName: subscription.plan.name,
            deliveryId
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_fulfilled',
            { subscriptionId: subscription._id, userId: user._id, deliveryId }
        );
    }

    async sendSubscriptionEnding(subscription, user) {
        const daysRemaining = Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24));
        const message = SMSTemplates.subscriptionEnding({
            planName: subscription.plan.name,
            daysRemaining
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_ending',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    async sendSubscriptionPaused(subscription, user) {
        const message = SMSTemplates.subscriptionPaused({
            planName: subscription.plan.name
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_paused',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    async sendSubscriptionResumed(subscription, user) {
        const message = SMSTemplates.subscriptionResumed({
            planName: subscription.plan.name,
            nextDeliveryDate: subscription.nextDeliveryDate.toLocaleDateString()
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_resumed',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    async sendSubscriptionCancelled(subscription, user) {
        const message = SMSTemplates.subscriptionCancelled({
            planName: subscription.plan.name
        });
        return await this.sendNotification(
            user.phone,
            message,
            'subscription_cancelled',
            { subscriptionId: subscription._id, userId: user._id }
        );
    }

    // Wallet Notifications
    async sendWalletTopup(transaction, user) {
        const message = SMSTemplates.walletTopup({
            amount: transaction.amount,
            newBalance: transaction.newBalance,
            transactionId: transaction.transactionId
        });
        return await this.sendNotification(
            user.phone,
            message,
            'wallet_topup',
            { transactionId: transaction._id, userId: user._id }
        );
    }

    // Support Notifications
    async sendSupportResolved(ticket, user) {
        const message = SMSTemplates.supportResolved({
            userName: user.name,
            ticketId: ticket.ticketNumber
        });
        return await this.sendNotification(
            user.phone,
            message,
            'support_resolved',
            { ticketId: ticket._id, userId: user._id }
        );
    }

    // Promotional Notifications
    async sendPromotionalSMS(phone, message, userName = 'Customer') {
        const formattedMessage = SMSTemplates.promotional(message, userName);
        return await this.sendNotification(
            phone,
            formattedMessage,
            'promotional',
            { recipient: phone }
        );
    }

    async sendBulkPromotionalSMS(recipients, message) {
        const formattedMessage = SMSTemplates.promotional(message);
        const result = await this.sendChamp.sendBulkSMS(recipients, formattedMessage);
        
        // Log bulk SMS
        const smsLog = new SMSLog({
            recipient: 'multiple',
            message: formattedMessage,
            type: 'promotional_bulk',
            status: result.success ? 'sent' : 'failed',
            provider: 'sendchamp',
            providerResponse: result.data,
            metadata: { recipientsCount: recipients.length }
        });

        await smsLog.save();

        return {
            success: result.success,
            logId: smsLog._id,
            data: result.data,
            message: result.message
        };
    }
}

module.exports = new NotificationService();
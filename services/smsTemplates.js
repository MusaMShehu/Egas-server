class SMSTemplates {
    // Account Related
    static accountCreated(user) {
        return `Welcome ${user.firstName}! Your account has been created successfully. Thank you for joining us.`;
    }

    // Order Related
    static orderCreated(order) {
        return `Hi ${user.firstName || 'Customer'}, your order #${order.orderId} has been received. We'll notify you once it's confirmed.`;
    }

    static orderConfirmed(order) {
        return `Great news! Your order #${order.orderId} has been confirmed and is being processed.${order.estimatedDelivery ? ` Estimated delivery: ${order.estimatedDelivery}.` : ''}`;
    }

    static orderOutForDelivery(order) {
        return `Your order #${order.orderId || order.orderNumber} is out for delivery! Our delivery partner will reach you soon.${order.deliveryContact ? ` Contact: ${order.deliveryContact}.` : ''}`;
    }

    static orderDelivered(order) {
        return `Your order #${order.orderId || order.orderNumber} has been delivered successfully. Thank you for shopping with us!`;
    }

    static orderCancelled(order) {
        return `Your order #${order.orderId || order.orderNumber} has been cancelled.${order.cancellationReason ? ` Reason: ${order.cancellationReason}` : ''}`;
    }

    // Subscription Related
    static subscriptionCreated(subscription) {
        const planName = subscription.planName || 'your subscription';
        const nextDeliveryDate = subscription.nextDeliveryDate 
            ? new Date(subscription.nextDeliveryDate).toLocaleDateString() 
            : 'soon';
        
        return `Hi ${subscription.userName || 'Customer'}, your ${planName} subscription is now active. Next delivery: ${nextDeliveryDate}.`;
    }

    static subscriptionReminder(subscription) {
        const planName = subscription.planName || 'your subscription';
        const deliveryDate = subscription.deliveryDate 
            ? new Date(subscription.deliveryDate).toLocaleDateString()
            : subscription.nextDeliveryDate 
                ? new Date(subscription.nextDeliveryDate).toLocaleDateString()
                : 'soon';
        
        return `Reminder: Your ${planName} subscription delivery is scheduled for tomorrow (${deliveryDate}). Please ensure someone is available.`;
    }

    static subscriptionFulfilled(subscription) {
        const planName = subscription.planName || 'your subscription';
        const deliveryId = subscription.deliveryId || 'this delivery';
        
        return `Your ${planName} subscription delivery #${deliveryId} has been completed successfully.`;
    }

    static subscriptionEnding(subscription) {
        const planName = subscription.planName || 'your subscription';
        const daysRemaining = subscription.daysRemaining 
            || (subscription.endDate 
                ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
                : 'a few');
        
        return `Heads up! Your ${planName} subscription ends in ${daysRemaining} days. Renew now to continue uninterrupted service.`;
    }

    static subscriptionPaused(subscription) {
        const planName = subscription.planName || 'your subscription';
        return `Your ${planName} subscription has been paused. No charges will apply during this period.`;
    }

    static subscriptionResumed(subscription) {
        const planName = subscription.planName || 'your subscription';
        const nextDeliveryDate = subscription.nextDeliveryDate 
            ? new Date(subscription.nextDeliveryDate).toLocaleDateString()
            : 'soon';
        
        return `Your ${planName} subscription has been resumed. Next delivery: ${nextDeliveryDate}.`;
    }

    static subscriptionCancelled(subscription) {
        const planName = subscription.planName || subscription.plan?.name || 'your subscription';
        return `Your ${planName} subscription has been cancelled. You can resubscribe anytime.`;
    }

    static subscriptionRenewed(subscription) {
        const planName = subscription.planName || subscription.plan?.name || 'your subscription';
        return `Your ${planName} subscription has been renewed successfully. Thank you for continuing with us!`;
    }

    // Wallet Related
    static walletTopup(transaction) {
        const amount = transaction.amount || transaction.amountPaid || 0;
        const newBalance = transaction.newBalance || transaction.balance || 0;
        const transactionId = transaction.transactionId 
            || transaction.reference 
            || transaction._id?.toString().slice(-8) 
            || 'N/A';
        
        return `Wallet top-up successful! ₦${amount} credited to your wallet. New balance: ₦${newBalance}. Transaction ID: ${transactionId}`;
    }

    static walletDebit(transaction) {
        const amount = transaction.amount || 0;
        const newBalance = transaction.newBalance || transaction.balance || 0;
        const description = transaction.description 
            || transaction.purpose 
            || 'for payment';
        
        return `₦${amount} deducted from your wallet ${description}. New balance: ₦${newBalance}`;
    }

    static walletLowBalance(user) {
        const balance = user.walletBalance || user.balance || 0;
        return `Your wallet balance is low: ₦${balance}. Please top up to avoid service interruption.`;
    }

    // Support Related
    static supportTicketCreated(ticket) {
        const ticketNumber = ticket.ticketNumber 
            || ticket._id?.toString().slice(-8) 
            || `TKT-${ticket._id?.toString().slice(-6)}`;
        const subject = ticket.subject || 'your inquiry';
        
        return `Support ticket #${ticketNumber} created successfully. Subject: "${subject}". We'll get back to you within 24 hours.`;
    }

    static supportResolved(ticket) {
        const ticketNumber = ticket.ticketNumber 
            || ticket.ticketId 
            || ticket._id?.toString().slice(-8) 
            || `TKT-${ticket._id?.toString().slice(-6)}`;
        const userName = ticket.userName || 'Customer';
        
        return `Hi ${userName}, your support ticket #${ticketNumber} has been resolved. Thank you for your patience.`;
    }

    static supportAdminResponse(ticket) {
        const ticketNumber = ticket.ticketNumber 
            || ticket._id?.toString().slice(-8) 
            || `TKT-${ticket._id?.toString().slice(-6)}`;
        
        return `Admin has responded to your support ticket #${ticketNumber}. Please check your account for details.`;
    }

    static supportTicketClosed(ticket) {
        const ticketNumber = ticket.ticketNumber 
            || ticket._id?.toString().slice(-8) 
            || `TKT-${ticket._id?.toString().slice(-6)}`;
        
        return `Your support ticket #${ticketNumber} has been closed. If you need further assistance, please create a new ticket.`;
    }

    // Payment Related
    static paymentSuccess(transaction) {
        const amount = transaction.amount || 0;
        const reference = transaction.reference || transaction.transactionId || '';
        return `Payment of ₦${amount} was successful. Reference: ${reference}`;
    }

    static paymentFailed(transaction) {
        const amount = transaction.amount || 0;
        const reason = transaction.reason || 'Please try again or contact support';
        return `Payment of ₦${amount} failed. ${reason}`;
    }

    // Delivery Related (for subscription deliveries)
    static deliveryScheduled(delivery) {
        const deliveryDate = delivery.deliveryDate 
            ? new Date(delivery.deliveryDate).toLocaleDateString()
            : 'soon';
        const address = delivery.address || delivery.deliveryAddress || '';
        
        return `Delivery scheduled for ${deliveryDate}.${address ? ` Address: ${address}` : ''}`;
    }

    static deliveryCompleted(delivery) {
        const deliveryId = delivery.deliveryId || delivery._id?.toString().slice(-8) || '';
        return `Delivery #${deliveryId} has been completed successfully.`;
    }

    // User Related
    static profileUpdated(user) {
        return `Hi ${user.firstName || 'Customer'}, your profile has been updated successfully.`;
    }

    static passwordChanged(user) {
        return `Hi ${user.firstName || 'Customer'}, your password has been changed successfully. If you didn't make this change, please contact support immediately.`;
    }

    static phoneVerified(user) {
        return `Hi ${user.firstName || 'Customer'}, your phone number has been verified successfully.`;
    }

    static emailVerified(user) {
        return `Hi ${user.firstName || 'Customer'}, your email has been verified successfully.`;
    }

    // Admin Notifications (for bulk alerts)
    static newOrderAlert(order) {
        const orderId = order.orderId || order.orderNumber || order._id?.toString().slice(-8);
        const customerName = order.userName || order.user?.firstName || 'A customer';
        
        return `📦 New Order #${orderId} from ${customerName}. Amount: ₦${order.totalAmount || 0}`;
    }

    static newSubscriptionAlert(subscription) {
        const planName = subscription.planName || subscription.plan?.name || 'new subscription';
        const customerName = subscription.userName || subscription.user?.firstName || 'A customer';
        
        return `🔄 New ${planName} subscription from ${customerName}.`;
    }

    static newSupportTicketAlert(ticket) {
        const ticketNumber = ticket.ticketNumber || ticket._id?.toString().slice(-8);
        const customerName = ticket.userName || ticket.user?.firstName || 'A customer';
        const subject = ticket.subject || 'No subject';
        
        return `🆘 New Support Ticket #${ticketNumber} from ${customerName}: "${subject}"`;
    }

    // System Notifications
    static systemMaintenance(schedule) {
        const startTime = schedule.startTime ? new Date(schedule.startTime).toLocaleString() : '';
        const endTime = schedule.endTime ? new Date(schedule.endTime).toLocaleString() : '';
        const reason = schedule.reason || 'system maintenance';
        
        return `System maintenance scheduled from ${startTime} to ${endTime} for ${reason}. Service may be temporarily unavailable.`;
    }

    static systemUpdate(update) {
        const version = update.version || 'new version';
        const features = update.features ? ` New features: ${update.features}` : '';
        
        return `System updated to ${version}.${features} Thank you for your patience.`;
    }

    // Promotional & Marketing
    static promotional(message, userName = 'Customer') {
        return `Hi ${userName}! ${message}`;
    }

    static specialOffer(offer) {
        const title = offer.title || 'Special Offer';
        const discount = offer.discount || '';
        const validUntil = offer.validUntil ? new Date(offer.validUntil).toLocaleDateString() : '';
        
        return `${title}${discount ? `: ${discount}` : ''}${validUntil ? ` Valid until ${validUntil}` : ''}`;
    }

    static birthdayWish(user) {
        return `🎉 Happy Birthday ${user.firstName || 'Valued Customer'}! Enjoy a special gift from us on your special day!`;
    }

    static anniversaryWish(user, years) {
        return `🎊 Happy ${years || ''} Year${years > 1 ? 's' : ''} Anniversary ${user.firstName || 'Valued Customer'}! Thank you for being with us!`;
    }

    // Cart & Wishlist
    static cartAbandoned(cart) {
        const itemsCount = cart.items?.length || cart.products?.length || 0;
        return `You have ${itemsCount} item(s) in your cart waiting for you. Complete your purchase now!`;
    }

    static wishlistRestock(product) {
        const productName = product.name || 'an item';
        return `Great news! ${productName} from your wishlist is back in stock. Order now before it's gone!`;
    }

    // Review & Feedback
    static reviewReminder(order) {
        const orderId = order.orderId || order.orderNumber || 'your recent order';
        return `How was your experience with order #${orderId}? Please leave us a review to help us improve.`;
    }

    static feedbackThankYou(user) {
        return `Thank you ${user.firstName || 'Customer'} for your valuable feedback! We appreciate you helping us improve.`;
    }

    // Referral Program
    static referralSuccessful(referral) {
        const refereeName = referral.refereeName || 'a friend';
        const reward = referral.reward || '₦500';
        return `Congratulations! ${refereeName} signed up using your referral link. You've earned ${reward} reward!`;
    }

    static referralRewardClaimed(reward) {
        const amount = reward.amount || '₦500';
        return `Your referral reward of ${amount} has been credited to your wallet. Keep referring to earn more!`;
    }

    // Helper method for safe property access
    static getSafeProperty(obj, prop, defaultValue = '') {
        if (!obj) return defaultValue;
        
        // Handle nested properties with dot notation
        if (prop.includes('.')) {
            const props = prop.split('.');
            let value = obj;
            for (const p of props) {
                if (value && value[p] !== undefined) {
                    value = value[p];
                } else {
                    return defaultValue;
                }
            }
            return value;
        }
        
        return obj[prop] !== undefined ? obj[prop] : defaultValue;
    }

    // Dynamic template method for custom messages
    static customTemplate(template, data) {
        let message = template;
        
        // Replace placeholders like {{property}}
        const regex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
        message = message.replace(regex, (match, prop) => {
            return this.getSafeProperty(data, prop, match);
        });

        return message;
    }
}

module.exports = SMSTemplates;
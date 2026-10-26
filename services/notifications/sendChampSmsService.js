// // server/services/sendchampSmsService.js
// const axios = require('axios');
// const SMSLog = require('../models/SMSLogs');
// const SMSPreferences = require('../models/SMSPreferences');

// class SendchampSMSService {
//   constructor() {
//     this.apiKey = process.env.SENDCHAMP_API_KEY;
//     this.senderName = process.env.SENDCHAMP_SENDER_NAME;
//     this.baseURL = 'https://api.sendchamp.com/v1';
//   }

//   async makeSendchampRequest(endpoint, data) {
//     try {
//       const response = await axios.post(`${this.baseURL}${endpoint}`, data, {
//         headers: {
//           'Authorization': `Bearer ${this.apiKey}`,
//           'Content-Type': 'application/json',
//           'Accept': 'application/json'
//         }
//       });
//       return response.data;
//     } catch (error) {
//       console.error('Sendchamp API error:', error.response?.data || error.message);
//       throw new Error(error.response?.data?.message || 'SMS sending failed');
//     }
//   }

//   async canSendSMS(userId, type) {
//     const preferences = await SMSPreferences.findOne({ userId });
    
//     if (!preferences || !preferences.enabled) {
//       return { canSend: false, reason: 'SMS disabled by user' };
//     }

//     if (!preferences.verified) {
//       return { canSend: false, reason: 'Phone number not verified' };
//     }

//     if (!preferences.preferences[this.mapTypeToPreference(type)]) {
//       return { canSend: false, reason: 'Notification type disabled' };
//     }

//     // Check daily limit
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     const todayCount = await SMSLog.countDocuments({
//       userId,
//       createdAt: { $gte: startOfDay },
//       status: { $in: ['sent', 'delivered', 'processing'] }
//     });

//     if (todayCount >= preferences.dailyLimit) {
//       return { canSend: false, reason: 'Daily limit reached' };
//     }

//     return { canSend: true, phoneNumber: preferences.phoneNumber };
//   }

//   mapTypeToPreference(type) {
//     const map = {
//       'account': 'accountAlerts',
//       'order_update': 'orderUpdates',
//       'order_confirmation': 'orderConfirmation',
//       'order_delivery': 'orderDelivery',
//       'subscription': 'subscriptionAlerts',
//       'subscription_reminder': 'subscriptionReminders',
//       'transactional': 'transactionAlerts',
//       'wallet': 'walletUpdates',
//       'support': 'supportUpdates',
//       'security': 'securityAlerts',
//       'promotional': 'promotional',
//       'marketing': 'marketing'
//     };
//     return map[type] || 'transactional';
//   }

//   formatPhoneNumber(phone) {
//     // Convert to international format for Sendchamp
//     let formatted = phone.replace(/\D/g, '');
    
//     if (formatted.startsWith('0')) {
//       formatted = '234' + formatted.substring(1);
//     } else if (formatted.startsWith('+')) {
//       formatted = formatted.substring(1);
//     }
    
//     return formatted;
//   }

//   async sendSMS(userId, type, message, customPhone = null) {
//     try {
//       const { canSend, phoneNumber, reason } = await this.canSendSMS(userId, type);
      
//       if (!canSend) {
//         throw new Error(`Cannot send SMS: ${reason}`);
//       }

//       const to = this.formatPhoneNumber(customPhone || phoneNumber);
      
//       const smsData = {
//         to: [to],
//         message,
//         sender_name: this.senderName,
//         route: this.getRouteForType(type)
//       };

//       const result = await this.makeSendchampRequest('/sms/send', smsData);

//       // Log the SMS
//       const smsLog = new SMSLog({
//         userId,
//         to,
//         message,
//         type,
//         provider: 'sendchamp',
//         providerId: result.data?.id || result.message_id,
//         status: this.mapSendchampStatus(result.status),
//         cost: result.data?.cost || null
//       });

//       await smsLog.save();
//       await this.updateLastSent(userId);

//       return {
//         success: true,
//         messageId: result.data?.id || result.message_id,
//         status: result.status,
//         providerResponse: result
//       };

//     } catch (error) {
//       console.error('Sendchamp SMS service error:', error);
      
//       // Log failed attempt
//       const smsLog = new SMSLog({
//         userId,
//         to: customPhone || 'unknown',
//         message,
//         type,
//         provider: 'sendchamp',
//         status: 'failed',
//         errorMessage: error.message
//       });
//       await smsLog.save();

//       throw error;
//     }
//   }

//   getRouteForType(type) {
//     const routeMap = {
//       'verification': 'dnd',
//       'account': 'dnd',
//       'order_update': 'dnd',
//       'order_confirmation': 'dnd',
//       'order_delivery': 'dnd',
//       'subscription': 'dnd',
//       'subscription_reminder': 'dnd',
//       'transactional': 'dnd',
//       'wallet': 'dnd',
//       'support': 'dnd',
//       'security': 'dnd',
//       'promotional': 'non_dnd',
//       'marketing': 'non_dnd'
//     };
    
//     return routeMap[type] || 'dnd';
//   }

//   mapSendchampStatus(status) {
//     const statusMap = {
//       'processing': 'processing',
//       'sent': 'sent',
//       'delivered': 'delivered',
//       'failed': 'failed',
//       'undelivered': 'undelivered'
//     };
    
//     return statusMap[status] || 'processing';
//   }

//   async updateLastSent(userId) {
//     await SMSPreferences.updateOne(
//       { userId },
//       { lastSent: new Date() }
//     );
//   }

//   // Account Related Notifications
//   async sendAccountCreated(userId, userName) {
//     const message = `Welcome ${userName}! Your account has been successfully created. Thank you for joining e-Gas!`;
//     return this.sendSMS(userId, 'account', message);
//   }

//   // Order Related Notifications
//   async sendOrderCreated(userId, orderId, amount) {
//     const message = `Thank you for your order! Order #${orderId} for ₦${amount} has been received and is being processed.`;
//     return this.sendSMS(userId, 'order_update', message);
//   }

//   async sendOrderConfirmation(userId, orderId, deliveryDate) {
//     const message = `Order #${orderId} confirmed! Expected delivery: ${deliveryDate}. Track your order: ${process.env.APP_URL}/orders/${orderId}`;
//     return this.sendSMS(userId, 'order_confirmation', message);
//   }

//   async sendOrderOutForDelivery(userId, orderId, trackingUrl = null) {
//     let message = `Good news! Order #${orderId} is out for delivery. It should arrive today.`;
//     if (trackingUrl) {
//       message += ` Track: ${trackingUrl}`;
//     }
//     return this.sendSMS(userId, 'order_delivery', message);
//   }

//   async sendOrderDelivered(userId, orderId) {
//     const message = `Your order #${orderId} has been delivered! We hope you love it. Need help? Contact support: ${process.env.SUPPORT_PHONE}`;
//     return this.sendSMS(userId, 'order_delivery', message);
//   }

//   // Subscription Related Notifications
//   async sendSubscriptionCreated(userId, subscriptionId, planName, nextDelivery) {
//     const message = `Subscription created! You'll receive ${planName} regularly. First delivery: ${nextDelivery}. Manage your sub: ${process.env.APP_URL}/subscriptions`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   async sendSubscriptionDeliveryReminder(userId, subscriptionId, planName, deliveryDate) {
//     const message = `Reminder: Your ${planName} subscription delivery is scheduled for tomorrow (${deliveryDate}). Please ensure someone is available to receive it.`;
//     return this.sendSMS(userId, 'subscription_reminder', message);
//   }

//   async sendSubscriptionDelivered(userId, subscriptionId, planName) {
//     const message = `Your ${planName} subscription has been delivered! We hope you enjoy it. Your next delivery is being prepared.`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   async sendSubscriptionEndingAlert(userId, subscriptionId, planName, daysLeft) {
//     const message = `Heads up! Your ${planName} subscription ends in ${daysLeft} days. Renew now to continue uninterrupted gas refill delivery: ${process.env.APP_URL}/subscriptions/${subscriptionId}/renew`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   async sendSubscriptionPaused(userId, subscriptionId, planName, resumeDate = null) {
//     let message = `Your ${planName} subscription has been paused, there will be no delivery during this period until resumed.`;
//     if (resumeDate) {
//       message += ` It will automatically resume on ${resumeDate}.`;
//     }
//     message += ` Manage: ${process.env.APP_URL}/subscriptions`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   async sendSubscriptionResumed(userId, subscriptionId, productName, nextDelivery) {
//     const message = `Your ${productName} subscription has been successfully resumed! Next delivery: ${nextDelivery}.`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   async sendSubscriptionCancelled(userId, subscriptionId, productName, endDate) {
//     const message = `Your ${productName} subscription has been cancelled. It will remain active until ${endDate}. We're sorry to see you go!`;
//     return this.sendSMS(userId, 'subscription', message);
//   }

//   // Wallet & Payment Notifications
//   async sendWalletTopupSuccess(userId, amount, newBalance) {
//     const message = `Wallet top-up successful! ₦${amount} added. Your new balance: ₦${newBalance}. Thank you!`;
//     return this.sendSMS(userId, 'wallet', message);
//   }

//   // Support Notifications
//   async sendSupportResolved(userId, ticketId, ticketTitle) {
//     const message = `Your support ticket #${ticketId} "${ticketTitle}" has been resolved. Thank you for contacting us!`;
//     return this.sendSMS(userId, 'support', message);
//   }

//   // Promotional Notifications
//   async sendPromotionalOffer(userId, offerTitle, discountCode, expiryDate) {
//     const message = `Special offer: ${offerTitle}! Use code ${discountCode} for discount. Valid until ${expiryDate}. Shop now: ${process.env.APP_URL}/shop`;
//     return this.sendSMS(userId, 'promotional', message);
//   }

//   async sendAbandonedCartReminder(userId, cartItemsCount) {
//     const message = `Don't forget your cart! You have ${cartItemsCount} items waiting. Complete your purchase now: ${process.env.APP_URL}/cart`;
//     return this.sendSMS(userId, 'promotional', message);
//   }

//   // Security Notifications
//   async sendSecurityAlert(userId, alertType, location = null) {
//     const messages = {
//       login: `New login to your account detected${location ? ` from ${location}` : ''}. If this wasn't you, please reset your password immediately.`,
//       password_change: `Your password has been changed successfully. If you didn't make this change, contact support immediately.`,
//       unusual_activity: `Unusual activity detected on your account. Please verify your recent actions.`
//     };

//     const message = messages[alertType] || `Security alert: ${alertType}`;
//     return this.sendSMS(userId, 'security', message);
//   }

//   // Send verification code
//   async sendVerificationCode(userId, phoneNumber, code) {
//     const message = `Your verification code is: ${code}. It will expire in 10 minutes.`;
//     return this.sendSMS(userId, 'verification', message, phoneNumber);
//   }

//   // Check SMS balance
//   async checkBalance() {
//     try {
//       const response = await axios.get(`${this.baseURL}/wallet/wallet_balance`, {
//         headers: {
//           'Authorization': `Bearer ${this.apiKey}`,
//           'Accept': 'application/json'
//         }
//       });
//       return response.data;
//     } catch (error) {
//       console.error('Sendchamp balance check error:', error);
//       throw error;
//     }
//   }

//   // Get SMS delivery status
//   async getSMSStatus(messageId) {
//     try {
//       const response = await axios.get(`${this.baseURL}/sms/${messageId}`, {
//         headers: {
//           'Authorization': `Bearer ${this.apiKey}`,
//           'Accept': 'application/json'
//         }
//       });
//       return response.data;
//     } catch (error) {
//       console.error('Sendchamp status check error:', error);
//       throw error;
//     }
//   }
// }

// module.exports = new SendchampSMSService();
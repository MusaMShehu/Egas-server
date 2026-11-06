// services/notificationService.js — DEPRECATED — use notificationDispatcher
const dispatcher = require('./notificationDispatcher');
const User = require('../../models/User');

const NotificationService = {
  async sendNotification(phone, message, type, metadata = {}) {
    return dispatcher.rawSms({ phone, message, type, metadata });
  },
  async getUserPhone(userId) {
    const u = await User.findById(userId).select('phone').lean();
    if (!u) throw new Error('User not found');
    return u.phone;
  },

  // Account
  async sendAccountCreated(user) { return dispatcher.accountCreated(user); },

  // Orders
  async sendOrderCreated(order, user) { return dispatcher.orderCreated(order, user); },
  async sendOrderConfirmed(order, user) { return dispatcher.orderConfirmed(order, user); },
  async sendOrderOutForDelivery(order, user, contact) { return dispatcher.orderOutForDelivery(order, user, contact); },
  async sendOrderDelivered(order, user) { return dispatcher.orderDelivered(order, user); },

  // Subscriptions
  async sendSubscriptionCreated(sub, user) { return dispatcher.subscriptionCreated(sub, user); },
  async sendSubscriptionReminder(sub, user) {
    return dispatcher.subscriptionDeliveryReminder(sub, user, sub.nextDeliveryDate || sub.endDate);
  },
  async sendSubscriptionFulfilled(sub, user, orderId) {
    return dispatcher.subscriptionDeliveryFulfilled(sub, user, orderId);
  },
  async sendSubscriptionEnding(sub, user) {
    const end = sub.endDate ? new Date(sub.endDate) : new Date();
    const days = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
    return dispatcher.subscriptionEndingAlert(sub, user, days);
  },
  async sendSubscriptionPaused(sub, user) { return dispatcher.subscriptionPaused(sub, user); },
  async sendSubscriptionResumed(sub, user) { return dispatcher.subscriptionResumed(sub, user); },
  async sendSubscriptionCancelled(sub, user) { return dispatcher.subscriptionCancelled(sub, user); },

  // Wallet
  async sendWalletTopup(transaction, user) {
    return dispatcher.walletTopupSuccess(user, transaction, transaction.newBalance);
  },

  // Support
  async sendSupportResolved(ticket, user) { return dispatcher.supportResolved(ticket, user); },

  // Refill
  async sendRefillCreated(agentId, request) { return dispatcher.refillRequestCreated(agentId, request); },
  async sendRefillApproved(agentId, request) { return dispatcher.refillRequestApproved(agentId, request); },
  async sendRefillRejected(agentId, request, reason) { return dispatcher.refillRequestRejected(agentId, request, reason); },
  async sendRefillConfirmed(agentId, request) { return dispatcher.refillRequestConfirmed(agentId, request); },

  // Promotional
  async sendPromotionalSMS(phone, message, userName = 'Customer') {
    return dispatcher.rawSms({ phone, message: `Hi ${userName}, ${message}`, type: 'promotional' });
  },
  async sendBulkPromotionalSMS(recipients, message) {
    const results = await Promise.all(recipients.map((p) =>
      dispatcher.rawSms({ phone: p, message, type: 'promotional' })
    ));
    return { success: results.every((r) => r.ok), total: recipients.length };
  },
};

module.exports = NotificationService;
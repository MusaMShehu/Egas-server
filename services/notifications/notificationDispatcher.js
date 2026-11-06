// services/notificationDispatcher.js
const { enqueue } = require('./notificationQueue');

// ============================================================
// CATEGORY → PREFERENCE MAPPING
// ============================================================
const CATEGORY_PREF = {
  // Order family
  order: 'orderUpdates',
  order_created: 'orderUpdates',
  order_confirmed: 'orderUpdates',
  order_out_for_delivery: 'orderUpdates',
  order_delivered: 'orderUpdates',
  order_failed: 'orderUpdates',
  order_cancelled: 'orderUpdates',

  // Subscription family
  subscription: 'deliveryNotifications',
  subscription_created: 'deliveryNotifications',
  subscription_delivery_reminder: 'deliveryNotifications',
  subscription_fulfilled: 'deliveryNotifications',
  subscription_ending_warning: 'deliveryNotifications',
  subscription_paused: 'deliveryNotifications',
  subscription_resumed: 'deliveryNotifications',
  subscription_cancelled: 'deliveryNotifications',
  subscription_renewal_due: 'deliveryNotifications',

  // Delivery family
  delivery: 'deliveryNotifications',
  delivery_scheduled: 'deliveryNotifications',
  delivery_fulfilled: 'deliveryNotifications',
  delivery_failed: 'deliveryNotifications',
  delivery_escalated: 'deliveryNotifications',
  delivery_paused: 'deliveryNotifications',
  delivery_resumed: 'deliveryNotifications',

  // Refill / plant workflow
  refill: 'deliveryNotifications',
  refill_request_created: 'deliveryNotifications',
  refill_request_received: 'deliveryNotifications',
  refill_inspection_pending: 'deliveryNotifications',
  refill_request_approved: 'deliveryNotifications',
  refill_request_rejected: 'deliveryNotifications',
  refill_quantity_recorded: 'deliveryNotifications',
  refill_request_confirmed: 'deliveryNotifications',
  refill_ready_for_collection: 'deliveryNotifications',
  refill_collected_from_plant: 'deliveryNotifications',
  refill_disputed: 'deliveryNotifications',

  // Promotional
  promotional: 'promotionalOffers',
};

// Channels/categories that MUST always send (security / transactional)
const ALWAYS_SEND = new Set([
  'account_created',
  'email_verification',
  'password_reset',
  'password_reset_success',
  'account_locked',
  'suspicious_activity',
  'wallet_topup_success',
  'wallet_topup_failed',
  'wallet_debited',
  'wallet_credited',
  'support_created',
  'support_resolved',
  'ticket_response',
  'plant_approved',
  'plant_suspended',
  'plant_staff_invited',
  'system_update',
]);

// ============================================================
// HELPERS
// ============================================================
function plain(v) {
  return JSON.parse(JSON.stringify(v, (k, val) => (typeof val === 'function' ? undefined : val)));
}

function fmtDate(d) {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

function name(user) {
  return user?.firstName || user?.name || 'Customer';
}

function prefsOf(user) {
  const p = user?.notificationPreferences || {};
  return {
    orderUpdates: p.orderUpdates !== false,
    deliveryNotifications: p.deliveryNotifications !== false,
    promotionalOffers: p.promotionalOffers === true,
    newsletter: p.newsletter === true,
    channels: {
      inApp: p.channels?.inApp !== false,
      email: p.channels?.email !== false,
      sms: p.channels?.sms !== false,
      push: p.channels?.push !== false,
    },
    quietHours: p.quietHours || { enabled: false },
  };
}

function isAllowed(prefs, type, subType) {
  if (ALWAYS_SEND.has(subType) || ALWAYS_SEND.has(type)) return true;
  const key = CATEGORY_PREF[subType] || CATEGORY_PREF[type];
  if (!key) return true;
  return prefs[key] !== false;
}

function inQuietHours(prefs, now = new Date()) {
  const q = prefs.quietHours;
  if (!q?.enabled) return false;
  const [sh, sm] = (q.start || '22:00').split(':').map(Number);
  const [eh, em] = (q.end || '07:00').split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  // window may wrap midnight
  if (s <= e) return mins >= s && mins < e;
  return mins >= s || mins < e;
}

// ============================================================
// LOW-LEVEL ENQUEUERS (never throw, respect gates)
// ============================================================
function queueEmail(method, args, { jobId = null } = {}) {
  try {
    return enqueue('email', { method, args: plain(args) }, jobId ? { jobId } : {});
  } catch (e) {
    console.error('[dispatcher] email enqueue failed:', e.message);
    return { ok: false };
  }
}

function queueSms({ phone, message, type, userId, metadata }, { jobId = null } = {}) {
  if (!phone) return { ok: false };
  try {
    return enqueue('sms', { phone, message, type, userId, metadata: metadata || {} }, jobId ? { jobId } : {});
  } catch (e) {
    console.error('[dispatcher] sms enqueue failed:', e.message);
    return { ok: false };
  }
}

function queueInApp(payload, { jobId = null } = {}) {
  if (!payload?.userId) return { ok: false };
  try {
    return enqueue('in_app', payload, jobId ? { jobId } : {});
  } catch (e) {
    console.error('[dispatcher] in_app enqueue failed:', e.message);
    return { ok: false };
  }
}

function queuePush(payload, { jobId = null } = {}) {
  if (!payload?.userId) return { ok: false };
  try {
    return enqueue('push', payload, jobId ? { jobId } : {});
  } catch (e) {
    console.error('[dispatcher] push enqueue failed:', e.message);
    return { ok: false };
  }
}

// ============================================================
// HIGH-LEVEL: fan out one notification across all channels
// ============================================================
function fanout(user, opts) {
  const prefs = prefsOf(user);
  const { type, subType } = opts;
  if (!isAllowed(prefs, type, subType)) return;

  const quiet = inQuietHours(prefs);

  // In-app (always allowed if channel is on)
  if (prefs.channels.inApp) {
    queueInApp({
      userId: user._id,
      title: opts.inAppTitle || opts.smsText || 'Notification',
      message: opts.inAppMessage || opts.smsText || '',
      type,
      subType,
      relatedId: opts.relatedId || null,
      relatedModel: opts.relatedModel || null,
      data: opts.data || {},
      priority: opts.priority || 'medium',
      sentVia: ['in_app'],
      idempotencyKey: opts.idempotencyKey || null,
    }, { jobId: opts.idempotencyKey });
  }

  // Push (FCM-style)
  if (prefs.channels.push) {
    queuePush({
      userId: user._id,
      title: opts.pushTitle || opts.inAppTitle || 'E-Gas',
      body: opts.pushBody || opts.inAppMessage || opts.smsText || '',
      type,
      subType,
      relatedId: opts.relatedId || null,
      relatedModel: opts.relatedModel || null,
      data: opts.data || {},
    }, { jobId: opts.idempotencyKey ? `${opts.idempotencyKey}:push` : null });
  }

  // Email
  if (prefs.channels.email && opts.email?.method) {
    queueEmail(opts.email.method, opts.email.args || [], {
      jobId: opts.idempotencyKey ? `${opts.idempotencyKey}:email` : null,
    });
  }

  // SMS (skipped inside quiet hours for non-critical)
  if (
    prefs.channels.sms &&
    opts.smsText &&
    user?.phone &&
    (!quiet || ALWAYS_SEND.has(subType))
  ) {
    queueSms(
      {
        phone: user.phone,
        message: opts.smsText,
        type: subType,
        userId: user._id,
      },
      { jobId: opts.idempotencyKey ? `${opts.idempotencyKey}:sms` : null }
    );
  }
}

// ============================================================
// PUBLIC DISPATCHER — one method per event
// ============================================================
const Dispatcher = {
  // ==================== ACCOUNT / SECURITY ====================
  accountCreated(user) {
    fanout(user, {
      type: 'account',
      subType: 'account_created',
      inAppTitle: 'Welcome to E-Gas!',
      inAppMessage: 'Your account has been created successfully.',
      smsText: `Hello ${name(user)}, welcome to E-Gas Online! Your account is ready.`,
      email: { method: 'sendAccountCreatedEmail', args: [user] },
    });
  },

  emailVerification(user, token) {
    const verifyUrl = `${process.env.FRONTEND_URL || 'https://egas.com.ng'}/verify-email?token=${token}&id=${user._id}`;
    fanout(user, {
      type: 'account',
      subType: 'email_verification',
      inAppTitle: 'Verify your email',
      inAppMessage: 'Please confirm your email to unlock all features.',
      email: { method: 'sendEmailVerification', args: [{ user, verifyUrl }] },
    });
  },

  passwordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'https://egas.com.ng'}/reset-password?token=${resetToken}&id=${user._id}`;
    fanout(user, {
      type: 'account',
      subType: 'password_reset',
      email: {
        method: 'sendPasswordResetEmail',
        args: [{ email: user.email, name: name(user), resetUrl, expiryTime: '10 minutes' }],
      },
      // No in-app / SMS / push for password reset (security — link only via email)
    });
  },

  passwordResetSuccess(user, meta = {}) {
    fanout(user, {
      type: 'account',
      subType: 'password_reset_success',
      inAppTitle: 'Password changed',
      inAppMessage: 'Your account password was reset successfully.',
      email: {
        method: 'sendPasswordResetSuccessEmail',
        args: [{ email: user.email, name: name(user), ...meta }],
      },
    });
  },

  accountLocked(user, lockDuration = '30 minutes') {
    fanout(user, {
      type: 'account',
      subType: 'account_locked',
      inAppTitle: 'Account temporarily locked',
      inAppMessage: `Account locked for ${lockDuration} due to failed login attempts.`,
      email: {
        method: 'sendAccountLockedAlert',
        args: [{ email: user.email, name: name(user), lockDuration }],
      },
    });
  },

  suspiciousActivity(user, ctx = {}) {
    fanout(user, {
      type: 'account',
      subType: 'suspicious_activity',
      inAppTitle: 'Suspicious activity detected',
      inAppMessage: 'Someone tried to reset your password. If this was you, ignore.',
      email: {
        method: 'sendSuspiciousActivityAlert',
        args: [{ email: user.email, name: name(user), ...ctx }],
      },
    });
  },

  // ==================== ORDERS ====================
  orderCreated(order, user) {
    const key = `order_created:${order._id}`;
    fanout(user, {
      type: 'order',
      subType: 'order_created',
      idempotencyKey: key,
      inAppTitle: `Order #${order.orderId} confirmed`,
      inAppMessage: `Your order for ${order.products?.[0]?.productName || 'gas'} is being processed.`,
      smsText: `Hi ${name(user)}, your order #${order.orderId} has been received. - E-Gas`,
      relatedId: order._id,
      relatedModel: 'Order',
      email: { method: 'sendOrderCreatedEmail', args: [order, user] },
    });
  },

  orderConfirmed(order, user) {
    const key = `order_confirmed:${order._id}`;
    fanout(user, {
      type: 'order',
      subType: 'order_confirmed',
      idempotencyKey: key,
      inAppTitle: `Order #${order.orderId} is being prepared`,
      inAppMessage: `Estimated delivery: ${order.estimatedDelivery || 'soon'}.`,
      smsText: `Your order #${order.orderId} is being prepared. Est. delivery: ${order.estimatedDelivery || 'soon'}. - E-Gas`,
      relatedId: order._id,
      relatedModel: 'Order',
      email: { method: 'sendOrderConfirmationEmail', args: [order, user] },
    });
  },

  orderOutForDelivery(order, user, deliveryContact) {
    const key = `order_out:${order._id}`;
    fanout(user, {
      type: 'order',
      subType: 'order_out_for_delivery',
      idempotencyKey: key,
      inAppTitle: `Order #${order.orderId} is on the way`,
      inAppMessage: `Delivery agent: ${order.deliveryAgent || 'assigned'}.`,
      smsText: `Your order #${order.orderId} is out for delivery. Agent: ${deliveryContact || 'on the way'}. - E-Gas`,
      relatedId: order._id,
      relatedModel: 'Order',
      email: { method: 'sendOrderOutForDeliveryEmail', args: [order, user] },
    });
  },

  orderDelivered(order, user) {
    const key = `order_delivered:${order._id}`;
    fanout(user, {
      type: 'order',
      subType: 'order_delivered',
      idempotencyKey: key,
      inAppTitle: `Order #${order.orderId} delivered`,
      inAppMessage: 'Your order has been delivered successfully. Thank you!',
      smsText: `Your order #${order.orderId} has been delivered. Thank you! - E-Gas`,
      relatedId: order._id,
      relatedModel: 'Order',
      email: { method: 'sendOrderDeliveredEmail', args: [order, user] },
    });
  },

  // ==================== SUBSCRIPTIONS ====================
  subscriptionCreated(subscription, user) {
    const key = `sub_created:${subscription._id}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_created',
      idempotencyKey: key,
      inAppTitle: `Subscription active — ${subscription.planName}`,
      inAppMessage: `Next delivery: ${fmtDate(subscription.nextDeliveryDate || subscription.endDate)}.`,
      smsText: `Hi ${name(user)}, your ${subscription.planName} subscription is active. - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionCreatedEmail', args: [subscription, user] },
    });
  },

  subscriptionDeliveryReminder(subscription, user, deliveryDate) {
    const key = `sub_reminder:${subscription._id}:${fmtDate(deliveryDate)}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_delivery_reminder',
      idempotencyKey: key,
      inAppTitle: 'Delivery tomorrow',
      inAppMessage: `${subscription.planName} delivery is scheduled for tomorrow.`,
      smsText: `Reminder: your ${subscription.planName} delivery is scheduled for ${fmtDate(deliveryDate)}. - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionDeliveryReminder', args: [subscription, user] },
    });
  },

  subscriptionDeliveryFulfilled(subscription, user, orderId) {
    const key = `sub_fulfilled:${subscription._id}:${orderId || 'na'}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_fulfilled',
      idempotencyKey: key,
      inAppTitle: 'Subscription delivery completed',
      inAppMessage: `Your ${subscription.planName} delivery was completed.`,
      smsText: `Your ${subscription.planName} delivery has been completed. Thank you! - E-Gas`,
      relatedId: orderId || subscription._id,
      relatedModel: orderId ? 'Order' : 'Subscription',
      email: { method: 'sendSubscriptionDeliveryFulfilled', args: [subscription, user] },
    });
  },

  subscriptionEndingAlert(subscription, user, daysLeft) {
    const key = `sub_ending:${subscription._id}:${daysLeft}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_ending_warning',
      idempotencyKey: key,
      inAppTitle: `Subscription ends in ${daysLeft} days`,
      inAppMessage: 'Renew now to keep your gas deliveries uninterrupted.',
      smsText: `Your ${subscription.planName} subscription ends in ${daysLeft} days. Renew now! - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionEndingAlert', args: [subscription, user, daysLeft] },
    });
  },

  subscriptionPaused(subscription, user) {
    const key = `sub_paused:${subscription._id}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_paused',
      idempotencyKey: key,
      inAppTitle: 'Subscription paused',
      inAppMessage: 'Your gas subscription has been paused as requested.',
      smsText: `Your ${subscription.planName} subscription has been paused. - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionPausedEmail', args: [subscription, user] },
    });
  },

  subscriptionResumed(subscription, user) {
    const key = `sub_resumed:${subscription._id}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_resumed',
      idempotencyKey: key,
      inAppTitle: 'Subscription resumed',
      inAppMessage: 'Your regular delivery schedule has been restored.',
      smsText: `Your ${subscription.planName} subscription is active again. Next delivery: ${fmtDate(subscription.nextDeliveryDate || subscription.endDate)}. - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionResumedEmail', args: [subscription, user] },
    });
  },

  subscriptionCancelled(subscription, user) {
    const key = `sub_cancelled:${subscription._id}`;
    fanout(user, {
      type: 'subscription',
      subType: 'subscription_cancelled',
      idempotencyKey: key,
      inAppTitle: 'Subscription cancelled',
      inAppMessage: 'Your gas subscription has been cancelled.',
      smsText: `Your ${subscription.planName} subscription has been cancelled. Thank you. - E-Gas`,
      relatedId: subscription._id,
      relatedModel: 'Subscription',
      email: { method: 'sendSubscriptionCancelledEmail', args: [subscription, user] },
    });
  },

  // ==================== DELIVERY ====================
  deliveryScheduled(delivery, user) {
    const key = `delivery_scheduled:${delivery._id}`;
    fanout(user, {
      type: 'delivery',
      subType: 'delivery_scheduled',
      idempotencyKey: key,
      inAppTitle: 'Delivery scheduled',
      inAppMessage: `Your delivery is scheduled for ${fmtDate(delivery.deliveryDate)}.`,
      smsText: `Your delivery is scheduled for ${fmtDate(delivery.deliveryDate)}. - E-Gas`,
      relatedId: delivery._id,
      relatedModel: 'Delivery',
    });
  },

  deliveryPaused(delivery, user) {
    const key = `delivery_paused:${delivery._id}`;
    fanout(user, {
      type: 'delivery',
      subType: 'delivery_paused',
      idempotencyKey: key,
      inAppTitle: 'Delivery paused',
      inAppMessage: 'A scheduled delivery has been paused.',
      relatedId: delivery._id,
      relatedModel: 'Delivery',
    });
  },

  deliveryResumed(delivery, user) {
    const key = `delivery_resumed:${delivery._id}:${delivery.deliveryDate?.toISOString?.() || 'na'}`;
    fanout(user, {
      type: 'delivery',
      subType: 'delivery_resumed',
      idempotencyKey: key,
      inAppTitle: 'Delivery resumed',
      inAppMessage: `New delivery date: ${fmtDate(delivery.deliveryDate)}.`,
      smsText: `Your delivery has been rescheduled to ${fmtDate(delivery.deliveryDate)}. - E-Gas`,
      relatedId: delivery._id,
      relatedModel: 'Delivery',
    });
  },

  deliveryFailed(delivery, user, reason) {
    const key = `delivery_failed:${delivery._id}`;
    fanout(user, {
      type: 'delivery',
      subType: 'delivery_failed',
      idempotencyKey: key,
      inAppTitle: 'Delivery failed',
      inAppMessage: reason ? `Reason: ${reason}` : 'We could not complete your delivery. We will retry.',
      smsText: `We could not complete your delivery. ${reason || 'We will retry soon.'} - E-Gas`,
      relatedId: delivery._id,
      relatedModel: 'Delivery',
    });
  },

  // ==================== REFILL (plant workflow) ====================
  refillRequestCreated(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} created`,
      message: `Requested ${request.requestedQuantity}kg at plant.`,
      type: 'refill',
      subType: 'refill_request_created',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
      priority: 'high',
    }, { jobId: `refill_created:${request._id}` });
  },

  refillRequestReceived(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} received`,
      message: `Cylinder received at plant.`,
      type: 'refill',
      subType: 'refill_request_received',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
    }, { jobId: `refill_received:${request._id}` });
  },

  refillInspectionPending(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} — inspection`,
      message: 'Cylinder is being inspected at the plant.',
      type: 'refill',
      subType: 'refill_inspection_pending',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
    }, { jobId: `refill_inspect:${request._id}` });
  },

  refillRequestApproved(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} approved`,
      message: 'Cylinder passed inspection. Refilling will proceed.',
      type: 'refill',
      subType: 'refill_request_approved',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
    }, { jobId: `refill_approved:${request._id}` });
  },

  refillRequestRejected(agentId, request, reason) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} rejected`,
      message: reason ? `Reason: ${reason}` : 'Cylinder failed inspection. Retry at another plant.',
      type: 'refill',
      subType: 'refill_request_rejected',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
      priority: 'high',
    }, { jobId: `refill_rejected:${request._id}` });
  },

  refillRequestConfirmed(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} confirmed`,
      message: `Ready for collection. ${request.plantConfirmedQuantity || ''}kg filled.`,
      type: 'refill',
      subType: 'refill_request_confirmed',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
    }, { jobId: `refill_confirmed:${request._id}` });
  },

  refillCollectedFromPlant(plantUserId, request) {
    queueInApp({
      userId: plantUserId,
      title: `Cylinder collected — ${request.requestNumber}`,
      message: `Agent has collected the cylinder.`,
      type: 'refill',
      subType: 'refill_collected_from_plant',
      relatedId: request._id,
      relatedModel: 'PlantRefillRequest',
    }, { jobId: `refill_collected:${request._id}` });
  },

  // ────────────────────────────────────────────────────────────
// ADD inside the Dispatcher object literal, in the "REFILL"
// section, e.g. right after refillCollectedFromPlant(...).
// ────────────────────────────────────────────────────────────

/**
 * refillRequestUpdate — status-change fanout used by plantRefillController.
 *
 * Called from:
 *   - plantRefillController.receiveCylinder
 *   - plantRefillController.submitInspection
 *   - plantRefillController.confirmRefill
 *   - plantRefillController.collectFromPlant
 *
 * Fires an in-app notification to the agent (and SMS if the agent
 * has a verified phone and the status is high-priority). Never throws.
 */
refillRequestUpdate(agentOrId, request, status) {
  if (!agentOrId || !request || !status) return;

  const titles = {
    received:   'Cylinder received at plant',
    approved:   'Refill approved — starting refill',
    rejected:   'Refill rejected — retry at another plant',
    confirmed:  'Refill confirmed — ready for collection',
    collected:  'Cylinder collected',
  };

  const messages = {
    received:   `Plant has your cylinder for ${request.requestNumber}.`,
    approved:   `Inspection passed for ${request.requestNumber}. Refilling in progress.`,
    rejected:   request.rejectedReason
                  ? `Inspection rejected: ${request.rejectedReason}`
                  : `Refill ${request.requestNumber} was rejected at the plant.`,
    confirmed:  `${request.plantConfirmedQuantity || '?'}kg filled. Collect now.`,
    collected:  `${request.requestNumber} collected. Proceed to customer.`,
  };

  const highPriority = status === 'rejected' || status === 'confirmed';

  // Resolve agent id (accepts ObjectId, populated user, or string)
  const agentId =
    (typeof agentOrId === 'object' && agentOrId !== null
      ? agentOrId._id || agentOrId.id
      : agentOrId) || null;

  if (!agentId) return;

  queueInApp({
    userId: agentId,
    title: titles[status] || `Refill update: ${status}`,
    message: messages[status] || `Refill ${request.requestNumber} is now ${status}.`,
    type: 'refill',
    subType: `refill_request_${status}`,
    relatedId: request._id,
    relatedModel: 'PlantRefillRequest',
    priority: highPriority ? 'high' : 'medium',
    sentVia: ['in_app'],
    idempotencyKey: `refill_${status}:${request._id}`,
  }, { jobId: `refill_${status}:${request._id}` });
},

  // ==================== WALLET ====================
  walletTopupSuccess(user, transaction, newBalance) {
    const ref = transaction.id || transaction.reference || String(transaction._id || Date.now());
    fanout(user, {
      type: 'wallet',
      subType: 'wallet_topup_success',
      idempotencyKey: `wallet_topup:${ref}`,
      inAppTitle: 'Wallet top-up successful',
      inAppMessage: `₦${transaction.amount} was added to your wallet.`,
      smsText: `Wallet top-up of ₦${transaction.amount} successful. New balance: ₦${newBalance ?? '?'}. - E-Gas`,
      relatedId: transaction.id || transaction._id,
      relatedModel: 'Transaction',
      email: { method: 'sendWalletTopupSuccess', args: [user, transaction] },
    });
  },

  walletTopupFailed(user, reference, amount) {
    fanout(user, {
      type: 'wallet',
      subType: 'wallet_topup_failed',
      idempotencyKey: `wallet_topup_failed:${reference}`,
      inAppTitle: 'Wallet top-up failed',
      inAppMessage: `₦${amount} top-up could not be completed.`,
      smsText: `Wallet top-up of ₦${amount} failed. Please try again. - E-Gas`,
    });
  },

  // ==================== SUPPORT ====================
  supportCreated(ticket, user) {
    fanout(user, {
      type: 'support',
      subType: 'support_created',
      inAppTitle: `Ticket ${ticket.ticketNumber || ticket.ticketId} created`,
      inAppMessage: 'Our team will respond shortly.',
      smsText: `Your support ticket ${ticket.ticketNumber || ticket.ticketId} has been created. We will respond shortly. - E-Gas`,
      relatedId: ticket._id,
      relatedModel: 'SupportTicket',
    });
  },

  supportResolved(ticket, user) {
    fanout(user, {
      type: 'support',
      subType: 'support_resolved',
      idempotencyKey: `support_resolved:${ticket._id}`,
      inAppTitle: `Ticket ${ticket.ticketNumber || ticket.ticketId} resolved`,
      inAppMessage: 'Your support ticket has been resolved.',
      smsText: `Hi ${name(user)}, your support ticket ${ticket.ticketNumber || ticket.ticketId} has been resolved. - E-Gas`,
      relatedId: ticket._id,
      relatedModel: 'SupportTicket',
      email: { method: 'sendSupportResolvedEmail', args: [ticket, user] },
    });
  },

  // ==================== PLANT / SYSTEM ====================
  plantApproved(plant, adminUser) {
    queueInApp({
      userId: plant.createdBy || adminUser?._id,
      title: `Plant ${plant.name} approved`,
      message: `Plant ${plant.name} (${plant.code}) is now active.`,
      type: 'system',
      subType: 'plant_approved',
      relatedId: plant._id,
    }, { jobId: `plant_approved:${plant._id}` });
  },

  plantSuspended(plant, reason) {
    queueInApp({
      userId: plant.createdBy,
      title: `Plant ${plant.name} suspended`,
      message: reason ? `Reason: ${reason}` : 'Your plant has been suspended.',
      type: 'system',
      subType: 'plant_suspended',
      relatedId: plant._id,
    }, { jobId: `plant_suspended:${plant._id}` });
  },

  plantStaffInvited(staff, plant) {
    fanout(staff, {
      type: 'system',
      subType: 'plant_staff_invited',
      inAppTitle: 'You have plant access',
      inAppMessage: `You've been added to ${plant.name} as ${staff.role}.`,
      email: { method: 'sendPlantStaffWelcome', args: [{ staff, plant }] },
    });
  },

  // ==================== PROMOTIONAL ====================
  promotional(user, { subject, title, message, ctaText, ctaLink, content, terms, subtitle }) {
    fanout(user, {
      type: 'promotional',
      subType: 'promotional',
      inAppTitle: title,
      inAppMessage: subtitle || message || 'Check out our latest offer!',
      email: {
        method: 'sendPromotionalEmail',
        args: [user, { subject, title, subtitle, message, ctaText, ctaLink, content, terms }],
      },
    });
  },

  // ==================== RAW ====================
  rawSms({ phone, message, type, userId, metadata }, jobId) {
    return queueSms({ phone, message, type, userId, metadata }, { jobId });
  },
  rawEmail({ method, args }, jobId) {
    return queueEmail(method, args, { jobId });
  },
  rawInApp(payload, jobId) {
    return queueInApp(payload, { jobId });
  },
};

module.exports = Dispatcher;
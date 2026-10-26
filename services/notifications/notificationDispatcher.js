// services/notificationDispatcher.js
//
// Controllers ONLY call Dispatcher.* methods. Every method is non-throwing.
// Internally each method enqueues into the notification queue (see notificationQueue.js).
//
const { enqueue } = require("./notificationQueue");

// ---------- helpers ----------
function fmtDate(d) {
  if (!d) return "N/A";
  try {
    return new Date(d).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function firstNameOf(user) {
  return user?.firstName || user?.name || "Customer";
}

// Safely JSON-serialize mongoose docs / arrays for the queue
function plain(value) {
  return JSON.parse(
    JSON.stringify(value, (k, v) => (typeof v === "function" ? undefined : v))
  );
}

// Generic enqueuers (return {ok,jobId?}, never throw)
function queueEmail(method, args, jobId = null) {
  const opts = jobId ? { jobId } : {};
  return enqueue("email", { method, args: plain(args) }, opts);
}
function queueSms({ phone, message, type, userId, metadata }, jobId = null) {
  if (!phone) return { ok: false, error: "no phone" };
  const opts = jobId ? { jobId } : {};
  return enqueue("sms", { phone, message, type, userId, metadata: metadata || {} }, opts);
}
function queueInApp(payload, jobId = null) {
  if (!payload?.userId) return { ok: false, error: "no userId" };
  const opts = jobId ? { jobId } : {};
  return enqueue("in_app", payload, opts);
}

// ============================================================
// PUBLIC DISPATCHER
// ============================================================
const Dispatcher = {
  // ---------- ACCOUNT ----------
  accountCreated(user) {
    queueEmail("sendAccountCreatedEmail", [user]);
    queueInApp({
      userId: user._id,
      title: "Welcome to E-Gas!",
      message: "Your account has been created successfully.",
      type: "account",
      subType: "account_created",
    });
    // SMS: keep short, cheap
    queueSms({
      phone: user.phone,
      type: "account_created",
      userId: user._id,
      message: `Hello ${firstNameOf(user)}, welcome to E-Gas Online! Your account is ready.`,
    });
  },

  // ---------- ORDERS ----------
  orderCreated(order, user) {
    queueEmail("sendOrderCreatedEmail", [order, user]);
    queueInApp({
      userId: user._id,
      title: `Order #${order.orderId} confirmed`,
      message: `Your order for ${
        order.products?.[0]?.productName || "gas"
      } is being processed.`,
      type: "order",
      subType: "order_created",
      relatedId: order._id,
      relatedModel: "Order",
    });
    queueSms({
      phone: user.phone,
      type: "order_created",
      userId: user._id,
      message: `Hi ${firstNameOf(
        user
      )}, your order #${order.orderId} has been received. - E-Gas`,
    });
  },

  orderConfirmed(order, user) {
    queueEmail("sendOrderConfirmationEmail", [order, user]);
    queueInApp({
      userId: user._id,
      title: `Order #${order.orderId} is being prepared`,
      message: `Estimated delivery: ${order.estimatedDelivery || "soon"}.`,
      type: "order",
      subType: "order_confirmed",
      relatedId: order._id,
      relatedModel: "Order",
    });
    queueSms({
      phone: user.phone,
      type: "order_confirmed",
      userId: user._id,
      message: `Your order #${order.orderId} is being prepared. Est. delivery: ${
        order.estimatedDelivery || "soon"
      }. - E-Gas`,
    });
  },

  orderOutForDelivery(order, user, deliveryContact) {
    queueEmail("sendOrderOutForDeliveryEmail", [order, user]);
    queueInApp({
      userId: user._id,
      title: `Order #${order.orderId} is on the way`,
      message: `Delivery agent: ${order.deliveryAgent || "assigned"}.`,
      type: "order",
      subType: "order_out_for_delivery",
      relatedId: order._id,
      relatedModel: "Order",
    });
    queueSms({
      phone: user.phone,
      type: "order_out_for_delivery",
      userId: user._id,
      message: `Your order #${order.orderId} is out for delivery. Agent: ${
        deliveryContact || "on the way"
      }. - E-Gas`,
    });
  },

  orderDelivered(order, user) {
    queueEmail("sendOrderDeliveredEmail", [order, user]);
    queueInApp({
      userId: user._id,
      title: `Order #${order.orderId} delivered`,
      message: "Your order has been delivered successfully. Thank you!",
      type: "order",
      subType: "order_delivered",
      relatedId: order._id,
      relatedModel: "Order",
    });
    queueSms({
      phone: user.phone,
      type: "order_delivered",
      userId: user._id,
      message: `Your order #${order.orderId} has been delivered. Thank you! - E-Gas`,
    });
  },

  // ---------- SUBSCRIPTIONS ----------
  // FIX: use subscription.planName (not .plan.name)
  // FIX: use subscription.nextDeliveryDate ?? subscription.endDate
  subscriptionCreated(subscription, user) {
    queueEmail("sendSubscriptionCreatedEmail", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: `Subscription activated — ${subscription.planName}`,
      message: `Next delivery: ${fmtDate(
        subscription.nextDeliveryDate || subscription.endDate
      )}.`,
      type: "subscription",
      subType: "subscription_created",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_created",
      userId: user._id,
      message: `Hi ${firstNameOf(user)}, your ${
        subscription.planName
      } subscription is active. - E-Gas`,
    });
  },

  subscriptionDeliveryReminder(subscription, user, deliveryDate) {
    queueEmail("sendSubscriptionDeliveryReminder", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: "Delivery tomorrow",
      message: `${subscription.planName} delivery is scheduled for tomorrow.`,
      type: "subscription",
      subType: "subscription_delivery_reminder",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_reminder",
      userId: user._id,
      message: `Reminder: your ${
        subscription.planName
      } delivery is scheduled for ${fmtDate(deliveryDate)}. - E-Gas`,
    });
  },

  subscriptionDeliveryFulfilled(subscription, user, orderId) {
    queueEmail("sendSubscriptionDeliveryFulfilled", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: "Subscription delivery completed",
      message: `Your ${subscription.planName} delivery was completed.`,
      type: "subscription",
      subType: "subscription_fulfilled",
      relatedId: orderId || subscription._id,
      relatedModel: orderId ? "Order" : "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_fulfilled",
      userId: user._id,
      message: `Your ${subscription.planName} delivery has been completed. Thank you! - E-Gas`,
    });
  },

  subscriptionEndingAlert(subscription, user, daysLeft) {
    queueEmail("sendSubscriptionEndingAlert", [subscription, user, daysLeft]);
    queueInApp({
      userId: user._id,
      title: `Subscription ends in ${daysLeft} days`,
      message: "Renew now to keep your gas deliveries uninterrupted.",
      type: "subscription",
      subType: "subscription_ending_warning",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_ending",
      userId: user._id,
      message: `Your ${subscription.planName} subscription ends in ${daysLeft} days. Renew now! - E-Gas`,
    });
  },

  subscriptionPaused(subscription, user) {
    queueEmail("sendSubscriptionPausedEmail", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: "Subscription paused",
      message: "Your gas subscription has been paused as requested.",
      type: "subscription",
      subType: "subscription_paused",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_paused",
      userId: user._id,
      message: `Your ${subscription.planName} subscription has been paused. - E-Gas`,
    });
  },

  subscriptionResumed(subscription, user) {
    queueEmail("sendSubscriptionResumedEmail", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: "Subscription resumed",
      message: "Your regular delivery schedule has been restored.",
      type: "subscription",
      subType: "subscription_resumed",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_resumed",
      userId: user._id,
      message: `Your ${
        subscription.planName
      } subscription is active again. Next delivery: ${fmtDate(
        subscription.nextDeliveryDate || subscription.endDate
      )}. - E-Gas`,
    });
  },

  subscriptionCancelled(subscription, user) {
    queueEmail("sendSubscriptionCancelledEmail", [subscription, user]);
    queueInApp({
      userId: user._id,
      title: "Subscription cancelled",
      message: "Your gas subscription has been cancelled.",
      type: "subscription",
      subType: "subscription_cancelled",
      relatedId: subscription._id,
      relatedModel: "Subscription",
    });
    queueSms({
      phone: user.phone,
      type: "subscription_cancelled",
      userId: user._id,
      message: `Your ${subscription.planName} subscription has been cancelled. Thank you. - E-Gas`,
    });
  },

  // ---------- WALLET ----------
  // FIX: caller passes actual wallet.balance as `newBalance`
  // FIX: dedupe via deterministic jobId (verify + webhook can both fire)
  walletTopupSuccess(user, transaction, newBalance) {
    const ref = transaction.id || transaction.reference || String(Date.now());
    queueEmail("sendWalletTopupSuccess", [user, transaction], `wt_email:${ref}`);
    queueInApp(
      {
        userId: user._id,
        title: "Wallet top-up successful",
        message: `₦${transaction.amount} was added to your wallet.`,
        type: "wallet",
        subType: "wallet_topup_success",
        relatedId: transaction.id || transaction._id,
        relatedModel: "Transaction",
      },
      `wt_inapp:${ref}`
    );
    queueSms(
      {
        phone: user.phone,
        type: "wallet_topup",
        userId: user._id,
        message: `Wallet top-up of ₦${transaction.amount} successful. New balance: ₦${
          newBalance ?? transaction.newBalance ?? "?"
        }. - E-Gas`,
      },
      `wt_sms:${ref}`
    );
  },

  // ---------- SUPPORT ----------
  supportResolved(ticket, user) {
    queueEmail("sendSupportResolvedEmail", [ticket, user]);
    queueInApp({
      userId: user._id,
      title: `Ticket ${ticket.ticketNumber} resolved`,
      message: "Your support ticket has been resolved.",
      type: "support",
      subType: "support_resolved",
      relatedId: ticket._id,
      relatedModel: "SupportTicket",
    });
    queueSms({
      phone: user.phone,
      type: "support_resolved",
      userId: user._id,
      message: `Hi ${firstNameOf(user)}, your support ticket ${
        ticket.ticketNumber
      } has been resolved. - E-Gas`,
    });
  },

  // ---------- AUTH / SECURITY ----------
  passwordResetEmail(user, resetToken) {
    const resetUrl = `${
      process.env.FRONTEND_URL || "https://egas.com.ng"
    }/reset-password?token=${resetToken}&id=${user._id}`;
    queueEmail("sendPasswordResetEmail", [
      {
        email: user.email,
        name: firstNameOf(user),
        resetUrl,
        expiryTime: "10 minutes",
      },
    ]);
  },

  passwordResetSuccess(user, meta = {}) {
    queueEmail("sendPasswordResetSuccessEmail", [
      {
        email: user.email,
        name: firstNameOf(user),
        ...meta,
      },
    ]);
    queueInApp({
      userId: user._id,
      title: "Password changed",
      message: "Your account password was reset successfully.",
      type: "account",
      subType: "system_update",
    });
  },

  emailVerification(user, verificationToken) {
    const verifyUrl = `${
      process.env.FRONTEND_URL || "https://egas.com.ng"
    }/verify-email?token=${verificationToken}&id=${user._id}`;
    queueEmail("sendEmailVerification", [{ user, verifyUrl }]);
  },

  suspiciousActivity(user, ctx = {}) {
    queueEmail("sendSuspiciousActivityAlert", [
      { email: user.email, name: firstNameOf(user), ...ctx },
    ]);
  },

  accountLocked(user, lockDuration = "30 minutes") {
    queueEmail("sendAccountLockedAlert", [
      { email: user.email, name: firstNameOf(user), lockDuration },
    ]);
  },

  // ---------- PLANTS ----------
  plantApproved(plant, adminUser) {
    queueInApp({
      userId: plant.createdBy || adminUser?._id,
      title: `Plant ${plant.name} approved`,
      message: `Plant ${plant.name} (${plant.code}) is now active.`,
      type: "system",
      subType: "system_update",
      relatedId: plant._id,
    });
  },

  plantSuspended(plant, reason) {
    queueInApp({
      userId: plant.createdBy,
      title: `Plant ${plant.name} suspended`,
      message: reason ? `Reason: ${reason}` : "Your plant has been suspended.",
      type: "system",
      subType: "system_update",
      relatedId: plant._id,
    });
  },

  plantStaffInvited(staff, plant) {
    queueEmail("sendPlantStaffWelcome", [
      { staff, plant },
    ]);
    queueInApp({
      userId: staff._id,
      title: "You have plant access",
      message: `You've been added to ${plant.name} as ${staff.role}.`,
      type: "account",
      subType: "account_created",
    });
  },

  // ---------- REFILL / DELIVERY WORKFLOW (in-app only) ----------
  refillRequestCreated(agentId, request) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} created`,
      message: `Requested ${request.requestedQuantity}kg at plant.`,
      type: "delivery",
      subType: "delivery_fulfilled",
      relatedId: request._id,
    });
  },

  refillRequestUpdate(agentId, request, label) {
    queueInApp({
      userId: agentId,
      title: `Refill ${request.requestNumber} — ${label}`,
      message: `Status: ${request.status}.`,
      type: "delivery",
      subType: "delivery_fulfilled",
      relatedId: request._id,
    });
  },

  deliveryEscalated(request, reason) {
    // notify admins? in-app doc requires a specific userId. Skip unless you know an admin id.
    console.warn("[dispatcher] delivery escalated:", request._id, reason);
  },

  // ---------- RAW / FALLBACK ----------
  rawEmail({ to, subject, html, text }, jobId = null) {
    return enqueue(
      "email",
      { method: null, args: null, __raw: { to, subject, html, text } },
      jobId ? { jobId } : {}
    );
  },
  rawSms(payload, jobId) {
    return queueSms(payload, jobId);
  },
  rawInApp(payload, jobId) {
    return queueInApp(payload, jobId);
  },
};

module.exports = Dispatcher;
// workers/notificationWorker.js
const { Worker, UnrecoverableError } = require('bullmq');
const { connection, QUEUE_NAME } = require('./notificationQueue');
const emailService = require('./emailService');
const SendChampService = require('./sendchampService');
const SMSLog = require('../../models/SMSLogs');
const Notification = require('../../models/Notification');
const User = require('../../models/User');

// Optional: FCM
let admin = null;
try { admin = require('../config/firebaseAdmin'); } catch { admin = null; }

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case 'email':  return handleEmail(job.data);
      case 'sms':    return handleSms(job.data);
      case 'in_app': return handleInApp(job.data);
      case 'push':   return handlePush(job.data);
      default: throw new UnrecoverableError(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
  }
);

worker.on('completed', (job) => {
  console.log(`[notif] ✅ ${job.name}#${job.id} (attempt ${job.attemptsMade})`);
});
worker.on('failed', (job, err) => {
  console.error(`[notif] ❌ ${job?.name}#${job?.id} attempt ${job?.attemptsMade}: ${err.message}`);
});
worker.on('error', (err) => console.error('[notif] Worker error:', err.message));

// ============================================================
// EMAIL
// ============================================================
async function handleEmail({ method, args }) {
  if (!method) throw new UnrecoverableError('Missing email method');
  const fn = emailService[method];
  if (typeof fn !== 'function') throw new UnrecoverableError(`Unknown emailService method: ${method}`);

  try {
    const result = await fn.apply(emailService, args || []);
    if (result && result.success === false) throw new Error(result.error || 'Email failed');
    return { id: result?.messageId || null };
  } catch (err) {
    const msg = String(err.message || '');
    if (
      msg.includes('domain is not verified') ||
      msg.includes('validation_error') ||
      msg.includes('invalid_from_address') ||
      msg.includes('not authorized') ||
      /^4\d\d/.test(String(err.status || ''))
    ) {
      throw new UnrecoverableError(msg);
    }
    throw err;
  }
}

// ============================================================
// SMS
// ============================================================
async function handleSms({ phone, message, type, userId, metadata = {} }) {
  if (!phone) throw new UnrecoverableError('Missing phone');
  const normalized = normalizeNgPhone(phone);
  if (!normalized) throw new UnrecoverableError(`Invalid phone: ${phone}`);

  let result;
  try {
    result = await SendChampService.sendSMS(normalized, message);
  } catch (err) {
    throw new Error(err.message || 'SendChamp error');
  }

  try {
    await SMSLog.create({
      recipient: normalized,
      message,
      type: normalizeLogType(type),
      status: result.success ? 'sent' : 'failed',
      provider: 'sendchamp',
      providerId: result.data?.id || result.data?.message_id || null,
      providerResponse: result.data || null,
      metadata: { ...metadata, userId },
    });
  } catch (logErr) {
    console.error('[notif] SMSLog save failed:', logErr.message);
  }

  if (!result.success) throw new Error(result.message || 'SMS failed');
  return { id: result.data?.id || null };
}

// ============================================================
// IN-APP
// ============================================================
async function handleInApp(payload) {
  const {
    userId, title, message, type, subType,
    relatedId = null, relatedModel = null,
    data = {}, priority = 'medium', sentVia = ['in_app'],
    idempotencyKey = null,
  } = payload;

  if (!userId) throw new UnrecoverableError('Missing userId');
  if (!title || !message) throw new UnrecoverableError('Missing title/message');
  if (!type || !subType) throw new UnrecoverableError('Missing type/subType');

  try {
    const doc = await Notification.create({
      userId, title, message, type, subType,
      relatedId, relatedModel, data, priority, sentVia,
      idempotencyKey,
    });
    return { id: String(doc._id) };
  } catch (err) {
    // Unique index violation on (userId, idempotencyKey) — already created
    if (err.code === 11000) return { id: null, duplicate: true };
    throw err;
  }
}

// ============================================================
// PUSH
// ============================================================
async function handlePush({ userId, title, body, type, subType, relatedId, relatedModel, data = {} }) {
  if (!admin?.messaging) {
    console.warn('[notif] Firebase Admin not configured — skipping push');
    return { skipped: true };
  }
  const user = await User.findById(userId).select('deviceTokens');
  const tokens = user?.deviceTokens || [];
  if (tokens.length === 0) return { skipped: true };

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      type: String(type || ''),
      subType: String(subType || ''),
      relatedId: relatedId ? String(relatedId) : '',
      relatedModel: String(relatedModel || ''),
      ...Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
    },
  });

  if (res.failureCount > 0) {
    console.warn(`[notif] push partial fail: ${res.failureCount}/${tokens.length}`);
  }
  return { successCount: res.successCount };
}

// ============================================================
// HELPERS
// ============================================================
function normalizeNgPhone(raw) {
  const s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  const d = s.replace(/[^\d]/g, '');
  if (hasPlus && d.startsWith('234') && d.length === 13) return `+${d}`;
  if (d.startsWith('234') && d.length === 13) return `+${d}`;
  if (d.startsWith('0') && d.length === 11) return `+234${d.slice(1)}`;
  if (d.length === 10) return `+234${d}`;
  return d.length >= 10 ? d : null;
}

// SMSLogs enum is more limited than Notification.subType — map where needed
function normalizeLogType(t) {
  const MAP = {
    order_created: 'order_created',
    order_confirmed: 'order_confirmed',
    order_out_for_delivery: 'order_out_for_delivery',
    order_delivered: 'order_delivered',
    subscription_created: 'subscription_created',
    subscription_delivery_reminder: 'subscription_reminder',
    subscription_fulfilled: 'subscription_fulfilled',
    subscription_ending_warning: 'subscription_ending',
    subscription_paused: 'subscription_paused',
    subscription_resumed: 'subscription_resumed',
    subscription_cancelled: 'subscription_cancelled',
    wallet_topup_success: 'wallet_topup',
    wallet_topup_failed: 'wallet_topup',
    support_resolved: 'support_resolved',
    promotional: 'promotional',
    account_created: 'account_created',
    delivery_failed: 'order_delivered',
    delivery_scheduled: 'order_confirmed',
    delivery_fulfilled: 'order_delivered',
  };
  return MAP[t] || 'account_created';
}

module.exports = { worker };
// workers/notificationWorker.js
const { Worker } = require("bullmq");
const { connection, QUEUE_NAME } = require("./notificationQueue");
const emailService = require("./emailService");
const SendChampService = require("./sendchampService");
const SMSLog = require("../../models/SMSLogs");
const Notification = require("../../models/Notification");

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case "email":
        return handleEmail(job.data);
      case "sms":
        return handleSms(job.data);
      case "in_app":
        return handleInApp(job.data);
      default:
        throw new Error(`Unknown notification job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 }, // at most 20 jobs/sec
  }
);

worker.on("completed", (job) => {
  console.log(`[notif worker] ✅ ${job.name}#${job.id} (attempt ${job.attemptsMade})`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[notif worker] ❌ ${job?.name}#${job?.id} attempt ${job?.attemptsMade}: ${err.message}`
  );
});

worker.on("error", (err) => {
  console.error("[notif worker] Worker error:", err.message);
});

// ============================================================
// EMAIL
// ============================================================
async function handleEmail({ method, args, __raw }) {
  // 1) Raw pass-through
  if (__raw) {
    const res = await emailService.sendEmail({ ...__raw, __throwOnError: true });
    return { id: res?.messageId };
  }

  // 2) Templated method call: emailService[method](...args)
  if (!method) throw new Error("Email job missing 'method'");
  const fn = emailService[method];
  if (typeof fn !== "function") {
    throw new Error(`Unknown emailService method: ${method}`);
  }
  const result = await fn.apply(emailService, args || []);

  // 3) Detect silent failures (sendEmail returns {success:false} in prod)
  if (result && result.success === false) {
    throw new Error(result.error || "Email send failed");
  }
  return { id: result?.messageId || null };
}

// ============================================================
// SMS
// ============================================================
async function handleSms({ phone, message, type, userId, metadata = {} }) {
  if (!phone) throw new Error("SMS job missing 'phone'");

  const normalized = normalizeNgPhone(phone);
  if (!normalized) throw new Error(`Invalid phone number: ${phone}`);

  const result = await SendChampService.sendSMS(normalized, message);

  try {
    await SMSLog.create({
      recipient: normalized,
      message,
      type,
      status: result.success ? "sent" : "failed",
      provider: "sendchamp",
      providerId: result.data?.id || result.data?.message_id || null,
      providerResponse: result.data || null,
      metadata: { ...metadata, userId },
    });
  } catch (logErr) {
    // Logging failure must NOT block the retry.
    console.error("[notif worker] SMSLog save failed:", logErr.message);
  }

  if (!result.success) {
    throw new Error(result.message || "SMS send failed");
  }

  return { id: result.data?.id || null };
}

// ============================================================
// IN-APP
// ============================================================
async function handleInApp({
  userId,
  title,
  message,
  type,
  subType,
  relatedId = null,
  relatedModel = null,
  data = {},
  priority = "medium",
  sentVia = ["in_app"],
}) {
  if (!userId) throw new Error("in_app job missing 'userId'");
  if (!title || !message) throw new Error("in_app job missing title/message");
  if (!type || !subType) throw new Error("in_app job missing type/subType");

  const doc = await Notification.create({
    userId,
    title,
    message,
    type,
    subType,
    relatedId,
    relatedModel,
    data,
    priority,
    sentVia,
  });
  return { id: String(doc._id) };
}

// ============================================================
// HELPERS
// ============================================================
function normalizeNgPhone(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  const hasPlus = str.startsWith("+");
  const digits = str.replace(/[^\d]/g, "");

  if (hasPlus && digits.startsWith("234") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("234") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+234${digits}`;
  }
  // Fallback: return as-is if length plausible
  return digits.length >= 10 ? digits : null;
}

module.exports = { worker };
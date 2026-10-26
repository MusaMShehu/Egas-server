// services/notificationQueue.js
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(
  process.env.REDIS_URL || "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  }
);

connection.on("error", (err) => {
  console.error("[notificationQueue] Redis error:", err.message);
});

const QUEUE_NAME = "notifications";

const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 }, // 30s, 60s, 120s, 240s, 480s
    removeOnComplete: { age: 24 * 3600, count: 2000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Enqueue a job. NEVER throws.
 * @param {string} name  "email" | "sms" | "in_app"
 * @param {object} data  payload
 * @param {object} opts  optional bullmq job options (jobId, delay, attempts, etc)
 * @returns {{ok:boolean, jobId?:string, error?:string}}
 */
async function enqueue(name, data, opts = {}) {
  try {
    const job = await queue.add(name, data, opts);
    return { ok: true, jobId: job.id };
  } catch (err) {
    console.error("[notificationQueue] enqueue failed:", err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { queue, enqueue, QUEUE_NAME, connection };
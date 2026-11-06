// // services/notificationQueue.js
// const { Queue } = require('bullmq');
// const IORedis = require('ioredis');

// const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
//   maxRetriesPerRequest: null,
//   enableReadyCheck: false,
// });

// connection.on('error', (err) => {
//   console.error('[notificationQueue] Redis error:', err.message);
// });

// const QUEUE_NAME = 'notifications';

// const queue = new Queue(QUEUE_NAME, {
//   connection,
//   defaultJobOptions: {
//     attempts: 5,
//     backoff: { type: 'exponential', delay: 30_000 },
//     removeOnComplete: { age: 24 * 3600, count: 2000 },
//     removeOnFail: { age: 7 * 24 * 3600 },
//   },
// });

// /**
//  * Enqueue a notification job. NEVER throws.
//  *
//  * @param {"email"|"sms"|"in_app"|"push"} name
//  * @param {object} data
//  * @param {object} [opts] — { jobId?, delay?, attempts?, priority? }
//  * @returns {Promise<{ok:boolean, jobId?:string, error?:string}>}
//  */
// async function enqueue(name, data, opts = {}) {
//   try {
//     const job = await queue.add(name, data, opts);
//     return { ok: true, jobId: job.id };
//   } catch (err) {
//     console.error('[notificationQueue] enqueue failed:', err.message);
//     return { ok: false, error: err.message };
//   }
// }

// function isQueueReady() {
//   return connection.status === 'ready';
// }

// module.exports = { queue, enqueue, QUEUE_NAME, connection, isQueueReady };













const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
);

connection.on('error', (err) => {
  console.error('[notificationQueue] Redis error:', err.message);
});

const QUEUE_NAME = 'notifications';

const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 30_000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 2000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

/**
 * Enqueue a notification without throwing into business logic.
 *
 * @param {"email"|"sms"|"in_app"|"push"} name
 * @param {object} data
 * @param {object} [opts]
 * @returns {Promise<{ok:boolean, jobId?:string, error?:string}>}
 */
async function enqueue(name, data, opts = {}) {
  try {
    const safeOpts = { ...opts };

    // BullMQ custom job IDs must not contain colons.
    if (safeOpts.jobId !== undefined && safeOpts.jobId !== null) {
      safeOpts.jobId = String(safeOpts.jobId).replace(/:/g, '-');

      if (!safeOpts.jobId.trim()) {
        delete safeOpts.jobId;
      }
    }

    const job = await queue.add(name, data, safeOpts);

    return {
      ok: true,
      jobId: String(job.id),
    };
  } catch (err) {
    console.error(
      `[notificationQueue] Failed to enqueue "${name}":`,
      err.message
    );

    return {
      ok: false,
      error: err.message,
    };
  }
}

function isQueueReady() {
  return connection.status === 'ready';
}

module.exports = {
  queue,
  enqueue,
  QUEUE_NAME,
  connection,
  isQueueReady,
};

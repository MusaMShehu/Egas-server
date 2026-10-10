const Counter = require('../models/Counter');

/**
 * Atomic counters for human-readable IDs.
 * Counter schema: { _id: String, seq: Number }
 */

async function nextSequence(counterKey) {
  const doc = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
}

function pad(num, len = 6) {
  return String(num).padStart(len, '0');
}

exports.generateRequestNumber = async () => {
  const seq = await nextSequence('plant_refill_request');
  return `PR-${pad(seq)}`;
};

exports.generateTransactionNumber = async () => {
  const seq = await nextSequence('plant_refill_transaction');
  return `PT-${pad(seq)}`;
};

exports.generateSettlementNumber = async (year, month, letter = 'A') => {
  const seq = await nextSequence(`settlement_${year}_${month}_${letter}`);
  return `STL-${year}-${pad(month, 2)}-${letter}-${pad(seq, 4)}`;
};

exports.generateDisputeNumber = async () => {
  const seq = await nextSequence('dispute');
  return `DSP-${pad(seq)}`;
};
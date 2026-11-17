'use strict';

// In-process serialization prevents overlapping submissions with the same
// request identity. This does not replace database constraints or transactions.
const submissionQueues = new Map();

function submissionQueueKey(data, machineLines = []) {
  const workerId = Number(data?.worker_id || data?.workerId || 0);
  const clientRequestId = String(data?.client_request_id || '').trim();
  if (clientRequestId) return `client:${workerId}:${clientRequestId}`;

  const logicalDuplicateKey = String(data?.logical_duplicate_key || '').trim();
  if (logicalDuplicateKey) return `logical:${workerId}:${logicalDuplicateKey}`;

  const machineCodes = [...new Set((Array.isArray(machineLines) ? machineLines : [])
    .map((line) => String(line?.machine_code || '').trim().toUpperCase())
    .filter(Boolean))].sort().join(',');

  return `capacity:${workerId}:${Number(data?.process_id || 0)}:${String(data?.work_date || '').slice(0, 10)}:${String(data?.shift || '').trim().toUpperCase()}:${machineCodes}`;
}

async function runSerializedSubmission(key, task) {
  const previous = submissionQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  submissionQueues.set(key, current);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (submissionQueues.get(key) === current) {
      submissionQueues.delete(key);
    }
  }
}

module.exports = { submissionQueueKey, runSerializedSubmission };

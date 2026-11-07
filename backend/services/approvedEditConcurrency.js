'use strict';

// Serialize approved edits for the same report within one API process.
// DB-level SELECT ... FOR UPDATE on production_reports still protects
// transactions across independent processes/instances.
function createApprovedEditGuard() {
  const queues = new Map();

  const isRetryableLockError = (error) =>
    Number(error?.errno) === 1205
    || Number(error?.errno) === 1213
    || ['ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK'].includes(String(error?.code || '').toUpperCase());

  const enqueue = async (reportId, operation) => {
    const id = Number(reportId);
    if (!Number.isInteger(id) || id <= 0) return operation();
    const key = String(id);
    const previous = queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    queues.set(key, current);

    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(key) === current) queues.delete(key);
    }
  };

  return function withApprovedEditConcurrency(operation, fallbackReason) {
    return async (input) => {
      const args = { ...input };
      if (!String(args.reason || '').trim()) args.reason = fallbackReason;

      return enqueue(args.reportId, async () => {
        const delays = [250, 600, 1200];
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            return await operation(args);
          } catch (error) {
            if (!isRetryableLockError(error) || attempt === 3) throw error;
            await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
          }
        }
      });
    };
  };
}

module.exports = { createApprovedEditGuard };

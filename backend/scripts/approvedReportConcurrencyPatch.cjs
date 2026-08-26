// Approved-report concurrency hardening.
// Keep the database row lock in the service and serialize edits/restores per
// report inside the API process. This gives every writer the same lock order:
// production_reports -> report_versions -> children -> audit -> COMMIT.
// It also prevents duplicate PUTs from fighting over report_versions.
const approvedService = require('../services/approvedReportEditService');

const queues = new Map();

function isRetryableLockError(error) {
  return Number(error?.errno) === 1205
    || String(error?.code || '').toUpperCase() === 'ER_LOCK_WAIT_TIMEOUT'
    || Number(error?.errno) === 1213
    || String(error?.code || '').toUpperCase() === 'ER_LOCK_DEADLOCK';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportKey(args) {
  const input = args?.[0] || {};
  const id = Number(input.reportId);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

async function enqueue(key, operation) {
  if (!key) return operation();

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
}

function withDefaultReason(args, fallback) {
  const input = { ...(args?.[0] || {}) };
  if (!String(input.reason || '').trim()) input.reason = fallback;
  return [input, ...args.slice(1)];
}

function wrapTransactionalOperation(name, fallbackReason) {
  const original = approvedService[name];
  if (typeof original !== 'function' || original.__ktcConcurrencyWrapped) return;

  const wrapped = async function concurrencySafeOperation(...rawArgs) {
    const args = withDefaultReason(rawArgs, fallbackReason);
    const key = reportKey(args);

    return enqueue(key, async () => {
      const delays = [250, 600, 1200];
      let lastError;

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          // Important: retry the COMPLETE transaction, never an individual SQL
          // statement. The service owns BEGIN/ROLLBACK/COMMIT and releases its
          // connection in finally.
          return await original(...args);
        } catch (error) {
          lastError = error;
          if (!isRetryableLockError(error) || attempt >= 4) throw error;
          await sleep(delays[attempt - 1]);
        }
      }

      throw lastError;
    });
  };

  Object.defineProperty(wrapped, '__ktcConcurrencyWrapped', { value: true });
  approvedService[name] = wrapped;
}

wrapTransactionalOperation('updateApprovedReport', 'Cập nhật báo cáo đã duyệt');
wrapTransactionalOperation('restoreApprovedReportVersion', 'Khôi phục phiên bản báo cáo');

console.log('[KTC] Approved-report concurrency hardening loaded: per-report queue + transaction retry.');

// Approved-report concurrency hardening.
// All approved-report writers must acquire locks in the same order:
// production_reports -> report_versions -> child rows -> audit -> COMMIT.
// The per-report queue prevents duplicate PUTs from competing in one API
// process, while the DB lock-order guard also protects callers outside the
// approved-report edit service.
const db = require('../config/db');
const approvedService = require('../services/approvedReportEditService');

const queues = new Map();
const patchedPools = new WeakSet();

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
  // The UI no longer needs a separate reason field for ordinary approved edits.
  // Keep an auditable default for old callers that still omit it.
  if (!String(input.reason || '').trim()) input.reason = fallback;
  return [input, ...args.slice(1)];
}

function patchVersionLockOrder() {
  const promisePool = db.promise();
  if (!promisePool || patchedPools.has(promisePool)) return;
  patchedPools.add(promisePool);

  const originalGetConnection = promisePool.getConnection.bind(promisePool);
  promisePool.getConnection = async (...args) => {
    const connection = await originalGetConnection(...args);
    if (!connection || connection.__ktcApprovedVersionLockOrderPatched) return connection;

    const originalQuery = connection.query.bind(connection);
    connection.query = async (sql, params = [], ...rest) => {
      const text = String(sql || '');
      const isVersionLock = /SELECT\s+version_no\s+FROM\s+report_versions[\s\S]*FOR\s+UPDATE/i.test(text);
      if (isVersionLock && Array.isArray(params) && params.length >= 2) {
        const reportId = Number(params[1]);
        if (Number.isInteger(reportId) && reportId > 0) {
          // Use the same connection so the lock participates in the caller's
          // transaction. If the report is already locked by this transaction,
          // this is a harmless re-entrant lock acquisition.
          await originalQuery(
            'SELECT id FROM production_reports WHERE id=? FOR UPDATE',
            [reportId],
          );
        }
      }
      return originalQuery(sql, params, ...rest);
    };

    connection.__ktcApprovedVersionLockOrderPatched = true;
    return connection;
  };
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
          // Retry the COMPLETE transaction, never an individual SQL statement.
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

patchVersionLockOrder();
wrapTransactionalOperation('updateApprovedReport', 'Cập nhật báo cáo đã duyệt');
wrapTransactionalOperation('restoreApprovedReportVersion', 'Khôi phục phiên bản báo cáo');

console.log('[KTC] Approved-report concurrency hardening loaded: per-report queue + DB lock-order guard + transaction retry.');

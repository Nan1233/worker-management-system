// Runtime hardening for approved-report edits.
// The edit service historically acquired production_reports FOR UPDATE before
// doing validation/version work. That keeps the row locked for the whole
// transaction and can produce ER_LOCK_WAIT_TIMEOUT under concurrent requests.
//
// We keep the existing transaction/audit/version logic, but make the initial
// read non-locking and retry the whole transaction for transient InnoDB/TiDB
// lock conflicts. The actual UPDATE remains the write boundary, and the API
// already requires expected_updated_at for optimistic concurrency.
const db = require('../config/db');
const approvedService = require('../services/approvedReportEditService');

const originalPromise = db.promise.bind(db);
const promisePoolCache = new WeakMap();

function patchPromisePool(promisePool) {
  if (!promisePool || promisePoolCache.has(promisePool)) return promisePool;

  const originalGetConnection = promisePool.getConnection.bind(promisePool);
  promisePool.getConnection = async function patchedGetConnection(...args) {
    const connection = await originalGetConnection(...args);
    if (!connection || connection.__ktcApprovedReportConcurrencyPatched) return connection;

    const originalQuery = connection.query.bind(connection);
    connection.query = async function patchedQuery(sql, ...queryArgs) {
      let nextSql = sql;
      if (
        typeof sql === 'string'
        && /SELECT\s+\*\s+FROM\s+production_reports\s+WHERE\s+id=\?\s+FOR\s+UPDATE\s*$/i.test(sql)
        && new Error().stack?.includes('approvedReportEditService.js')
      ) {
        nextSql = sql.replace(/\s+FOR\s+UPDATE\s*$/i, '');
      }
      return originalQuery(nextSql, ...queryArgs);
    };

    connection.__ktcApprovedReportConcurrencyPatched = true;
    return connection;
  };

  promisePoolCache.set(promisePool, true);
  return promisePool;
}

db.promise = function patchedPromise() {
  return patchPromisePool(originalPromise());
};

function isRetryableLockError(error) {
  return Number(error?.errno) === 1205
    || String(error?.code || '').toUpperCase() === 'ER_LOCK_WAIT_TIMEOUT'
    || Number(error?.errno) === 1213
    || String(error?.code || '').toUpperCase() === 'ER_LOCK_DEADLOCK';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapTransactionalOperation(name) {
  const original = approvedService[name];
  if (typeof original !== 'function' || original.__ktcConcurrencyWrapped) return;

  const wrapped = async function concurrencySafeOperation(...args) {
    const maxAttempts = 4;
    const delays = [300, 700, 1400];
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await original(...args);
      } catch (error) {
        lastError = error;
        if (!isRetryableLockError(error) || attempt >= maxAttempts) throw error;
        await sleep(delays[attempt - 1]);
      }
    }

    throw lastError;
  };

  Object.defineProperty(wrapped, '__ktcConcurrencyWrapped', { value: true });
  approvedService[name] = wrapped;
}

wrapTransactionalOperation('updateApprovedReport');
wrapTransactionalOperation('restoreApprovedReportVersion');

console.log('[KTC] Approved-report concurrency hardening loaded: non-locking initial read + transaction retry.');

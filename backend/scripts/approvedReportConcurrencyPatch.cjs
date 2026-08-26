// Approved-report concurrency hardening.
// All approved-report writers use the same lock order:
// production_reports -> report_versions -> child rows -> audit -> COMMIT.
// Duplicate PUTs are serialized per report in the API process. The DB guard
// also enforces the same lock order for version writers outside this service.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');

// Excel KPI compatibility patch.
// The deployed export service historically calculated "Tỷ lệ đạt" from
// output/hour divided by the hourly standard, while the business rule is:
//   Định mức = Định mức SP/giờ × Thời gian thực tế
//   % thực tích = Thực tích / Định mức × % học việc
// Patch the source before the service is required so every export process uses
// the canonical formula without changing the stored report snapshot.
function patchExcelAchievementFormula() {
  const servicePath = path.join(__dirname, '../services/consolidatedExcelExportService.js');
  try {
    let source = fs.readFileSync(servicePath, 'utf8');
    const oldBlock = `  const standard = machineMetrics?.machine_count > 0
    ? 0
    : toNumber(report.standard_output);

  const actualTime =
    toNumber(
      report.actual_time
    );

  const outputPerHour =
    actualTime > 0
      ? totalOutput / actualTime
      : 0;

  const achievementRate = machineMetrics?.machine_count > 0
    ? (Number(machineMetrics.maximum_output || 0) > 0 ? Number(machineMetrics.counted_output || 0) / Number(machineMetrics.maximum_output) : 0)
    : (standard > 0 ? outputPerHour / standard : 0);`;

    const newBlock = `  // Định mức Excel = định mức SP/giờ × thời gian thực tế.
  const standardPerHour = machineMetrics?.machine_count > 0
    ? 0
    : toNumber(report.standard_output);

  const actualTime =
    toNumber(
      report.actual_time
    );

  const standard = standardPerHour > 0 && actualTime > 0
    ? standardPerHour * actualTime
    : 0;

  const outputPerHour =
    actualTime > 0
      ? totalOutput / actualTime
      : 0;

  // Tỷ lệ đạt trong Excel = % thực tích
  // = Thực tích / Định mức × % học việc.
  const achievementRate = machineMetrics?.machine_count > 0
    ? (Number(machineMetrics.maximum_output || 0) > 0
      ? Number(machineMetrics.counted_output || 0) / Number(machineMetrics.maximum_output)
      : 0)
    : (standard > 0 ? (totalOutput / standard) * trainingFactor(report.training_percent) : 0);`;

    if (source.includes(oldBlock)) {
      source = source.replace(oldBlock, newBlock);
      fs.writeFileSync(servicePath, source, 'utf8');
      console.log('[KTC] Excel KPI formula patched: standard = SP/h × actual hours; achievement = actual/standard × training factor.');
    } else if (source.includes('const standardPerHour = machineMetrics?.machine_count > 0')) {
      console.log('[KTC] Excel KPI formula already patched.');
    } else {
      console.warn('[KTC] Excel KPI formula patch target not found; export service left unchanged.');
    }
  } catch (error) {
    console.warn('[KTC] Excel KPI startup patch skipped:', error?.message || error);
  }
}

patchExcelAchievementFormula();

const approvedService = require('../services/approvedReportEditService');

const queues = new Map();
const patchedPools = new WeakSet();
const originalPromise = db.promise.bind(db);

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

function patchPromisePool(promisePool) {
  if (!promisePool || patchedPools.has(promisePool)) return promisePool;
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
          // Acquire the parent report lock first on the SAME transaction.
          // approvedReportEditService already owns this lock, so this is
          // re-entrant for that path; other version writers now get the same
          // deterministic lock order and cannot deadlock report/version rows.
          await originalQuery('SELECT id FROM production_reports WHERE id=? FOR UPDATE', [reportId]);
        }
      }
      return originalQuery(sql, params, ...rest);
    };

    connection.__ktcApprovedVersionLockOrderPatched = true;
    return connection;
  };

  return promisePool;
}

db.promise = function patchedPromise() {
  return patchPromisePool(originalPromise());
};

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

console.log('[KTC] Approved-report concurrency hardening loaded: per-report queue + DB lock-order guard + transaction retry.');

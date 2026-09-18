const db = require("../config/db");

// TiDB Cloud Serverless does not allow concurrent statements on the same
// transaction connection. Keep transaction-bound statements strictly
// sequential even when application code uses Promise.all().
const transactionQueues = new WeakMap();

const enqueueTransactionQuery = (executor, task) => {
    const previous = transactionQueues.get(executor) || Promise.resolve();
    const current = previous.then(task, task);
    transactionQueues.set(executor, current.catch(() => {}));
    return current;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableLockTimeout = (error) =>
    Number(error?.errno) === 1205
    || Number(error?.errno) === 1213
    || String(error?.code || "") === "ER_LOCK_DEADLOCK"
    || String(error?.message || "").includes("Lock wait timeout exceeded")
    || String(error?.message || "").includes("Deadlock found when trying to get lock");

const executeRaw = (executor, sql, params = []) =>
    new Promise((resolve, reject) => {
        executor.query(sql, params, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });

const isTempReportApprovalSelect = (sql) => {
    const text = String(sql || "");
    return /FROM\s+production_reports_temp\s+temp/i.test(text)
        && /\bFOR\s+UPDATE\b/i.test(text);
};

const removeApprovalRowLock = (sql) =>
    String(sql || "").replace(/\s+FOR\s+UPDATE\b/gi, "");

const queryWithLockRetry = async (executor, sql, params = []) => {
    // Approval selection is optimistic (status + updated_at are checked
    // before writes). Do not hold a pessimistic temp-row lock across standard
    // resolution, snapshot creation and audit writes on TiDB Cloud Serverless.
    const effectiveSql = isTempReportApprovalSelect(sql)
        ? removeApprovalRowLock(sql)
        : sql;

    // TiDB 1205 may happen while another approval transaction is committing.
    // Retry only transient lock/deadlock errors. Backoff is capped so this
    // cannot turn a database contention issue into an unbounded Worker wait.
    const maxAttempts = 7;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await executeRaw(executor, effectiveSql, params);
        } catch (error) {
            lastError = error;
            if (!isRetryableLockTimeout(error) || attempt >= maxAttempts - 1) throw error;
            // 250, 500, 1000, 1500, 2000, 2500 ms. Keep the final retry bounded.
            await sleep(Math.min(250 * (attempt + 1), 2500));
        }
    }
    throw lastError;
};

/**
 * Execute a SQL statement and normalize MySQL/TiDB INSERT metadata.
 *
 * Cloudflare Worker deployments can expose a ResultSetHeader without a
 * usable insertId even though TiDB successfully inserted the auto-increment
 * row. The production-report transaction depends on that id immediately
 * afterwards, so recover LAST_INSERT_ID() on the same connection when the
 * driver did not populate result.insertId.
 */
const executeQuery = async (executor, sql, params = []) => {
    const result = await queryWithLockRetry(executor, sql, params);

    const isInsert = /^\s*INSERT\s+/i.test(String(sql || ""));
    const currentInsertId = Number(result?.insertId || 0);

    if (!isInsert || currentInsertId > 0) {
        return result;
    }

    const idRows = await queryWithLockRetry(executor, "SELECT LAST_INSERT_ID() AS insertId", []);
    const insertId = Number(idRows?.[0]?.insertId || 0);
    return {
        ...(result || {}),
        insertId,
    };
};

const query = (executor, sql, params = []) => {
    if (executor?.__ktcTransactionActive) {
        return enqueueTransactionQuery(executor, () => executeQuery(executor, sql, params));
    }
    return executeQuery(executor, sql, params);
};

/**
 * Keep the production submission connection setup limited to features that
 * are supported by the TiDB Cloud Serverless runtime used by Cloudflare.
 *
 * Do not issue TiDB-specific optional SET SESSION variables here. The
 * connected TiDB version may reject them with Error 1193 and turn an
 * otherwise valid production submission into HTTP 500.
 */
const prepareProductionSubmissionConnection = async (connection) => connection;

const getConnection = () =>
    new Promise((resolve, reject) => {
        db.getConnection(async (error, connection) => {
            if (error) return reject(error);
            try {
                await prepareProductionSubmissionConnection(connection);
                resolve(connection);
            } catch (prepareError) {
                console.warn("[KTC][DB] optional connection setup unavailable", {
                    message: prepareError?.message,
                    code: prepareError?.code,
                });
                resolve(connection);
            }
        });
    });

const beginTransaction = (connection) =>
    new Promise((resolve, reject) => {
        connection.beginTransaction((error) => {
            if (error) return reject(error);
            connection.__ktcTransactionActive = true;
            resolve();
        });
    });

const commit = (connection) =>
    new Promise((resolve, reject) => {
        connection.commit((error) => {
            if (error) return reject(error);
            connection.__ktcTransactionActive = false;
            transactionQueues.delete(connection);
            resolve();
        });
    });

const rollback = (connection) =>
    new Promise((resolve) => connection.rollback(() => {
        connection.__ktcTransactionActive = false;
        transactionQueues.delete(connection);
        resolve();
    }));

const normalizeIds = (ids) => [
    ...new Set(
        (Array.isArray(ids) ? ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
    )
].sort((a, b) => a - b);

const editableFields = [
    "work_date",
    "entry_date",
    "shift",
    "operation_mode",
    "operation_type",
    "machine_no",
    "product_name",
    "total_time",
    "actual_time",
    "deduction_time",
    "standard_output",
    "standard_version_id",
    "machine_standard_id",
    "exclude_kqd_from_tt_snapshot",
    "actual_output",
    "tt_ok",
    "tt_ng",
    "note",
    "extra_data"
];

module.exports = {
    query,
    getConnection,
    beginTransaction,
    commit,
    rollback,
    normalizeIds,
    editableFields,
};

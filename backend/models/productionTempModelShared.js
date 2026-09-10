const db = require("../config/db");

/**
 * Execute a SQL statement and normalize MySQL/TiDB INSERT metadata.
 *
 * Cloudflare Worker deployments can expose a ResultSetHeader without a
 * usable insertId even though TiDB successfully inserted the auto-increment
 * row.  The production-report transaction depends on that id immediately
 * afterwards, so recover LAST_INSERT_ID() on the same connection when the
 * driver did not populate result.insertId.
 */
const query = (executor, sql, params = []) =>
    new Promise((resolve, reject) => {
        executor.query(sql, params, (error, result) => {
            if (error) return reject(error);

            const isInsert = /^\s*INSERT\s+/i.test(String(sql || ""));
            const currentInsertId = Number(result?.insertId || 0);

            if (!isInsert || currentInsertId > 0) {
                return resolve(result);
            }

            executor.query("SELECT LAST_INSERT_ID() AS insertId", [], (idError, idRows) => {
                if (idError) return reject(idError);
                const insertId = Number(idRows?.[0]?.insertId || 0);
                resolve({
                    ...(result || {}),
                    insertId
                });
            });
        });
    });

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
            resolve();
        });
    });

const commit = (connection) =>
    new Promise((resolve, reject) => {
        connection.commit((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

const rollback = (connection) =>
    new Promise((resolve) => connection.rollback(resolve));

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

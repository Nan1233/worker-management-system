const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === "true" || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
const tidbConnect = globalThis.__KTC_TIDB_CONNECT;

const requiredVariables = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const getMissingDatabaseVariables = () => requiredVariables.filter((name) => !process.env[name]);

function parsePositiveInteger(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getErrorDetail(error) {
  if (error == null) return "Unknown database error";
  if (typeof error === "string") return error;
  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (message) return message;
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {}
  return String(error);
}

function wrapCloudflareError(error, sql) {
  const wrapped = new Error(`TiDB query failed: ${getErrorDetail(error)}`);
  if (error && typeof error === "object") {
    for (const key of ["code", "errno", "sqlState", "status", "statusCode"]) {
      if (error[key] != null) wrapped[key] = error[key];
    }
  }
  wrapped.cause = error;
  if (isCloudflareWorker) {
    console.error("[KTC][DB] TiDB query failed", JSON.stringify({
      message: getErrorDetail(error),
      code: error?.code ?? null,
      errno: error?.errno ?? null,
      sqlState: error?.sqlState ?? null,
      status: error?.status ?? error?.statusCode ?? null,
      sql: String(sql || "").replace(/\s+/g, " ").trim().slice(0, 500),
    }));
  }
  return wrapped;
}

function splitQueryArgs(args) {
  const values = [...args];
  const callback = typeof values.at(-1) === "function" ? values.pop() : null;
  let sql = values[0];
  let params = values[1];
  if (sql && typeof sql === "object") {
    params = sql.values ?? sql.params ?? params;
    sql = sql.sql;
  }
  return {
    sql: String(sql ?? ""),
    params: Array.isArray(params) ? params : params == null ? [] : [params],
    callback,
  };
}

function normalizeCloudflareResult(result) {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (Array.isArray(result.rows)) return [result.rows, result.fields || []];
    return [{
      affectedRows: Number(result.rowsAffected ?? 0),
      insertId: Number(result.lastInsertId ?? 0),
      changedRows: Number(result.rowsAffected ?? 0),
      warningStatus: 0,
    }, result.fields || []];
  }
  return [Array.isArray(result) ? result : [], []];
}

function createCloudflareConnection() {
  if (typeof tidbConnect !== "function") {
    throw new Error("TiDB Serverless Driver chưa được khởi tạo trong Cloudflare Worker");
  }
  const databaseUrl = String(process.env.TIDB_DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("Cloudflare Worker thiếu secret TIDB_DATABASE_URL");

  const conn = tidbConnect({ url: databaseUrl });
  let transaction = null;
  let closed = false;

  async function executeRaw(sql, params = []) {
    if (closed) throw new Error("Database connection đã được đóng");
    try {
      const client = transaction || conn;
      return await client.execute(sql, params, { fullResult: true });
    } catch (error) {
      throw wrapCloudflareError(error, sql);
    }
  }

  async function queryPromise(...args) {
    const { sql, params } = splitQueryArgs(args);
    if (!sql) throw new Error("SQL query rỗng");
    return normalizeCloudflareResult(await executeRaw(sql, params));
  }

  const connection = {
    query(...args) {
      const { callback } = splitQueryArgs(args);
      const promise = queryPromise(...args);
      if (callback) {
        promise.then(([rows, fields]) => callback(null, rows, fields), callback);
        return undefined;
      }
      return promise;
    },
    execute(...args) {
      const { callback } = splitQueryArgs(args);
      const promise = queryPromise(...args);
      if (callback) {
        promise.then(([rows, fields]) => callback(null, rows, fields), callback);
        return undefined;
      }
      return promise;
    },
    async beginTransaction(callback) {
      const promise = (async () => {
        if (transaction) throw new Error("Transaction đã được mở trên connection này");
        try { transaction = await conn.begin(); } catch (error) { throw wrapCloudflareError(error, "BEGIN"); }
      })();
      if (typeof callback === "function") { promise.then(() => callback(null), callback); return undefined; }
      return promise;
    },
    async commit(callback) {
      const promise = (async () => {
        if (!transaction) throw new Error("Không có transaction đang mở");
        const current = transaction;
        transaction = null;
        try { await current.commit(); } catch (error) { throw wrapCloudflareError(error, "COMMIT"); }
      })();
      if (typeof callback === "function") { promise.then(() => callback(null), callback); return undefined; }
      return promise;
    },
    async rollback(callback) {
      const promise = (async () => {
        if (!transaction) return;
        const current = transaction;
        transaction = null;
        try { await current.rollback(); } catch (error) { throw wrapCloudflareError(error, "ROLLBACK"); }
      })();
      if (typeof callback === "function") { promise.then(() => callback(null), callback); return undefined; }
      return promise;
    },
    async release() { closed = true; transaction = null; },
    async end() { closed = true; transaction = null; },
  };
  return connection;
}

if (isCloudflareWorker) {
  const cloudflareDb = {
    promise() {
      return {
        query: (...args) => {
          const { sql, params } = splitQueryArgs(args);
          return Promise.resolve().then(() => createCloudflareConnection()).then((connection) =>
            connection.query(sql, params).finally(() => connection.release())
          );
        },
        execute: (...args) => {
          const { sql, params } = splitQueryArgs(args);
          return Promise.resolve().then(() => createCloudflareConnection()).then((connection) =>
            connection.execute(sql, params).finally(() => connection.release())
          );
        },
        getConnection: async () => createCloudflareConnection(),
        end: async () => {},
      };
    },
    query(...args) {
      const { callback } = splitQueryArgs(args);
      const promise = this.promise().query(...args);
      if (callback) {
        promise.then(([rows, fields]) => callback(null, rows, fields), callback);
        return undefined;
      }
      return promise;
    },
    execute(...args) {
      const { callback } = splitQueryArgs(args);
      const promise = this.promise().execute(...args);
      if (callback) {
        promise.then(([rows, fields]) => callback(null, rows, fields), callback);
        return undefined;
      }
      return promise;
    },
    getConnection(callback) {
      const promise = Promise.resolve().then(() => createCloudflareConnection());
      if (typeof callback === "function") { promise.then((connection) => callback(null, connection), callback); return undefined; }
      return promise;
    },
    async testConnection() {
      const missing = getMissingDatabaseVariables();
      if (missing.length > 0) throw new Error(`Thiếu biến môi trường database: ${missing.join(", ")}`);
      const connection = createCloudflareConnection();
      try {
        await connection.query("SELECT 1 AS ok");
        return { ssl: true, host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 4000) };
      } finally {
        await connection.release();
      }
    },
    closePool: async () => {},
    getMissingDatabaseVariables,
  };
  module.exports = cloudflareDb;
} else {
  const dbPort = parsePositiveInteger(process.env.DB_PORT, 4000, { max: 65535 });
  const useSsl = ["true", "1", "yes"].includes(String(process.env.DB_SSL ?? process.env.MYSQL_SSL ?? "true").toLowerCase());
  const sslCa = String(process.env.DB_SSL_CA || "").trim().replace(/\\\\n/g, "\n");
  const ssl = useSsl ? { minVersion: "TLSv1.2", rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) } : undefined;
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: dbPort, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, ssl, waitForConnections: true,
    connectionLimit: parsePositiveInteger(process.env.DB_CONNECTION_LIMIT, 6, { max: 20 }),
    maxIdle: parsePositiveInteger(process.env.DB_MAX_IDLE, 3, { max: 10 }),
    idleTimeout: parsePositiveInteger(process.env.DB_IDLE_TIMEOUT, 60_000, { max: 600_000 }),
    queueLimit: parsePositiveInteger(process.env.DB_QUEUE_LIMIT, 100, { max: 10_000 }),
    enableKeepAlive: true, keepAliveInitialDelay: parsePositiveInteger(process.env.DB_KEEP_ALIVE_DELAY, 10_000, { max: 120_000 }),
    connectTimeout: parsePositiveInteger(process.env.DB_CONNECT_TIMEOUT, 15_000, { max: 120_000 }),
    charset: "utf8mb4", decimalNumbers: true,
  });
  let connectionCheckPromise = null;
  async function testConnection() {
    if (connectionCheckPromise) return connectionCheckPromise;
    connectionCheckPromise = (async () => {
      const missing = getMissingDatabaseVariables();
      if (missing.length > 0) throw new Error(`Thiếu biến môi trường database: ${missing.join(", ")}`);
      const connection = await pool.promise().getConnection();
      try { await connection.query("SELECT 1 AS ok"); return { ssl: useSsl, host: process.env.DB_HOST, port: dbPort }; }
      finally { connection.release(); }
    })();
    try { return await connectionCheckPromise; } finally { connectionCheckPromise = null; }
  }
  async function closePool() { await pool.promise().end(); }
  module.exports = pool;
  module.exports.testConnection = testConnection;
  module.exports.closePool = closePool;
  module.exports.getMissingDatabaseVariables = getMissingDatabaseVariables;
}
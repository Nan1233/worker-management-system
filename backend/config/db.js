const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

const isCloudflareWorker = Boolean(globalThis.__KTC_CLOUDFLARE_ENV);
const tidbConnect = globalThis.__KTC_TIDB_CONNECT;

const requiredVariables = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

function getMissingDatabaseVariables() {
  return requiredVariables.filter((name) => !process.env[name]);
}

function parsePositiveInteger(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const dbPort = parsePositiveInteger(process.env.DB_PORT, 4000, { max: 65535 });
const useSsl = ["true", "1", "yes"].includes(
  String(process.env.DB_SSL ?? process.env.MYSQL_SSL ?? "true").toLowerCase(),
);

function normalizePem(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "...") return "";
  return raw.replace(/\\\\n/g, "\\n");
}

const sslCa = normalizePem(process.env.DB_SSL_CA);
const ssl = useSsl
  ? {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      ...(sslCa ? { ca: sslCa } : {}),
    }
  : undefined;

function getTiDBDatabaseUrl() {
  const url = String(process.env.TIDB_DATABASE_URL || "").trim();
  if (!url) {
    throw new Error("Cloudflare Worker thiếu secret TIDB_DATABASE_URL");
  }
  return url;
}

function assertCloudflareDriver() {
  if (!tidbConnect) {
    throw new Error("Cloudflare Worker chưa nạp được TiDB Serverless Driver");
  }
}

function normalizeExecuteResult(result) {
  // TiDB Serverless Driver with fullResult=true returns an object containing
  // rows for SELECT-like statements and rowsAffected/lastInsertId for writes.
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (Array.isArray(result.rows)) {
      return [result.rows, result.fields || []];
    }

    return [
      {
        affectedRows: Number(result.rowsAffected ?? 0),
        insertId: Number(result.lastInsertId ?? 0),
        changedRows: Number(result.rowsAffected ?? 0),
        warningStatus: 0,
      },
      result.fields || [],
    ];
  }

  return [Array.isArray(result) ? result : [], []];
}

function splitQueryArgs(args) {
  let callback = null;
  const values = [...args];
  if (typeof values[values.length - 1] === "function") callback = values.pop();

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

function createCloudflareConnection() {
  assertCloudflareDriver();

  const conn = tidbConnect({
    url: getTiDBDatabaseUrl(),
  });

  let transaction = null;
  let closed = false;

  async function executeRaw(sql, params = []) {
    if (closed) throw new Error("Database connection đã được đóng");
    const client = transaction || conn;
    return client.execute(sql, params, { fullResult: true });
  }

  async function queryPromise(...args) {
    const { sql, params } = splitQueryArgs(args);
    if (!sql) throw new Error("SQL query rỗng");
    return normalizeExecuteResult(await executeRaw(sql, params));
  }

  async function executePromise(...args) {
    const { sql, params } = splitQueryArgs(args);
    if (!sql) throw new Error("SQL execute rỗng");
    return normalizeExecuteResult(await executeRaw(sql, params));
  }

  function callbackOrPromise(operation, args) {
    const { callback } = splitQueryArgs(args);
    const promise = operation(...args);
    if (!callback) return promise;
    promise.then(
      ([result, fields]) => callback(null, result, fields),
      (error) => callback(error),
    );
    return undefined;
  }

  return {
    query(...args) {
      return callbackOrPromise(queryPromise, args);
    },
    execute(...args) {
      return callbackOrPromise(executePromise, args);
    },
    async beginTransaction(callback) {
      const promise = (async () => {
        if (transaction) throw new Error("Transaction đã được mở trên connection này");
        transaction = await conn.begin();
      })();
      if (typeof callback === "function") {
        promise.then(() => callback(null), callback);
        return undefined;
      }
      return promise;
    },
    async commit(callback) {
      const promise = (async () => {
        if (!transaction) throw new Error("Không có transaction đang mở");
        const current = transaction;
        transaction = null;
        await current.commit();
      })();
      if (typeof callback === "function") {
        promise.then(() => callback(null), callback);
        return undefined;
      }
      return promise;
    },
    async rollback(callback) {
      const promise = (async () => {
        if (!transaction) return;
        const current = transaction;
        transaction = null;
        await current.rollback();
      })();
      if (typeof callback === "function") {
        promise.then(() => callback(null), callback);
        return undefined;
      }
      return promise;
    },
    async release() {
      closed = true;
      transaction = null;
    },
    async end() {
      closed = true;
      transaction = null;
    },
  };
}

function createCloudflareDbFacade() {
  const getConnection = async () => createCloudflareConnection();

  const promiseApi = {
    query: (...args) => {
      const { sql, params } = splitQueryArgs(args);
      return createCloudflareConnection().then((connection) =>
        connection.query(sql, params).finally(() => connection.release()),
      );
    },
    execute: (...args) => {
      const { sql, params } = splitQueryArgs(args);
      return createCloudflareConnection().then((connection) =>
        connection.execute(sql, params).finally(() => connection.release()),
      );
    },
    getConnection,
    end: async () => {},
  };

  return {
    promise: () => promiseApi,
    query(...args) {
      return callbackOrPromiseFacade(promiseApi.query, args);
    },
    execute(...args) {
      return callbackOrPromiseFacade(promiseApi.execute, args);
    },
    getConnection(callback) {
      const promise = getConnection();
      if (typeof callback === "function") {
        promise.then((connection) => callback(null, connection), callback);
        return undefined;
      }
      return promise;
    },
  };
}

function callbackOrPromiseFacade(operation, args) {
  const { callback } = splitQueryArgs(args);
  const promise = operation(...args);
  if (!callback) return promise;
  promise.then(
    ([result, fields]) => callback(null, result, fields),
    (error) => callback(error),
  );
  return undefined;
}

// Cloudflare Workers use TiDB Cloud Serverless Driver over HTTPS. This avoids
// long-lived TCP connections and Hyperdrive while preserving the mysql2-like
// query/transaction API expected by the existing KTC models.
if (isCloudflareWorker) {
  const cloudflareDb = createCloudflareDbFacade();

  async function testConnection() {
    const missing = getMissingDatabaseVariables();
    if (missing.length > 0) {
      throw new Error(`Thiếu biến môi trường database: ${missing.join(", ")}`);
    }

    const connection = await cloudflareDb.promise().getConnection();
    try {
      await connection.query("SELECT 1 AS ok");
      return {
        ssl: true,
        host: process.env.DB_HOST,
        port: dbPort,
      };
    } finally {
      await connection.release();
    }
  }

  module.exports = cloudflareDb;
  module.exports.testConnection = testConnection;
  module.exports.closePool = async () => {};
  module.exports.getMissingDatabaseVariables = getMissingDatabaseVariables;
} else {
  // Render/Node path: keep the existing pool implementation unchanged.
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: dbPort,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
    waitForConnections: true,
    connectionLimit: parsePositiveInteger(process.env.DB_CONNECTION_LIMIT, 6, { max: 20 }),
    maxIdle: parsePositiveInteger(process.env.DB_MAX_IDLE, 3, { max: 10 }),
    idleTimeout: parsePositiveInteger(process.env.DB_IDLE_TIMEOUT, 60_000, { max: 600_000 }),
    queueLimit: parsePositiveInteger(process.env.DB_QUEUE_LIMIT, 100, { max: 10_000 }),
    enableKeepAlive: true,
    keepAliveInitialDelay: parsePositiveInteger(process.env.DB_KEEP_ALIVE_DELAY, 10_000, { max: 120_000 }),
    connectTimeout: parsePositiveInteger(process.env.DB_CONNECT_TIMEOUT, 15_000, { max: 120_000 }),
    charset: "utf8mb4",
    decimalNumbers: true,
  });

  let connectionCheckPromise = null;

  async function testConnection() {
    if (connectionCheckPromise) return connectionCheckPromise;

    connectionCheckPromise = (async () => {
      const missing = getMissingDatabaseVariables();
      if (missing.length > 0) {
        throw new Error(`Thiếu biến môi trường database: ${missing.join(", ")}`);
      }

      const connection = await pool.promise().getConnection();
      try {
        await connection.query("SELECT 1 AS ok");
        return { ssl: useSsl, host: process.env.DB_HOST, port: dbPort };
      } finally {
        connection.release();
      }
    })();

    try {
      return await connectionCheckPromise;
    } finally {
      connectionCheckPromise = null;
    }
  }

  async function closePool() {
    await pool.promise().end();
  }

  module.exports = pool;
  module.exports.testConnection = testConnection;
  module.exports.closePool = closePool;
  module.exports.getMissingDatabaseVariables = getMissingDatabaseVariables;
}

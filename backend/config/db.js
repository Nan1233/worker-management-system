const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

const hyperdrive = globalThis.__KTC_HYPERDRIVE;
const isCloudflareWorker = Boolean(globalThis.__KTC_CLOUDFLARE_ENV || hyperdrive);

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

function createCloudflareConnection() {
  if (!hyperdrive) {
    throw new Error("Cloudflare Worker thiếu binding HYPERDRIVE");
  }

  return mysqlPromise.createConnection({
    host: hyperdrive.host,
    port: hyperdrive.port,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    disableEval: true,
  });
}

function createCloudflareDbFacade() {
  const getConnection = async () => {
    const connection = await createCloudflareConnection();
    // Existing KTC code calls release() on pooled connections. For a
    // per-request Hyperdrive connection, release means closing that session.
    connection.release = connection.end.bind(connection);
    return connection;
  };

  const promiseApi = {
    query: async (...args) => {
      const connection = await getConnection();
      try {
        return await connection.query(...args);
      } finally {
        await connection.end();
      }
    },
    execute: async (...args) => {
      const connection = await getConnection();
      try {
        return await connection.execute(...args);
      } finally {
        await connection.end();
      }
    },
    getConnection,
    end: async () => {},
  };

  return {
    promise: () => promiseApi,
    query: (...args) => promiseApi.query(...args),
    execute: (...args) => promiseApi.execute(...args),
  };
}

// Cloudflare Workers cannot keep a traditional Node TCP pool alive between
// requests. Hyperdrive owns the upstream connection pool, so create a fresh
// mysql2/promise connection per operation while preserving transaction APIs.
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

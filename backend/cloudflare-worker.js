import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { connect as connectTiDB } from "@tidbcloud/serverless";

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_CLOUDFLARE_WORKER = true;
globalThis.__KTC_TIDB_CONNECT = connectTiDB;

for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

if (typeof env.TIDB_DATABASE_URL === "string" && env.TIDB_DATABASE_URL) {
  try {
    const url = new URL(env.TIDB_DATABASE_URL);
    const database = String(env.DB_NAME || "").trim();
    if (database) url.pathname = `/${encodeURIComponent(database)}`;
    process.env.TIDB_DATABASE_URL = url.toString();
  } catch {
    process.env.TIDB_DATABASE_URL = env.TIDB_DATABASE_URL;
  }
}

const cloudflareFrontendOrigin = "https://ktc-frontend.nan978971.workers.dev";
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!configuredCorsOrigins.includes(cloudflareFrontendOrigin)) {
  configuredCorsOrigins.push(cloudflareFrontendOrigin);
}
process.env.CORS_ORIGINS = configuredCorsOrigins.join(",");

process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start, app } = require("./server.js");
const ensureGcLong2801Lt = require("./scripts/ensureGcLong2801Lt");
const { masterDataCache } = require("./utils/masterDataCache");
const { query: ktcQuery } = require("./models/productionTempModelShared");
const productionTempCreateModel = require("./models/productionTempCreateModel");

// KTC production-temp uses a transaction-scoped row in
// production_report_duplicate_locks as a serialization point. On TiDB, a
// pessimistic transaction waits up to innodb_lock_wait_timeout (50s by default)
// for that row. That is longer than the browser request timeout and makes a
// healthy Internet connection look like an offline failure.
//
// Logical duplicate locking is still required for the business rule that
// prevents two similar reports from being created concurrently. The
// client_request_id path is different: it already has an exact idempotency
// lookup and a unique database index. Taking a second DB lock for that exact
// request only adds contention and can deadlock/retry against stale sessions.
// Therefore Cloudflare deliberately does NOT take the extra client-request
// lock. Exact retries are resolved by findByClientRequest / the unique index,
// while logicalDuplicateKey keeps the business duplicate serialization.
const DUPLICATE_LOCK_WAIT_SECONDS = 2;
const DEFAULT_LOCK_WAIT_SECONDS = 50;

function isTiDbLockTimeout(error) {
  return /(?:Error\s*)?(?:1205|3572)|lock wait timeout exceeded|nowait/i.test(String(error?.message || error || ""));
}

async function acquireBoundedDuplicateLock(logicalKey, executor) {
  if (!logicalKey) return;

  await ktcQuery(executor, `SET SESSION innodb_lock_wait_timeout = ${DUPLICATE_LOCK_WAIT_SECONDS}`);
  try {
    await ktcQuery(
      executor,
      `INSERT INTO production_report_duplicate_locks (logical_key, last_used_at)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_used_at = last_used_at`,
      [logicalKey]
    );
    await ktcQuery(
      executor,
      `SELECT logical_key
       FROM production_report_duplicate_locks
       WHERE logical_key = ?
       FOR UPDATE NOWAIT`,
      [logicalKey]
    );
  } catch (error) {
    if (isTiDbLockTimeout(error)) {
      const retryable = new Error("Máy chủ đang xử lý một báo cáo khác. Hệ thống sẽ tự thử lại.");
      retryable.code = "DUPLICATE_LOCK_BUSY";
      retryable.status = 503;
      retryable.isPublic = true;
      retryable.retryable = true;
      throw retryable;
    }
    throw error;
  } finally {
    try {
      await ktcQuery(executor, `SET SESSION innodb_lock_wait_timeout = ${DEFAULT_LOCK_WAIT_SECONDS}`);
    } catch {
      // The transaction may already be rolling back after a lock failure.
    }
  }
}

// Exact client_request_id idempotency is handled by the fast lookup in
// productionTempModel and by the database unique index. Do not create a second
// transaction lock for it in the Cloudflare/TiDB runtime.
productionTempCreateModel.lockClientRequestId = async () => {};

productionTempCreateModel.lockLogicalDuplicateKey = async (logicalDuplicateKey, executor) => {
  if (!logicalDuplicateKey) return;
  await acquireBoundedDuplicateLock(logicalDuplicateKey, executor);
};

// Cloudflare forbids asynchronous I/O during module evaluation/global scope.
// Seed only from a real request. The seed is idempotent and is awaited once per
// Worker isolate so the first master-data request cannot race the seed.
let cloudflareSeedReady = false;
let cloudflareSeedPromise = null;
async function ensureCloudflareSeeded() {
  if (cloudflareSeedReady) return true;
  if (cloudflareSeedPromise) return cloudflareSeedPromise;

  cloudflareSeedPromise = ensureGcLong2801Lt()
    .then(() => {
      masterDataCache.clear();
      cloudflareSeedReady = true;
      console.log("[KTC] Cloudflare GC master-data seed completed; master cache cleared");
      return true;
    })
    .catch((error) => {
      console.error("[KTC] Cloudflare GC master-data seed failed", error);
      cloudflareSeedPromise = null;
      return false;
    });

  return cloudflareSeedPromise;
}

const originalListen = app.listen.bind(app);
app.listen = (port, hostOrCallback, maybeCallback) => {
  if (typeof hostOrCallback === "string") {
    return originalListen(port, maybeCallback);
  }
  return originalListen(port, hostOrCallback);
};

const server = await start();
const httpHandler = httpServerHandler(server);

function getAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = new Set([
    "https://ktc-frontend.nan978971.workers.dev",
    "https://worker-management-system-3-dzox.onrender.com",
    "http://localhost:5173",
    "https://localhost",
    "capacitor://localhost",
    ...configuredCorsOrigins,
  ]);

  return allowed.has(origin) ? origin : null;
}

function handleCorsPreflight(request) {
  if (request.method !== "OPTIONS") return null;

  const origin = getAllowedOrigin(request);
  if (!origin) {
    return new Response(JSON.stringify({
      success: false,
      code: "CORS_ORIGIN_DENIED",
      message: "Nguồn truy cập không được phép bởi CORS",
    }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  const allowHeaders = requestedHeaders || [
    "Content-Type",
    "Authorization",
    "Idempotency-Key",
    "X-Cron-Secret",
    "X-Request-Id",
    "X-Frontend-Version",
  ].join(", ");

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": allowHeaders,
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin, Access-Control-Request-Headers",
      "Cache-Control": "no-store",
    },
  });
}

const wrappedServer = {
  async fetch(request, envArg, ctx) {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    await ensureCloudflareSeeded();
    return httpHandler.fetch(request, envArg, ctx);
  },
};

export default wrappedServer;

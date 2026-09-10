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
const productionTempCreateModel = require("./models/productionTempCreateModel");

// Cloudflare/TiDB runtime: do not use the auxiliary duplicate-lock table for
// report creation. That table can become a single hot row under normal worker
// activity and TiDB lock waits then turn valid submissions into 503 responses.
// Duplicate detection remains in productionTempCreateModel via the existing
// exact client_request_id lookup and logical duplicate query. This keeps the
// application-level duplicate confirmation flow without serializing every
// submission through a pessimistic lock.
productionTempCreateModel.lockClientRequestId = async () => {};
productionTempCreateModel.lockLogicalDuplicateKey = async () => {};

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

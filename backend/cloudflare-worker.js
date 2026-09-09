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

// Cloudflare forbids asynchronous I/O during module evaluation/global scope.
// Run the idempotent master-data seed from an actual request lifecycle.
const seedPromise = new Map();
async function ensureCloudflareSeeded() {
  if (seedPromise.has("2801")) return seedPromise.get("2801");
  const pending = ensureGcLong2801Lt().finally(() => seedPromise.delete("2801"));
  seedPromise.set("2801", pending);
  return pending;
}

const originalListen = app.listen.bind(app);
app.listen = (port, hostOrCallback, maybeCallback) => {
  if (typeof hostOrCallback === "string") {
    return originalListen(port, maybeCallback);
  }
  return originalListen(port, hostOrCallback);
};

const server = await start();

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
  fetch(request, envArg, ctx) {
    // Handle browser preflight before Express, auth, rate limiting or DB access.
    // This prevents an OPTIONS request from becoming a 500 because of an
    // unrelated runtime/DB initialization problem.
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    const seed = ensureCloudflareSeeded().catch((error) => {
      console.error("[KTC] Cloudflare GC master-data seed failed", error);
    });
    if (ctx?.waitUntil) ctx.waitUntil(seed);
    return server.fetch(request, envArg, ctx);
  },
};

export default wrappedServer;

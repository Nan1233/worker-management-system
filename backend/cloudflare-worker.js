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
const ensureGcDefectMasterData = require("./scripts/ensureGcDefectMasterData");
const ensureGcLong2801Lt = require("./scripts/ensureGcLong2801Lt");
const { masterDataCache } = require("./utils/masterDataCache");
const productionTempCreateModel = require("./models/productionTempCreateModel");

// Cloudflare/TiDB runtime: do not use the auxiliary duplicate-lock table for
// report creation. That table can become a single hot row under normal worker
// activity and TiDB lock waits then turn valid submissions into 503 responses.
productionTempCreateModel.lockClientRequestId = async () => {};
productionTempCreateModel.lockLogicalDuplicateKey = async () => {};

// Cloudflare forbids asynchronous I/O during module evaluation/global scope.
// Seed/repair master data only from a real request. The operations are
// idempotent and are awaited once per Worker isolate before serving the request.
let cloudflareSeedReady = false;
let cloudflareSeedPromise = null;
async function ensureCloudflareSeeded() {
  if (cloudflareSeedReady) return true;
  if (cloudflareSeedPromise) return cloudflareSeedPromise;

  cloudflareSeedPromise = Promise.all([
    ensureGcDefectMasterData(),
    ensureGcLong2801Lt(),
  ])
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

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

export default {
  async fetch(request, envArg, ctx) {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;

    const seeded = await ensureCloudflareSeeded();
    if (!seeded) {
      return new Response(JSON.stringify({
        success: false,
        code: "MASTER_DATA_BOOTSTRAP_FAILED",
        message: "Không thể đồng bộ dữ liệu danh mục máy/sản phẩm/lỗi. Vui lòng thử lại.",
      }), {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...(getAllowedOrigin(request)
            ? {
                "Access-Control-Allow-Origin": getAllowedOrigin(request),
                "Access-Control-Allow-Credentials": "true",
                "Vary": "Origin",
              }
            : {}),
        },
      });
    }

    const response = await httpHandler(request);
    const origin = getAllowedOrigin(request);
    if (!origin) return response;

    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

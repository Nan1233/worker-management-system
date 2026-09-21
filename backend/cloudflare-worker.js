import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { connect as connectTiDB } from "@tidbcloud/serverless";

globalThis.__KTC_CLOUDFLARE_ENV = env;
globalThis.__KTC_CLOUDFLARE_WORKER = true;
globalThis.__KTC_TIDB_CONNECT = connectTiDB;

for (const [key, value] of Object.entries(env)) {
  if (typeof value === "string") process.env[key] = value;
}

// Do not silently rewrite a valid TiDB URL with DB_NAME. A malformed/empty
// DB_NAME must never redirect the worker to the wrong database. Only inject
// DB_NAME when the URL has no pathname database component.
if (typeof env.TIDB_DATABASE_URL === "string" && env.TIDB_DATABASE_URL) {
  try {
    const url = new URL(env.TIDB_DATABASE_URL);
    const configuredDb = String(env.DB_NAME || "").trim();
    const pathnameDb = decodeURIComponent(String(url.pathname || "").replace(/^\/+/, "")).trim();
    if (!pathnameDb && configuredDb) {
      url.pathname = `/${encodeURIComponent(configuredDb)}`;
      process.env.TIDB_DATABASE_URL = url.toString();
    } else {
      process.env.TIDB_DATABASE_URL = url.toString();
    }
  } catch {
    process.env.TIDB_DATABASE_URL = env.TIDB_DATABASE_URL;
  }
}

const cloudflareFrontendOrigin = "https://ktc-frontend.nan978971.workers.dev";
const cloudflareTestFrontendOrigin = "https://ktc-fe-test.nan978971.workers.dev";
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
for (const origin of [cloudflareFrontendOrigin, cloudflareTestFrontendOrigin]) {
  if (!configuredCorsOrigins.includes(origin)) configuredCorsOrigins.push(origin);
}
process.env.CORS_ORIGINS = configuredCorsOrigins.join(",");
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start, app } = require("./server.js");
const db = require("./config/db");
const ensureGcDefectMasterData = require("./scripts/ensureGcDefectMasterData");
const ensureGcLong2801Lt = require("./scripts/ensureGcLong2801Lt");
const { masterDataCache } = require("./utils/masterDataCache");
const productionTempCreateModel = require("./models/productionTempCreateModel");

// Cloudflare/TiDB still needs the canonical DB locks. Do not disable them on
// the test worker: doing so makes two retries race before the idempotency row
// is visible and can produce misleading duplicate/500 combinations.

const originalDbPromise = db.promise.bind(db);
db.promise = () => {
  const api = originalDbPromise();
  const originalGetConnection = api.getConnection;
  if (typeof originalGetConnection === "function") {
    api.getConnection = async (...args) => {
      const connection = await originalGetConnection(...args);
      const originalRelease = connection.release.bind(connection);
      let released = false;
      connection.release = async () => {
        if (released) return;
        released = true;
        try { await connection.rollback(); } catch (_) {}
        return originalRelease();
      };
      return connection;
    };
  }
  return api;
};

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
if (!configuredCorsOrigins.includes(cloudflareFrontendOrigin)) configuredCorsOrigins.push(cloudflareFrontendOrigin);
process.env.CORS_ORIGINS = configuredCorsOrigins.join(",");
process.env.PORT = process.env.PORT || "3000";
process.env.KTC_CLOUDFLARE_WORKER = "true";

const { start, app } = require("./server.js");
const db = require("./config/db");
const ensureGcDefectMasterData = require("./scripts/ensureGcDefectMasterData");
const ensureGcLong2801Lt = require("./scripts/ensureGcLong2801Lt");
const { masterDataCache } = require("./utils/masterDataCache");
const productionTempCreateModel = require("./models/productionTempCreateModel");

productionTempCreateModel.lockClientRequestId = async () => {};
productionTempCreateModel.lockLogicalDuplicateKey = async () => {};

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

let cloudflareSeedReady = false;
let cloudflareSeedPromise = null;
async function ensureCloudflareSeeded() {
  if (cloudflareSeedReady) return true;
  if (cloudflareSeedPromise) return cloudflareSeedPromise;
  cloudflareSeedPromise = Promise.all([ensureGcDefectMasterData(), ensureGcLong2801Lt()])
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
  if (typeof hostOrCallback === "string") return originalListen(port, maybeCallback);
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
  if (!origin) return new Response(JSON.stringify({ success: false, code: "CORS_ORIGIN_DENIED", message: "Nguồn truy cập không được phép bởi CORS" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  const allowHeaders = requestedHeaders || ["Content-Type", "Authorization", "Idempotency-Key", "X-Cron-Secret", "X-Request-Id", "X-Frontend-Version"].join(", ");
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": allowHeaders, "Access-Control-Max-Age": "86400", "Vary": "Origin, Access-Control-Request-Headers", "Cache-Control": "no-store" } });
}

const BOOTSTRAP_EXEMPT_PATHS = new Set(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/health/live", "/api/health/ready"]);
function shouldBootstrapBeforeRequest(request) { return !BOOTSTRAP_EXEMPT_PATHS.has(new URL(request.url).pathname); }

const CANONICAL_EVENT_DEFECTS = new Map([
  ["KQD", "KQD"], ["VO_CAO_SU", "Vỡ cao su"], ["K_XUOC_CONG_GAY", "K xước cong gãy"],
  ["CAO_SU_XOAY", "Cao su xoay"], ["CAT_KHONG_DUT", "Cắt không đứt"], ["BAVIA", "Bavia"],
  ["CSH", "CSH"], ["PPCM", "PPCM"], ["KT_LON", "KT lớn"], ["KT_NHO", "KT nhỏ"], ["LCS", "LCS"],
  ["CAT_LEM", "Cắt lẹm"], ["RACH_NVL", "Rách NVL"], ["CHAN_NGAN_DAI", "Chân ngắn dài"],
  ["SOT_VIA", "Sót via"], ["FURE_TRUC", "Fure trục"], ["LAN_CS", "Lẫn CS"],
  ["BAVIA_CAT_HUT", "Bavia cắt hụt"], ["THIEU_CAO_SU", "Thiếu cao su"]
]);
const EVENT_DEFECT_ALIASES = new Map([
  ["KQD_DAP_LAI", "KQD"], ["KQD_TUOT", "KQD"], ["KQD_DL", "KQD"],
  ["VO_DO_LONG", "VO_CAO_SU"], ["VO_LONG", "VO_CAO_SU"],
  ["XUOC_DO_LONG", "K_XUOC_CONG_GAY"], ["XUOC_LONG", "K_XUOC_CONG_GAY"], ["CONG_GAY", "K_XUOC_CONG_GAY"],
  ["XOAY", "CAO_SU_XOAY"], ["KHONG_DUT", "CAT_KHONG_DUT"], ["BAVIA_HUT", "BAVIA"],
  ["CAO_SU", "LCS"], ["LOI_CAO_SU", "LCS"], ["CAT_LEM", "CAT_LEM"]
]);
function normalizeEventDefect(row) {
  const raw = String(row.defect_code || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const code = EVENT_DEFECT_ALIASES.get(raw) || raw;
  const name = CANONICAL_EVENT_DEFECTS.get(code);
  if (!name) return null;
  const quantity = Math.trunc(Number(row.quantity || 0));
  if (quantity <= 0) return null;
  return { id: Number(row.id) || undefined, defect_type_id: Number(row.defect_type_id) || undefined, defect_code: code, defect_name: name, quantity };
}
async function enrichApprovedReportMachineDefects(request, response) {
  const url = new URL(request.url);
  if (request.method !== "GET" || !/^\/api\/production\/\d+$/.test(url.pathname) || !response.ok) return response;
  try {
    const payload = await response.clone().json();
    const data = payload?.data;
    if (!data || !Array.isArray(data.defects) || data.defects.length > 0) return response;
    const reportId = Number(url.pathname.split("/").pop());
    const [rows] = await db.promise().query(`SELECT med.id,med.defect_type_id,med.defect_code,med.defect_name,med.quantity
      FROM production_report_machine_lines ml
      JOIN machine_production_event_defects med ON med.machine_event_id=ml.machine_event_id
      WHERE ml.report_id=? AND med.quantity>0 ORDER BY ml.sort_order,med.id`, [reportId]);
    const merged = new Map();
    for (const row of rows || []) {
      const item = normalizeEventDefect(row);
      if (!item) continue;
      const key = item.defect_code;
      const existing = merged.get(key);
      if (existing) existing.quantity += item.quantity;
      else merged.set(key, item);
    }
    if (!merged.size) return response;
    data.defects = [...merged.values()];
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("[KTC] approved report machine NG enrichment failed", error);
    return response;
  }
}

const wrappedServer = {
  async fetch(request, envArg, ctx) {
    const preflight = handleCorsPreflight(request);
    if (preflight) return preflight;
    if (shouldBootstrapBeforeRequest(request)) {
      const seeded = await ensureCloudflareSeeded();
      if (!seeded) console.warn("[KTC] Continuing request without master-data bootstrap; seed will retry on a later request.");
    }
    const response = await httpHandler.fetch(request, envArg, ctx);
    return enrichApprovedReportMachineDefects(request, response);
  },
};

export default wrappedServer;

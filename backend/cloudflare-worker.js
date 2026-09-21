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
    const configuredDb = String(env.DB_NAME || "").trim();
    const pathnameDb = decodeURIComponent(String(url.pathname || "").replace(/^\/+/, "")).trim();
    if (!pathnameDb && configuredDb) url.pathname = `/${encodeURIComponent(configuredDb)}`;
    process.env.TIDB_DATABASE_URL = url.toString();
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

async function normalizeTempChildRows(defects, deductions, processId) {
  const normalizedDefects = Array.isArray(defects) ? defects.map((item) => ({ ...item })) : [];
  const normalizedDeductions = Array.isArray(deductions) ? deductions.map((item) => ({ ...item })) : [];
  const pid = Number(processId);

  const defectIds = [...new Set(normalizedDefects.map((item) => Number(item?.defect_type_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const defectNames = [...new Set(normalizedDefects.map((item) => String(item?.defect_name || "").trim()).filter(Boolean))];
  const deductionIds = [...new Set(normalizedDeductions.map((item) => Number(item?.deduction_type_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const deductionNames = [...new Set(normalizedDeductions.map((item) => String(item?.deduction_name || "").trim()).filter(Boolean))];

  const [defectRows, deductionRows] = await Promise.all([
    queryMasterRows(`SELECT id, defect_code, defect_name FROM defect_types WHERE process_id=? AND status='active' AND (${defectIds.length ? `id IN (${defectIds.map(() => "?").join(",")})` : "1=0"}${defectNames.length ? ` OR defect_name IN (${defectNames.map(() => "?").join(",")})` : ""})`, [pid, ...defectIds, ...defectNames]),
    queryMasterRows(`SELECT id, deduction_name FROM deduction_types WHERE process_id=? AND status='active' AND (${deductionIds.length ? `id IN (${deductionIds.map(() => "?").join(",")})` : "1=0"}${deductionNames.length ? ` OR deduction_name IN (${deductionNames.map(() => "?").join(",")})` : ""})`, [pid, ...deductionIds, ...deductionNames])
  ]);

  const defectById = new Map((defectRows || []).map((row) => [Number(row.id), row]));
  const defectByName = new Map((defectRows || []).map((row) => [String(row.defect_name).trim(), row]));
  const deductionById = new Map((deductionRows || []).map((row) => [Number(row.id), row]));
  const deductionByName = new Map((deductionRows || []).map((row) => [String(row.deduction_name).trim(), row]));
  const unresolvedDefects = [];
  const unresolvedDeductions = [];

  for (const item of normalizedDefects) {
    const quantity = Number(item?.quantity || 0);
    if (!(quantity > 0)) continue;
    const row = defectById.get(Number(item?.defect_type_id)) || defectByName.get(String(item?.defect_name || "").trim());
    if (!row) { unresolvedDefects.push(item); continue; }
    item.defect_type_id = Number(row.id);
    item.defect_name = String(row.defect_name || "").trim();
    item.defect_code = String(row.defect_code || item.defect_code || "").trim();
  }
  for (const item of normalizedDeductions) {
    const hours = Number(item?.hours || 0);
    if (!(hours > 0)) continue;
    const row = deductionById.get(Number(item?.deduction_type_id)) || deductionByName.get(String(item?.deduction_name || "").trim());
    if (!row) { unresolvedDeductions.push(item); continue; }
    item.deduction_type_id = Number(row.id);
    item.deduction_name = String(row.deduction_name || "").trim();
  }
  if (unresolvedDefects.length) {
    const error = new Error("Có loại lỗi NG không khớp danh mục công đoạn"); error.status = 422; error.code = "TEMP_DEFECT_MASTER_DATA_MISMATCH"; error.isPublic = true; error.details = unresolvedDefects.map((item) => ({ defect_type_id: item.defect_type_id || null, defect_name: item.defect_name || null, quantity: item.quantity })); throw error;
  }
  if (unresolvedDeductions.length) {
    const error = new Error("Có loại thời gian trừ không khớp danh mục công đoạn"); error.status = 422; error.code = "TEMP_DEDUCTION_MASTER_DATA_MISMATCH"; error.isPublic = true; error.details = unresolvedDeductions.map((item) => ({ deduction_type_id: item.deduction_type_id || null, deduction_name: item.deduction_name || null, hours: item.hours })); throw error;
  }
  return { defects: normalizedDefects, deductions: normalizedDeductions };
}

async function queryMasterRows(sql, params) { const [rows] = await db.promise().query(sql, params); return rows || []; }

const originalCreateCompleteReport = productionTempCreateModel.createCompleteReport.bind(productionTempCreateModel);
productionTempCreateModel.createCompleteReport = async (payload) => {
  if (payload && typeof payload === "object" && payload.data) {
    const normalized = await normalizeTempChildRows(payload.defects, payload.deductions, payload.data.process_id);
    return originalCreateCompleteReport({ ...payload, ...normalized });
  }
  return originalCreateCompleteReport(payload);
};

let cloudflareSeedReady = false;
let cloudflareSeedPromise = null;
async function ensureCloudflareSeeded() {
  if (cloudflareSeedReady) return true;
  if (cloudflareSeedPromise) return cloudflareSeedPromise;
  cloudflareSeedPromise = Promise.all([ensureGcDefectMasterData(), ensureGcLong2801Lt()]).then(() => { masterDataCache.clear(); cloudflareSeedReady = true; console.log("[KTC] Cloudflare GC master-data seed completed; master cache cleared"); return true; }).catch((error) => { console.error("[KTC] Cloudflare GC master-data seed failed", error); cloudflareSeedPromise = null; return false; });
  return cloudflareSeedPromise;
}

const originalListen = app.listen.bind(app);
app.listen = (port, hostOrCallback, maybeCallback) => { if (typeof hostOrCallback === "string") return originalListen(port, maybeCallback); return originalListen(port, hostOrCallback); };
const server = await start();
const httpHandler = httpServerHandler(server);

function getAllowedOrigin(request) {
  const origin = request.headers.get("Origin"); if (!origin) return null;
  const allowed = new Set([cloudflareFrontendOrigin, cloudflareTestFrontendOrigin, "https://worker-management-system-3-dzox.onrender.com", "http://localhost:5173", "https://localhost", "capacitor://localhost", ...configuredCorsOrigins]);
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
const CANONICAL_EVENT_DEFECTS = new Map([["KQD", "KQD"], ["VO_CAO_SU", "Vỡ cao su"], ["K_XUOC_CONG_GAY", "K xước cong gãy"], ["CAO_SU_XOAY", "Cao su xoay"], ["CAT_KHONG_DUT", "Cắt không đứt"], ["BAVIA", "Bavia"], ["CSH", "CSH"], ["PPCM", "PPCM"], ["KT_LON", "KT lớn"], ["KT_NHO", "KT nhỏ"], ["LCS", "LCS"], ["CAT_LEM", "Cắt lẹm"], ["RACH_NVL", "Rách NVL"], ["CHAN_NGAN_DAI", "Chân ngắn dài"], ["SOT_VIA", "Sót via"], ["FURE_TRUC", "Fure trục"], ["LAN_CS", "Lẫn CS"], ["BAVIA_CAT_HUT", "Bavia cắt hụt"], ["THIEU_CAO_SU", "Thiếu cao su"]]);
const EVENT_DEFECT_ALIASES = new Map([["KQD_DAP_LAI", "KQD"], ["KQD_TUOT", "KQD"], ["KQD_DL", "KQD"], ["VO_DO_LONG", "VO_CAO_SU"], ["VO_LONG", "VO_CAO_SU"], ["XUOC_DO_LONG", "K_XUOC_CONG_GAY"], ["XUOC_LONG", "K_XUOC_CONG_GAY"], ["CONG_GAY", "K_XUOC_CONG_GAY"], ["XOAY", "CAO_SU_XOAY"], ["KHONG_DUT", "CAT_KHONG_DUT"], ["BAVIA_HUT", "BAVIA"], ["CAO_SU", "LCS"], ["LOI_CAO_SU", "LCS"], ["CAT_LEM", "CAT_LEM"]]);
function normalizeEventDefect(row) { const raw = String(row.defect_code || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase(); const code = EVENT_DEFECT_ALIASES.get(raw) || raw; const name = CANONICAL_EVENT_DEFECTS.get(code); if (!name) return null; const quantity = Math.trunc(Number(row.quantity || 0)); if (quantity <= 0) return null; return { id: Number(row.id) || undefined, defect_type_id: Number(row.defect_type_id) || undefined, defect_code: code, defect_name: name, quantity }; }
async function enrichApprovedReportMachineDefects(request, response) {
  const url = new URL(request.url); if (request.method !== "GET" || !/^\/api\/production\/\d+$/.test(url.pathname) || !response.ok) return response;
  try { const payload = await response.clone().json(); const data = payload?.data; if (!data || !Array.isArray(data.defects) || data.defects.length > 0) return response; const reportId = Number(url.pathname.split("/").pop()); const [rows] = await db.promise().query(`SELECT med.id,med.defect_type_id,med.defect_code,med.defect_name,med.quantity FROM production_report_machine_lines ml JOIN machine_production_event_defects med ON med.machine_event_id=ml.machine_event_id WHERE ml.report_id=? AND med.quantity>0 ORDER BY ml.sort_order,med.id`, [reportId]); const merged = new Map(); for (const row of rows || []) { const item = normalizeEventDefect(row); if (!item) continue; const key = item.defect_code; const existing = merged.get(key); if (existing) existing.quantity += item.quantity; else merged.set(key, item); } if (!merged.size) return response; data.defects = [...merged.values()]; const headers = new Headers(response.headers); headers.set("Cache-Control", "no-store"); return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers }); } catch (error) { console.error("[KTC] approved report machine NG enrichment failed", error); return response; }
}
const wrappedServer = { async fetch(request, envArg, ctx) { const preflight = handleCorsPreflight(request); if (preflight) return preflight; if (shouldBootstrapBeforeRequest(request)) { const seeded = await ensureCloudflareSeeded(); if (!seeded) console.warn("[KTC] Continuing request without master-data bootstrap; seed will retry on a later request."); } const response = await httpHandler.fetch(request, envArg, ctx); return enrichApprovedReportMachineDefects(request, response); } };
export default wrappedServer;

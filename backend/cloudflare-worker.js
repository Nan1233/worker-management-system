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

// The canonical validation layer may resolve a defect/deduction for business
// calculations while the legacy persistence layer still receives only the
// original UI shape. Normalize those rows again immediately before persistence
// so the child tables always receive canonical master-data IDs. Previously,
// an unresolved positive row was silently dropped by createDefects/createDeductions.
async function normalizeTempChildRows(defects, deductions, processId) {
  const normalizedDefects = Array.isArray(defects) ? defects.map((item) => ({ ...item })) : [];
  const normalizedDeductions = Array.isArray(deductions) ? deductions.map((item) => ({ ...item })) : [];
  const pid = Number(processId);

  const defectIds = [...new Set(normalizedDefects.map((item) => Number(item?.defect_type_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const defectNames = [...new Set(normalizedDefects.map((item) => String(item?.defect_name || "").trim()).filter(Boolean))];
  const deductionIds = [...new Set(normalizedDeductions.map((item) => Number(item?.deduction_type_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const deductionNames = [...new Set(normalizedDeductions.map((item) => String(item?.deduction_name || "").trim()).filter(Boolean))];

  const [defectRows, deductionRows] = await Promise.all([
    queryMasterRows(
      `SELECT id, defect_code, defect_name
         FROM defect_types
        WHERE process_id=? AND status='active'
          AND (${defectIds.length ? `id IN (${defectIds.map(() => "?").join(",")})` : "1=0"}
               ${defectNames.length ? ` OR defect_name IN (${defectNames.map(() => "?").join(",")})` : ""})`,
      [pid, ...defectIds, ...defectNames]
    ),
    queryMasterRows(
      `SELECT id, deduction_name
         FROM deduction_types
        WHERE process_id=? AND status='active'
          AND (${deductionIds.length ? `id IN (${deductionIds.map(() => "?").join(",")})` : "1=0"}
               ${deductionNames.length ? ` OR deduction_name IN (${deductionNames.map(() => "?").join(",")})` : ""})`,
      [pid, ...deductionIds, ...deductionNames]
    )
  ]);

  const defectById = new Map((defectRows || []).map((row) => [Number(row.id), row]));
  const defectByName = new Map((defectRows || []).map((row) => [String(row.defect_name).trim(), row]));
  const deductionById = new Map((deductionRows || []).map((row) => [Number(row.id), row]));
  const deductionByName = new Map((deductionRows || []).map((row) => [String(row.deduction_name).trim(), row]));

  const unresolvedDefects = [];
  for (const item of normalizedDefects) {
    const quantity = Number(item?.quantity || 0);
    if (!(quantity > 0)) continue;
    const row = defectById.get(Number(item?.defect_type_id)) || defectByName.get(String(item?.defect_name || "").trim());
    if (!row) {
      unresolvedDefects.push(item);
      continue;
    }
    item.defect_type_id = Number(row.id);
    item.defect_name = String(row.defect_name || "").trim();
    item.defect_code = String(row.defect_code || item.defect_code || "").trim();
  }

  const unresolvedDeductions = [];
  for (const item of normalizedDeductions) {
    const hours = Number(item?.hours || 0);
    if (!(hours > 0)) continue;
    const row = deductionById.get(Number(item?.deduction_type_id)) || deductionByName.get(String(item?.deduction_name || "").trim());
    if (!row) {
      unresolvedDeductions.push(item);
      continue;
    }
    item.deduction_type_id = Number(row.id);
    item.deduction_name = String(row.deduction_name || "").trim();
  }

  if (unresolvedDefects.length || unresolvedDeductions.length) {
    throw Object.assign(new Error("UNRESOLVED_MASTER_DATA"), {
      code: "UNRESOLVED_MASTER_DATA",
      unresolvedDefects,
      unresolvedDeductions
    });
  }
  return { defects: normalizedDefects, deductions: normalizedDeductions };
}

async function queryMasterRows(sql, params) {
  const result = await db.promise().query(sql, params);
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
}

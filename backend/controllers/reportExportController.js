const crypto = require("crypto");
const runtimeMetrics = require("../services/runtimeMetrics");
const {
  logProductionIndexAudit
} = require("../services/productionIndexAuditService");
const {
  startProductionIndexAuditScheduler
} = require("../services/indexAuditScheduler");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const db = require("../config/db");

const machineModel = require("../models/machineModel");
const productStandardModel = require("../models/productStandardModel");
const Defect = require("../models/defectModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");

const authRoutes = require("../routes/authRoutes");
const userRoutes = require("../routes/userRoutes");
const workerRoutes = require("../routes/workerRoutes");
const productionRoutes = require("../routes/productionRoutes");
const productionTempRoutes = require("../routes/productionTempRoutes");
const managerRoutes = require("../routes/managerRoutes");
const reportExportRoutes = require("../routes/reportExportRoutes");
const defectRoutes = require("../routes/defectRoutes");
const deductionRoutes = require("../routes/deductionRoutes");
const machineRoutes = require("../routes/machineRoutes");
const productStandardRoutes = require("../routes/productStandardRoutes");
const syncJobRoutes = require("../routes/syncJobRoutes");
const systemRoutes = require("../routes/systemRoutes");
const permissionRoutes = require("../routes/permissionRoutes");
const adminMasterRoutes = require("../routes/adminMasterRoutes");
const formulaSettingsRoutes = require("../routes/formulaSettingsRoutes");
const dashboardRoutes = require("../routes/dashboardRoutes");
const machineProductionEventRoutes = require("../routes/machineProductionEventRoutes");
const networkAccessRoutes = require("../routes/networkAccessRoutes");
const mobileRoutes = require("../routes/mobileRoutes");
const governanceRoutes = require("../routes/governanceRoutes");
const excelMasterSyncRoutes = require("../routes/excelMasterSyncRoutes");
const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const reportExportController = require("../controllers/reportExportController");
const excelExportJobQueue = require("../services/excelExportJobQueue");
const { validateEnvironment } = require("../config/validateEnvironment");
const { assertDatabaseSchemaReady, toSafeSchemaDiagnostics } = require("../services/databaseSchemaService");
const { globalApiLimiter } = require("../middleware/rateLimiters");
const { resolveTrustProxySetting } = require("../services/proxyTrustPolicy");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function parseCorsOrigins() {
  const configured = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([
    "http://localhost:5173",
    "https://localhost", // Capacitor Android native WebView
    "capacitor://localhost", // Reserved for Capacitor native clients
    "https://worker-management-system-3-dzox.onrender.com",
    ...configured,
  ]);
}

const allowedOrigins = parseCorsOrigins();

// Trust proxy chỉ bật khi deployment được nhận diện/cấu hình rõ ràng.
// Mặc định local/unknown deployment không tin X-Forwarded-For do client tự gửi.
app.set("trust proxy", resolveTrustProxySetting(process.env));
app.disable("x-powered-by");
app.set("etag", "weak");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProduction ? undefined : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
  }),
);

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error("Nguồn truy cập không được phép bởi CORS");
      error.status = 403;
      error.code = "CORS_ORIGIN_DENIED";
      error.isPublic = true;
      return callback(error);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Cron-Secret",
      "X-Request-Id",
      "X-Frontend-Version",
    ],
    credentials: true,
    maxAge: 86_400,
  }),
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "768kb", strict: true }));
app.use(express.urlencoded({
  extended: false,
  limit: process.env.URLENCODED_BODY_LIMIT || "128kb",
  parameterLimit: Number(process.env.URLENCODED_PARAMETER_LIMIT || 1000),
}));

app.use((req, res, next) => {
  const maxQueryLength = Number(process.env.MAX_QUERY_STRING_LENGTH || 4096);
  if (req.originalUrl.split('?')[1]?.length > maxQueryLength) {
    return res.status(414).json({ success: false, code: 'QUERY_STRING_TOO_LONG', message: 'Query quá dài' });
  }
  next();
});

app.use((req, res, next) => {
  const rawRequestId = String(req.get("X-Request-Id") || "").trim();
  const requestId = /^[A-Za-z0-9._:-]{1,120}$/.test(rawRequestId)
    ? rawRequestId
    : crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const originalEnd = res.end;
  res.end = function patchedEnd(...args) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (!res.headersSent) {
      res.setHeader("Server-Timing", `app;dur=${durationMs.toFixed(1)}`);
    }
    return originalEnd.apply(this, args);
  };

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const requestPath = String(req.originalUrl || req.path || "").split("?")[0];
    runtimeMetrics.recordHttp({
      requestId,
      method: req.method,
      path: requestPath,
      status: res.statusCode,
      durationMs
    });
    if (!isProduction || res.statusCode >= 400 || durationMs >= 1_000) {
      console.log(
        JSON.stringify({
          type: "http",
          requestId,
          method: req.method,
          path: requestPath,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        }),
      );
    }
  });
  next();
});

app.use("/api", globalApiLimiter);

const normalizeDateKey = (value) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const compareReportsForExcel = (first, second) => {
    const dateCompare = normalizeDateKey(first.work_date).localeCompare(normalizeDateKey(second.work_date));
    if (dateCompare !== 0) return dateCompare;
    const workerCompare = String(first.worker_code || "").localeCompare(
        String(second.worker_code || ""),
        undefined,
        { numeric: true, sensitivity: "base" }
    );
    if (workerCompare !== 0) return workerCompare;
    return Number(first.id) - Number(second.id);
};

const writeDateSeparatorRow = (sheet, rowNumber, value) => {
    copyRowStyle(sheet, STYLE_SOURCE_ROW, rowNumber);
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= 52; column += 1) row.getCell(column).value = null;
    const dateCell = row.getCell("A");
    dateCell.value = formatWorkDate(value);
    dateCell.numFmt = "@";
    dateCell.font = { ...(dateCell.font || {}), bold: true };
};

// Cloudflare Workers do not expose CommonJS __dirname. Keep the relative
// template reference here and resolve it only inside Node/Render execution.
const EXCEL_TEMPLATE_RELATIVE_PATH = "../templates/bao-cao-cat-long-export.xlsx";

function getExcelTemplatePath() {
    if (typeof __dirname === "string") {
        return path.join(__dirname, EXCEL_TEMPLATE_RELATIVE_PATH);
    }
    return null;
}

const EXCEL_SHEET_NAME = "Cắt lồng";
const HEADER_ROW_NUMBER = 326;
const DATA_START_ROW = HEADER_ROW_NUMBER + 1;
const STYLE_SOURCE_ROW = DATA_START_ROW;


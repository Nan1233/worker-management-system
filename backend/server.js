const crypto = require("crypto");
const runtimeMetrics = require("./services/runtimeMetrics");
const {
  logProductionIndexAudit
} = require("./services/productionIndexAuditService");
const {
  startProductionIndexAuditScheduler
} = require("./services/indexAuditScheduler");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const db = require("./config/db");

const machineModel = require("./models/machineModel");
const productStandardModel = require("./models/productStandardModel");
const Defect = require("./models/defectModel");
const { TTL, getOrLoadMasterData } = require("./utils/masterDataCache");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const workerRoutes = require("./routes/workerRoutes");
const productionRoutes = require("./routes/productionRoutes");
const productionTempRoutes = require("./routes/productionTempRoutes");
const managerRoutes = require("./routes/managerRoutes");
const reportExportRoutes = require("./routes/reportExportRoutes");
const defectRoutes = require("./routes/defectRoutes");
const deductionRoutes = require("./routes/deductionRoutes");
const machineRoutes = require("./routes/machineRoutes");
const productStandardRoutes = require("./routes/productStandardRoutes");
const syncJobRoutes = require("./routes/syncJobRoutes");
const systemRoutes = require("./routes/systemRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const adminMasterRoutes = require("./routes/adminMasterRoutes");
const formulaSettingsRoutes = require("./routes/formulaSettingsRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const machineProductionEventRoutes = require("./routes/machineProductionEventRoutes");
const networkAccessRoutes = require("./routes/networkAccessRoutes");
const mobileRoutes = require("./routes/mobileRoutes");
const governanceRoutes = require("./routes/governanceRoutes");
const excelMasterSyncRoutes = require("./routes/excelMasterSyncRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const checkRole = require("./middleware/roleMiddleware");
const reportExportController = require("./controllers/reportExportController");
const excelExportJobQueue = require("./services/excelExportJobQueue");
const { validateEnvironment } = require("./config/validateEnvironment");
const { assertDatabaseSchemaReady, toSafeSchemaDiagnostics } = require("./services/databaseSchemaService");
const { globalApiLimiter } = require("./middleware/rateLimiters");
const { resolveTrustProxySetting } = require("./services/proxyTrustPolicy");

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

// Explicitly deny browser capabilities the API never needs. This is defense-in-depth
// for pages embedding the API response or accidentally serving an HTML error page.
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Native Electron, curl and server-to-server calls may not send Origin.
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

// Reject pathological query strings before they reach controllers/DB builders.
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
app.use("/api", (req, res, next) => {
  // Authenticated production data must not be cached by shared proxies.
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// Ghi lại mọi thao tác tạo/sửa/xóa sau khi request hoàn tất thành công.
// Middleware đặt trước routes để có thể quan sát req.user do auth middleware gắn ở downstream.
app.use("/api", require("./middleware/activityAuditMiddleware"));

app.get("/api/health/live", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    success: true,
    service: "ktc-api",
    status: "live",
    uptimeSeconds: Math.round(process.uptime()),
    version: process.env.KTC_BACKEND_VERSION || process.env.npm_package_version || "unknown",
  });
});

const runtimeReadiness = {
  ready: false,
  initializing: false,
  startedAt: null,
  readyAt: null,
  database: "starting",
  databaseLatencyMs: null,
  schemaReady: false,
  schemaStatus: "STARTING",
  schemaContractVersion: 26,
  errorCode: null,
  errorMessage: null,
};

function readinessHandler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  const version = require("./config/version");

  if (!runtimeReadiness.ready) {
    return res.status(503).json({
      success: false,
      service: "ktc-api",
      status: "not_ready",
      database: runtimeReadiness.database,
      databaseLatencyMs: runtimeReadiness.databaseLatencyMs,
      schemaReady: runtimeReadiness.schemaReady,
      schemaStatus: runtimeReadiness.schemaStatus,
      schemaContractVersion: runtimeReadiness.schemaContractVersion,
      errorCode: runtimeReadiness.errorCode,
      appVersion: version.backendVersion,
    });
  }

  return res.json({
    success: true,
    service: "ktc-api",
    status: "ready",
    database: runtimeReadiness.database,
    databaseLatencyMs: runtimeReadiness.databaseLatencyMs,
    schemaReady: true,
    schemaStatus: runtimeReadiness.schemaStatus,
    schemaContractVersion: runtimeReadiness.schemaContractVersion,
    startupMs: runtimeReadiness.readyAt && runtimeReadiness.startedAt
      ? runtimeReadiness.readyAt - runtimeReadiness.startedAt
      : null,
    appVersion: version.backendVersion,
  });
}

app.get("/api/health/ready", readinessHandler);

// Backward-compatible deployment health endpoint: same cached readiness semantics.
app.get("/api/health", readinessHandler);

// F16 disaster-restore maintenance gate: health stays readable, all API writes are quiesced.
app.use("/api", (req, res, next) => {
  if (String(process.env.KTC_MAINTENANCE_MODE || "").toUpperCase() !== "RESTORE") return next();
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase())) return next();
  return res.status(503).json({ success: false, code: "MAINTENANCE_RESTORE", message: "Hệ thống đang ở chế độ khôi phục dữ liệu" });
});

app.use("/api/mobile", mobileRoutes);
app.use("/api/network", networkAccessRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/machine-production-events", machineProductionEventRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/product-standards", productStandardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/production-temp", productionTempRoutes);
app.use("/api/manager", managerRoutes);

app.use("/api/reports", reportExportRoutes);
console.log("[KTC] Company Excel API v3 mounted at /api/reports/export-excel/company-*");
app.use("/api/sync-jobs", syncJobRoutes);
app.use("/api/version", require("./routes/versionRoutes"));
app.use("/api/system", systemRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/admin/master", adminMasterRoutes);
app.use("/api/formula-settings", formulaSettingsRoutes);
app.use("/api/governance", governanceRoutes);
app.use("/api/excel-master-sync", excelMasterSyncRoutes);
app.use("/api", defectRoutes);
app.use("/api", deductionRoutes);

app.get("/", (req, res) => {
  res.json({ success: true, message: "Backend is running" });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "API không tồn tại" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(
    JSON.stringify({
      type: "api_error",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      code: error.code,
      message: error.message,
      stack: isProduction ? undefined : error.stack,
    }),
  );

  let status = Number(error?.status || error?.statusCode || 500);
  let code = error?.code || "INTERNAL_SERVER_ERROR";
  let message;

  if (error?.type === "entity.too.large" || status === 413) {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Dữ liệu gửi lên vượt quá giới hạn cho phép";
  } else if (error?.type === "entity.parse.failed" || (error instanceof SyntaxError && status === 400)) {
    status = 400;
    code = "INVALID_JSON";
    message = "Dữ liệu JSON không hợp lệ";
  } else {
    message = error?.isPublic
      ? error.message
      : isProduction
        ? "Lỗi máy chủ"
        : error.message || "Lỗi máy chủ";
  }

  return res.status(status).json({
    success: false,
    code,
    message,
    request_id: req.requestId
  });
});

let databaseKeepAliveTimer = null;

async function warmFrequentlyUsedMasterData() {
  try {
    const [processRows] = await db.promise().query(
      "SELECT id FROM processes WHERE status = 'active' ORDER BY id LIMIT 20"
    );

    // Nạp tuần tự để chỉ tái sử dụng một vài kết nối TiDB thay vì mở nhiều
    // TLS session đồng thời ngay sau khi Render khởi động.
    for (const row of processRows) {
      const processId = Number(row.id);
      await getOrLoadMasterData(`machines:${processId}`, TTL.machines, () => machineModel.findByProcess(processId));
      await getOrLoadMasterData(`product-standards:${processId}`, TTL.productStandards, () => productStandardModel.findByProcess(processId));
      await getOrLoadMasterData(`defects:${processId}`, TTL.defects, () => Defect.getByProcess(processId));
    }
    console.log(`Master data warmed for ${processRows.length} processes`);
  } catch (error) {
    console.warn(`Master data warmup skipped: ${error.message}`);
  }
}

function startDatabaseKeepAlive() {
  const intervalMs = Math.max(60_000, Number(process.env.DB_KEEPALIVE_INTERVAL_MS || 240_000));
  databaseKeepAliveTimer = setInterval(() => {
    void db.promise().query({ sql: "SELECT 1 AS ok", timeout: 5_000 }).catch((error) => {
      console.warn(`Database keepalive failed: ${error.message}`);
    });
  }, intervalMs);
  databaseKeepAliveTimer.unref?.();
}

let server;
let startupFailureTimer = null;

async function initializeRuntime() {
  runtimeReadiness.initializing = true;
  runtimeReadiness.startedAt = Date.now();
  runtimeReadiness.errorCode = null;
  runtimeReadiness.errorMessage = null;

  try {
    const databaseStartedAt = Date.now();
    const database = await db.testConnection();
    runtimeReadiness.databaseLatencyMs = Date.now() - databaseStartedAt;
    runtimeReadiness.database = "ok";
    console.log(`Database connected: ${database.host}:${database.port}; SSL=${database.ssl}`);

    const schema = await assertDatabaseSchemaReady();
    const diagnostics = toSafeSchemaDiagnostics(schema);
    runtimeReadiness.schemaReady = true;
    runtimeReadiness.schemaStatus = diagnostics.status;
    runtimeReadiness.schemaContractVersion = diagnostics.contractVersion;
    console.log(`Database schema READY: ${schema.expectedLatest?.filename || "none"}`);

    await excelExportJobQueue.initialize();

    runtimeReadiness.ready = true;
    runtimeReadiness.readyAt = Date.now();
    runtimeReadiness.initializing = false;

    if (startupFailureTimer) {
      clearTimeout(startupFailureTimer);
      startupFailureTimer = null;
    }

    console.log(`[KTC] runtime READY in ${runtimeReadiness.readyAt - runtimeReadiness.startedAt}ms`);

    startDatabaseKeepAlive();
    void warmFrequentlyUsedMasterData();
    void logProductionIndexAudit(db);
    startProductionIndexAuditScheduler(db);
  } catch (error) {
    const safeDetails = error?.details || {};
    runtimeReadiness.ready = false;
    runtimeReadiness.initializing = false;
    runtimeReadiness.database =
      error?.schemaStatus === "DATABASE_UNAVAILABLE" ? "unavailable" : runtimeReadiness.database;
    runtimeReadiness.schemaStatus = error?.schemaStatus || "STARTUP_FAILED";
    runtimeReadiness.schemaContractVersion = safeDetails.contractVersion || 26;
    runtimeReadiness.errorCode = error?.code || "DATABASE_STARTUP_FAILED";
    runtimeReadiness.errorMessage = error?.message || "Runtime initialization failed";

    console.error(JSON.stringify({
      type: "startup_not_ready",
      code: runtimeReadiness.errorCode,
      schemaStatus: runtimeReadiness.schemaStatus,
      schemaContractVersion: runtimeReadiness.schemaContractVersion,
      message: runtimeReadiness.errorMessage,
    }));

    // Fail the instance instead of leaving Render waiting forever.
    if (!startupFailureTimer) {
      const exitDelayMs = Math.max(
        5_000,
        Number(process.env.STARTUP_FAILURE_EXIT_MS || 20_000)
      );
      startupFailureTimer = setTimeout(() => {
        console.error(`[KTC] runtime still not ready after startup failure; exiting in ${exitDelayMs}ms policy`);
        process.exit(1);
      }, exitDelayMs);
      startupFailureTimer.unref?.();
    }
  }
}

async function start() {
  try {
    // Environment validation is synchronous and must pass before exposing the port.
    validateEnvironment(process.env, { production: isProduction });
  } catch (error) {
    console.error(JSON.stringify({
      type: "startup_environment_invalid",
      code: error?.code || "ENVIRONMENT_INVALID",
      message: error?.message,
    }));
    process.exitCode = 1;
    return null;
  }

  server = app.listen(PORT, "0.0.0.0", () => {
    const version = require("./config/version");
    console.log(`Server running at port ${PORT}`);
    console.log(`[KTC] backendVersion=${version.backendVersion} commitSha=${version.commitSha} apiVersion=${version.apiVersion} schemaVersion=${version.schemaVersion}`);
    void initializeRuntime();
  });

  // Bound slow-client/resource exhaustion without imposing an application timeout
  // on long-running Excel jobs, which are handled asynchronously.
  server.requestTimeout = Math.max(30_000, Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 120_000));
  server.headersTimeout = Math.max(15_000, Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 30_000));
  server.keepAliveTimeout = Math.max(5_000, Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || 10_000));

  return server;
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  if (databaseKeepAliveTimer) clearInterval(databaseKeepAliveTimer);
  if (server) {
    await Promise.race([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 10_000)),
    ]);
  }
  await db.closePool().catch((error) => console.error("Pool close failed:", error.message));
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

if (require.main === module) {
  start();
}

module.exports = { app, start };


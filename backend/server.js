const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const networkAccessRoutes = require("./routes/networkAccessRoutes");
const governanceRoutes = require("./routes/governanceRoutes");
const excelMasterSyncRoutes = require("./routes/excelMasterSyncRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const checkRole = require("./middleware/roleMiddleware");
const reportExportController = require("./controllers/reportExportController");
const excelExportJobQueue = require("./services/excelExportJobQueue");
const { validateEnvironment } = require("./config/validateEnvironment");

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
    "https://worker-management-system-3-dzox.onrender.com",
    ...configured,
  ]);
}

const allowedOrigins = parseCorsOrigins();

// Render dùng reverse proxy phía trước ứng dụng. Chỉ tin đúng một lớp proxy
// để express-rate-limit không cho phép giả mạo X-Forwarded-For.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.set("etag", "weak");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProduction ? undefined : false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      // Native Electron, curl and server-to-server calls may not send Origin.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Nguồn truy cập không được phép bởi CORS"));
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

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "768kb" }));

app.use((req, res, next) => {
  const requestId = String(req.get("X-Request-Id") || crypto.randomUUID());
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
    if (!isProduction || res.statusCode >= 400 || durationMs >= 1_000) {
      console.log(
        JSON.stringify({
          type: "http",
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        }),
      );
    }
  });
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: { success: false, message: "Quá nhiều yêu cầu, vui lòng thử lại sau" },
});

app.use("/api", apiLimiter);
app.use("/api", (req, res, next) => {
  // Authenticated production data must not be cached by shared proxies.
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// Ghi lại mọi thao tác tạo/sửa/xóa sau khi request hoàn tất thành công.
// Middleware đặt trước routes để có thể quan sát req.user do auth middleware gắn ở downstream.
app.use("/api", require("./middleware/activityAuditMiddleware"));

app.get("/api/health", async (req, res) => {
  try {
    await db.promise().query({ sql: "SELECT 1 AS ok", timeout: 3_000 });
    return res.json({
      success: true,
      service: "ktc-api",
      database: "ok",
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      service: "ktc-api",
      database: "unavailable",
    });
  }
});

app.use("/api/network", networkAccessRoutes);
app.use("/api/dashboard", dashboardRoutes);
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

  const message = error?.isPublic
    ? error.message
    : isProduction
      ? "Lỗi máy chủ"
      : error.message || "Lỗi máy chủ";

  return res.status(error.status || 500).json({ success: false, message, request_id: req.requestId });
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

async function start() {
  try {
    validateEnvironment(process.env, { production: isProduction });
    const database = await db.testConnection();
    console.log(`Database connected: ${database.host}:${database.port}; SSL=${database.ssl}`);
    await excelExportJobQueue.initialize();
  } catch (error) {
    console.error(`Database startup check failed: ${error.message}`);
    // Render should restart a service that cannot reach its primary database.
    if (isProduction) process.exit(1);
  }

  server = app.listen(PORT, () => {
    const version = require("./config/version");
    console.log(`Server running at port ${PORT}`);
    console.log(`[KTC] backendVersion=${version.backendVersion} commitSha=${version.commitSha} apiVersion=${version.apiVersion} schemaVersion=${version.schemaVersion}`);
    startDatabaseKeepAlive();
    void warmFrequentlyUsedMasterData();
  });
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  if (databaseKeepAliveTimer) clearInterval(databaseKeepAliveTimer);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
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


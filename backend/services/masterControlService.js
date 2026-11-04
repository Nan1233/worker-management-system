'use strict';

// Read models for the KTC Master Control Center (/api/admin/control). Read-only except where a caller
// explicitly reuses an existing write path. Every query is parameterized and bounded; on Cloudflare
// Workers each statement is a TiDB subrequest, so related counts are folded into single statements.

const db = require('../config/db');
const runtimeMetrics = require('./runtimeMetrics');
const version = require('../config/version');
const { getEffectivePermissions, getAdminMatrix } = require('./permissionService');

const ROLES = ['admin', 'admin_ops', 'manager', 'lead', 'worker'];
const STATUSES = ['active', 'inactive'];
const MAX_PAGE_SIZE = 100;

const rows = async (sql, params = [], executor = db) => {
  const [result] = await executor.promise().query(sql, params);
  return Array.isArray(result) ? result : [];
};

const toInt = (value) => Number(value || 0);

function pageParams(query = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(query.pageSize ?? query.page_size) || 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function publicError(status, code, message) {
  return Object.assign(new Error(message), { status, code, isPublic: true });
}

// ---------------------------------------------------------------- overview

async function getOverviewCounts(executor = db) {
  const started = Date.now();
  // One statement for every KPI tile (one Worker subrequest); its latency doubles as the DB health probe.
  const [row] = await rows(`SELECT
      (SELECT COUNT(*) FROM users) AS users_total,
      (SELECT COUNT(*) FROM users WHERE status='active') AS users_active,
      (SELECT COUNT(*) FROM users WHERE role='worker') AS workers,
      (SELECT COUNT(*) FROM users WHERE role='manager') AS managers,
      (SELECT COUNT(*) FROM users WHERE role='lead') AS leads,
      (SELECT COUNT(*) FROM users WHERE role='admin') AS admins,
      (SELECT COUNT(*) FROM users WHERE role='admin_ops') AS admin_ops,
      (SELECT COUNT(*) FROM processes) AS processes_total,
      (SELECT COUNT(*) FROM processes WHERE status='active') AS processes_active,
      (SELECT COUNT(*) FROM machines) AS machines_total,
      (SELECT COUNT(*) FROM machines WHERE status='active') AS machines_active,
      (SELECT COUNT(*) FROM production_reports WHERE status <> 'deleted') AS production_reports,
      (SELECT COUNT(*) FROM production_reports_temp WHERE status IN ('pending','need_fix')) AS pending_approvals`, [], executor);
  const latencyMs = Date.now() - started;
  return {
    latencyMs,
    users: { total: toInt(row?.users_total), active: toInt(row?.users_active), workers: toInt(row?.workers), managers: toInt(row?.managers), leads: toInt(row?.leads), admins: toInt(row?.admins), adminOps: toInt(row?.admin_ops) },
    processes: { total: toInt(row?.processes_total), active: toInt(row?.processes_active) },
    machines: { total: toInt(row?.machines_total), active: toInt(row?.machines_active) },
    productionReports: toInt(row?.production_reports),
    pendingApprovals: toInt(row?.pending_approvals),
  };
}

async function listRecentAdminActivity(limit = 10, executor = db) {
  const bounded = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 10)));
  return rows(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.description, a.created_at, u.id AS user_id, u.username, u.full_name, u.role
      FROM activity_logs a JOIN users u ON u.id = a.user_id
     WHERE u.role IN ('admin','admin_ops')
     ORDER BY a.id DESC LIMIT ${bounded}`, [], executor);
}

function readinessSnapshot(readiness) {
  if (!readiness) return { status: 'unknown', ready: null };
  return {
    status: readiness.ready ? 'ready' : 'not_ready',
    ready: Boolean(readiness.ready),
    schemaStatus: readiness.schemaStatus || null,
    schemaContractVersion: readiness.schemaContractVersion ?? null,
    database: readiness.database || null,
    errorCode: readiness.errorCode || null,
  };
}

const envFlag = (name) => String(process.env[name] || '').trim();

/** Alerts derived only from verifiable runtime facts; nothing is invented. */
function buildSystemAlerts({ readiness, databaseOk }) {
  const alerts = [];
  if (!databaseOk) alerts.push({ level: 'critical', code: 'DATABASE_UNREACHABLE', message: 'Không truy vấn được cơ sở dữ liệu từ Master Control.' });
  if (readiness && readiness.ready === false) alerts.push({ level: 'critical', code: 'READINESS_NOT_READY', message: `Readiness chưa sẵn sàng (${readiness.schemaStatus || 'UNKNOWN'}).` });
  if (envFlag('KTC_MAINTENANCE_MODE').toUpperCase() === 'RESTORE') alerts.push({ level: 'warning', code: 'MAINTENANCE_RESTORE', message: 'Hệ thống đang ở chế độ khôi phục: mọi thao tác ghi bị chặn.' });
  const environment = envFlag('KTC_ENVIRONMENT').toLowerCase();
  if (environment === 'production' && envFlag('KTC_EXPOSE_SCHEMA_DIAGNOSTICS').toLowerCase() === 'true') alerts.push({ level: 'warning', code: 'SCHEMA_DIAGNOSTICS_EXPOSED', message: 'KTC_EXPOSE_SCHEMA_DIAGNOSTICS đang bật trên production (endpoint readiness công khai).' });
  return alerts;
}

async function getOverview({ readiness } = {}) {
  let counts = null;
  let databaseError = null;
  try { counts = await getOverviewCounts(); } catch (error) { databaseError = error?.code || 'DATABASE_ERROR'; }
  let recentActivity = [];
  let activityError = null;
  if (counts) {
    try { recentActivity = await listRecentAdminActivity(10); } catch (error) { activityError = error?.code || 'ACTIVITY_QUERY_FAILED'; }
  }
  const readinessState = readinessSnapshot(readiness);
  return {
    generatedAt: new Date().toISOString(),
    counts,
    api: { status: 'responding', version: version.backendVersion, commit: version.commitSha, environment: envFlag('KTC_ENVIRONMENT') || envFlag('NODE_ENV') || null },
    database: counts ? { status: 'ok', latencyMs: counts.latencyMs } : { status: 'unavailable', errorCode: databaseError },
    readiness: readinessState,
    backgroundJobs: { status: 'not_available', reason: 'Worker không chạy tiến trình nền; sync worker riêng (backend/worker.js) không báo trạng thái về API.' },
    backup: { status: 'not_available', reason: 'Chưa có nguồn dữ liệu backup đọc được từ runtime (backup là script CLI ghi file cục bộ).' },
    recentActivity,
    recentActivityError: activityError,
    alerts: buildSystemAlerts({ readiness: readinessState.ready === null ? null : readinessState, databaseOk: Boolean(counts) }),
  };
}

// ---------------------------------------------------------------- users

function userFilters(query = {}) {
  const where = [];
  const params = [];
  const search = String(query.search || '').trim().slice(0, 100);
  if (search) {
    where.push('(u.username LIKE ? OR u.full_name LIKE ? OR w.worker_code LIKE ?)');
    const like = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    params.push(like, like, like);
  }
  const role = String(query.role || '').trim().toLowerCase();
  if (role) {
    if (!ROLES.includes(role)) throw publicError(400, 'CONTROL_ROLE_INVALID', 'Vai trò lọc không hợp lệ');
    where.push('u.role = ?'); params.push(role);
  }
  const status = String(query.status || '').trim().toLowerCase();
  if (status) {
    if (!STATUSES.includes(status)) throw publicError(400, 'CONTROL_STATUS_INVALID', 'Trạng thái lọc không hợp lệ');
    where.push('u.status = ?'); params.push(status);
  }
  const processId = Number(query.process_id ?? query.processId);
  if (query.process_id !== undefined && query.process_id !== '' && (!Number.isInteger(processId) || processId <= 0)) throw publicError(400, 'CONTROL_PROCESS_INVALID', 'Công đoạn lọc không hợp lệ');
  if (Number.isInteger(processId) && processId > 0) {
    where.push('(EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id = u.id AND mp.process_id = ?) OR EXISTS (SELECT 1 FROM worker_processes wp WHERE wp.worker_id = w.id AND wp.process_id = ?))');
    params.push(processId, processId);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listUsers(query = {}) {
  const { page, pageSize, offset } = pageParams(query);
  const filters = userFilters(query);
  // COUNT(*) OVER() returns the total in the same statement (one subrequest for the whole page).
  const items = await rows(`SELECT u.id, u.username, u.full_name, u.role, u.status, u.created_at, u.updated_at,
        w.id AS worker_id, w.worker_code, w.status AS worker_status,
        (SELECT GROUP_CONCAT(DISTINCT p.process_name ORDER BY p.process_name SEPARATOR ', ')
           FROM processes p
          WHERE p.id IN (SELECT mp.process_id FROM manager_processes mp WHERE mp.manager_id = u.id)
             OR p.id IN (SELECT wp.process_id FROM worker_processes wp WHERE wp.worker_id = w.id)) AS process_names,
        (SELECT MAX(COALESCE(s.last_used_at, s.created_at)) FROM user_sessions s WHERE s.user_id = u.id) AS last_activity_at,
        COUNT(*) OVER() AS total_count
      FROM users u LEFT JOIN workers w ON w.user_id = u.id
      ${filters.sql}
      ORDER BY FIELD(u.role,'admin','admin_ops','manager','lead','worker'), u.full_name, u.id
      LIMIT ${pageSize} OFFSET ${offset}`, filters.params);
  const total = items.length ? toInt(items[0].total_count) : 0;
  return {
    items: items.map(({ total_count: _ignored, ...item }) => item),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getUserDetail(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw publicError(400, 'CONTROL_USER_INVALID', 'ID người dùng không hợp lệ');
  const [user] = await rows(`SELECT u.id, u.username, u.full_name, u.role, u.status, u.created_at, u.updated_at,
        w.id AS worker_id, w.worker_code, w.phone, w.department, w.position, w.training_percent, w.status AS worker_status
      FROM users u LEFT JOIN workers w ON w.user_id = u.id WHERE u.id = ? LIMIT 1`, [id]);
  if (!user) throw publicError(404, 'CONTROL_USER_NOT_FOUND', 'Người dùng không tồn tại');
  const [processes, sessions, activity] = await Promise.all([
    rows(`SELECT p.id, p.process_code, p.process_name, p.status, 'manager_scope' AS source FROM manager_processes mp JOIN processes p ON p.id = mp.process_id WHERE mp.manager_id = ?
          UNION ALL
          SELECT p.id, p.process_code, p.process_name, p.status, 'worker_assignment' AS source FROM worker_processes wp JOIN processes p ON p.id = wp.process_id WHERE wp.worker_id = ?
          ORDER BY process_name`, [id, Number(user.worker_id) || 0]),
    rows(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN revoked_at IS NULL AND consumed_at IS NULL AND expires_at > NOW() THEN 1 ELSE 0 END) AS active,
            MAX(COALESCE(last_used_at, created_at)) AS last_activity_at
          FROM user_sessions WHERE user_id = ?`, [id]),
    rows(`SELECT id, user_id, action, entity_type, entity_id, description, created_at FROM activity_logs
          WHERE user_id = ? OR (entity_type IN ('user','user_permission') AND (entity_id = ? OR entity_id LIKE ?))
          ORDER BY id DESC LIMIT 20`, [id, String(id), `${id}:%`]),
  ]);
  const permissions = [...await getEffectivePermissions({ id, role: user.role })].sort();
  return {
    user,
    processes,
    sessions: { total: toInt(sessions?.[0]?.total), active: toInt(sessions?.[0]?.active), lastActivityAt: sessions?.[0]?.last_activity_at || null },
    permissions,
    activity,
  };
}

// ---------------------------------------------------------------- audit

const AUDIT_FILTERS = { action: 'a.action = ?', entity_type: 'a.entity_type = ?', user_id: 'a.user_id = ?' };

async function listAudit(query = {}) {
  const { page, pageSize, offset } = pageParams(query);
  const where = [];
  const params = [];
  for (const [key, clause] of Object.entries(AUDIT_FILTERS)) {
    const raw = String(query[key] ?? '').trim();
    if (!raw) continue;
    if (key === 'user_id' && !(Number.isInteger(Number(raw)) && Number(raw) > 0)) throw publicError(400, 'CONTROL_AUDIT_FILTER_INVALID', 'Bộ lọc người dùng không hợp lệ');
    where.push(clause); params.push(key === 'user_id' ? Number(raw) : raw.slice(0, 80));
  }
  for (const [key, op] of [['from', '>='], ['to', '<']]) {
    const raw = String(query[key] ?? '').trim();
    if (!raw) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw publicError(400, 'CONTROL_AUDIT_FILTER_INVALID', 'Ngày lọc phải có dạng YYYY-MM-DD');
    where.push(op === '<' ? 'a.created_at < DATE_ADD(?, INTERVAL 1 DAY)' : 'a.created_at >= ?'); params.push(raw);
  }
  const search = String(query.search || '').trim().slice(0, 100);
  if (search) { where.push('a.description LIKE ?'); params.push(`%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`); }
  const items = await rows(`SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.description, a.metadata_json, a.ip_address, a.created_at,
        u.username, u.full_name, u.role, COUNT(*) OVER() AS total_count
      FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.id DESC LIMIT ${pageSize} OFFSET ${offset}`, params);
  const total = items.length ? toInt(items[0].total_count) : 0;
  return {
    items: items.map(({ total_count: _ignored, metadata_json: metadata, ...item }) => ({ ...item, metadata: parseMetadata(metadata) })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

const SECRET_METADATA_KEYS = /pass(word)?|token|secret|authorization|cookie/i;
function parseMetadata(value) {
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return null; } }
  const scrub = (node, depth = 0) => {
    if (depth > 6 || node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => scrub(item, depth + 1));
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, SECRET_METADATA_KEYS.test(key) ? '[redacted]' : scrub(item, depth + 1)]));
  };
  return scrub(parsed);
}

// ---------------------------------------------------------------- health

async function getHealth({ readiness } = {}) {
  let database;
  const started = Date.now();
  try {
    await rows('SELECT 1 AS ok');
    database = { status: 'ok', latencyMs: Date.now() - started };
  } catch (error) {
    database = { status: 'unavailable', errorCode: error?.code || 'DATABASE_ERROR' };
  }
  const metrics = runtimeMetrics.snapshot();
  return {
    generatedAt: new Date().toISOString(),
    api: { status: 'responding', version: version.backendVersion, commit: version.commitSha, apiVersion: version.apiVersion },
    runtime: {
      node: process.version,
      platform: process.env.KTC_CLOUDFLARE_WORKER === 'true' ? 'cloudflare-workers' : 'node',
      environment: envFlag('KTC_ENVIRONMENT') || envFlag('NODE_ENV') || null,
      maintenanceMode: envFlag('KTC_MAINTENANCE_MODE') || null,
      // Metrics are per process / Worker isolate, not cluster-wide.
      metricsScope: process.env.KTC_CLOUDFLARE_WORKER === 'true' ? 'isolate' : 'process',
    },
    database,
    readiness: readinessSnapshot(readiness),
    schema: { contractVersion: version.schemaContractVersion },
    metrics: { startedAt: metrics.startedAt, uptimeSeconds: metrics.uptimeSeconds, http: { ...metrics.http, byRoute: undefined }, memory: metrics.memory, recentErrors: (metrics.recentErrors || []).slice(-20) },
  };
}

// ---------------------------------------------------------------- database explorer (read-only)

const TABLE_NAME = /^[A-Za-z0-9_]{1,64}$/;

async function listTables() {
  // information_schema only: metadata, never row data. TABLE_ROWS is the engine estimate.
  return rows(`SELECT TABLE_NAME AS name, TABLE_ROWS AS estimated_rows, DATA_LENGTH AS data_bytes, INDEX_LENGTH AS index_bytes, TABLE_COMMENT AS comment
      FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
}

async function describeTable(name) {
  const table = String(name || '');
  if (!TABLE_NAME.test(table)) throw publicError(400, 'CONTROL_TABLE_INVALID', 'Tên bảng không hợp lệ');
  const [columns, indexes, references] = await Promise.all([
    rows(`SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS default_value, COLUMN_KEY AS key_type, EXTRA AS extra
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [table]),
    rows(`SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns
          FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME, NON_UNIQUE ORDER BY INDEX_NAME`, [table]),
    rows(`SELECT COLUMN_NAME AS column_name, REFERENCED_TABLE_NAME AS referenced_table, REFERENCED_COLUMN_NAME AS referenced_column
          FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [table]),
  ]);
  if (!columns.length) throw publicError(404, 'CONTROL_TABLE_NOT_FOUND', 'Bảng không tồn tại');
  return { name: table, columns, indexes, references };
}

function sqlConsoleStatus() {
  // A SELECT console must run on a dedicated read-only credential. None is configured in this system,
  // so the console stays disabled; the write credential is never used for ad-hoc SQL.
  return { enabled: false, reason: 'READ_ONLY_CREDENTIAL_NOT_CONFIGURED' };
}

// ---------------------------------------------------------------- configuration (read-only view)

// Only non-secret runtime flags that already exist in wrangler vars / Render env. Values are read from the
// running process; changing them requires a reviewed config change + redeploy, never this API.
const CONFIG_REGISTRY = [
  { key: 'KTC_ENVIRONMENT', group: 'Deployment', description: 'Hồ sơ môi trường (test/production) quyết định CORS và kiểm tra secret.', dangerous: true },
  { key: 'NODE_ENV', group: 'Deployment', description: 'Chế độ runtime Node.', dangerous: true },
  { key: 'CORS_ORIGINS', group: 'Security', description: 'Danh sách origin frontend được phép gọi API.', dangerous: true },
  { key: 'KTC_MAINTENANCE_MODE', group: 'General', description: 'RESTORE chặn mọi thao tác ghi trong lúc khôi phục dữ liệu.', dangerous: true },
  { key: 'KTC_EXPOSE_SCHEMA_DIAGNOSTICS', group: 'Security', description: 'Trả danh sách bảng/cột thiếu trên /api/health/ready (công khai). Chỉ dùng cho TEST.', dangerous: true },
  { key: 'KTC_RUN_MASTER_DATA_BOOTSTRAP', group: 'Production', description: 'Seed dữ liệu chuẩn khi khởi động (Worker luôn tắt).', dangerous: true },
  { key: 'KTC_CLOUDFLARE_WORKER', group: 'Deployment', description: 'Đang chạy trên Cloudflare Workers.', dangerous: false },
  { key: 'JSON_BODY_LIMIT', group: 'Integration', description: 'Giới hạn kích thước JSON request.', dangerous: false },
];

function getConfiguration() {
  return {
    editable: false,
    source: 'runtime environment (wrangler vars / Render env)',
    items: CONFIG_REGISTRY.map((item) => ({ ...item, value: process.env[item.key] ?? null, isSet: process.env[item.key] !== undefined })),
  };
}

// ---------------------------------------------------------------- backup (no runtime source yet)

function getBackupStatus() {
  return {
    available: false,
    reason: 'BACKUP_CATALOG_NOT_CONFIGURED',
    message: 'Backup được tạo bằng script CLI (backend/scripts/createDatabaseBackup.js) và lưu file cục bộ; runtime không có catalog để đọc. Cần phê duyệt nơi lưu catalog (bảng hoặc R2) trước khi hiển thị lịch sử.',
    encryptionKeyConfigured: Boolean(process.env.KTC_BACKUP_ENCRYPTION_KEY),
    restoreFromWeb: false,
  };
}

module.exports = {
  ROLES,
  pageParams,
  getOverview,
  getOverviewCounts,
  buildSystemAlerts,
  listUsers,
  getUserDetail,
  listAudit,
  getHealth,
  listTables,
  describeTable,
  sqlConsoleStatus,
  getConfiguration,
  getBackupStatus,
  getAdminMatrix,
  parseMetadata,
};

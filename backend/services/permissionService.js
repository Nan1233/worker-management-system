const db = require('../config/db');

const PERMISSIONS = [
  ['DASHBOARD_VIEW','Tổng quan','dashboard'],
  ['REPORT_PENDING_VIEW','Xem báo cáo chờ duyệt','reports'],
  ['REPORT_APPROVE','Duyệt / từ chối báo cáo','reports'],
  ['REPORT_PENDING_EDIT','Sửa báo cáo chờ duyệt','reports'],
  ['REPORT_APPROVED_VIEW','Xem báo cáo đã duyệt','reports'],
  ['REPORT_APPROVED_EDIT','Sửa báo cáo đã duyệt','reports'],
  ['REPORT_DELETE','Xóa báo cáo đã duyệt','reports'],
  ['REPORT_EXPORT','Xuất / tải báo cáo Excel','excel'],
  ['EXCEL_DB_SYNC','Đồng bộ chỉnh sửa Excel vào DB','excel'],
  ['EXCEL_MASTER_SYNC','Đồng bộ dữ liệu chuẩn từ Excel','excel'],
  ['USER_VIEW','Xem người dùng / nhân sự','users'],
  ['USER_CREATE','Tạo người dùng','users'],
  ['USER_EDIT','Sửa / khóa người dùng','users'],
  ['MASTER_VIEW','Xem dữ liệu chuẩn','master'],
  ['MASTER_EDIT','Sửa dữ liệu chuẩn','master'],
  ['GOVERNANCE_VIEW','Xem quản trị dữ liệu','governance'],
  ['STATISTICS_VIEW','Xem thống kê','statistics'],
  ['NOTIFICATION_VIEW','Xem thông báo','system'],
  ['AUDIT_VIEW','Xem nhật ký hoạt động','system'],
  ['SYSTEM_HEALTH_VIEW','Xem trạng thái hệ thống','system'],
  ['PERMISSION_MANAGE','Quản lý vai trò & quyền','security'],
  ['WORKER_ENTRY','Nhập báo cáo sản xuất','worker'],
  ['WORKER_HISTORY','Xem lịch sử cá nhân','worker'],
  ['PROFILE_VIEW','Xem hồ sơ cá nhân','worker']
].map(([code,name,module]) => ({ code,name,module }));

const ALL_CODES = PERMISSIONS.map((item) => item.code);
const WORKER_CONTEXT_PERMISSIONS = new Set(['WORKER_ENTRY','WORKER_HISTORY']);

const ROLE_ADDITIONS = {
  worker: ['NOTIFICATION_VIEW','WORKER_ENTRY','WORKER_HISTORY','STATISTICS_VIEW','PROFILE_VIEW'],
  lead: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','MASTER_EDIT','AUDIT_VIEW','SYSTEM_HEALTH_VIEW'],
  manager: ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_CREATE','USER_EDIT','GOVERNANCE_VIEW'],
  admin: ALL_CODES
};

const ROLE_PARENT = {
  worker: null,
  lead: 'worker',
  manager: 'lead',
  admin: 'manager'
};

function buildRoleCapabilities() {
  const result = {};
  for (const role of ['worker','lead','manager','admin']) {
    const permissions = new Set();
    const parent = ROLE_PARENT[role];

    if (parent) {
      for (const code of result[parent] || []) {
        if (!WORKER_CONTEXT_PERMISSIONS.has(code)) permissions.add(code);
      }
    }

    for (const code of ROLE_ADDITIONS[role] || []) permissions.add(code);
    result[role] = permissions;
  }

  result.admin = new Set(ALL_CODES);
  return result;
}

const CAPABILITIES = buildRoleCapabilities();
const DEFAULTS = {
  admin: new Set(CAPABILITIES.admin),
  manager: new Set(CAPABILITIES.manager),
  lead: new Set(CAPABILITIES.lead),
  worker: new Set(CAPABILITIES.worker)
};

const MANDATORY_ROLE_PERMISSIONS = {
  manager: new Set(['REPORT_APPROVED_EDIT']),
  // Tổ trưởng được sửa báo cáo không phụ thuộc cửa sổ 10 phút của công nhân.
  lead: new Set(['MASTER_VIEW','MASTER_EDIT','REPORT_PENDING_EDIT','REPORT_APPROVED_EDIT'])
};

function isMandatoryPermission(role, code) {
  return MANDATORY_ROLE_PERMISSIONS[normalizeRole(role)]?.has(normalizeCode(code)) || false;
}

function applyPermissionOverride(target, role, code, allowed) {
  const normalizedRole = normalizeRole(role);
  const normalizedCode = normalizeCode(code);

  // Mandatory permissions are security/business invariants and cannot be revoked.
  if (isMandatoryPermission(normalizedRole, normalizedCode)) {
    target.add(normalizedCode);
    return;
  }

  if (allowed) target.add(normalizedCode);
  else target.delete(normalizedCode);
}

let schemaAvailable;
let cache = new Map();
const CACHE_TTL_MS = 60_000;
function normalizeRole(value) { return String(value || '').trim().toLowerCase(); }
function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }
function defaultSet(role) { return new Set(DEFAULTS[normalizeRole(role)] || []); }
function applyMandatoryRolePermissions(role, permissions) {
  for (const code of MANDATORY_ROLE_PERMISSIONS[normalizeRole(role)] || []) {
    permissions.add(code);
  }
  return permissions;
}
async function ensureSchemaAvailable() {
  if (schemaAvailable !== undefined) return schemaAvailable;
  try {
    const [rows] = await db.promise().query(`SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('role_permission_overrides','user_permission_overrides')`);
    schemaAvailable = Number(rows?.[0]?.total || 0) === 2;
  } catch { schemaAvailable = false; }
  return schemaAvailable;
}
function clearPermissionCache(userId) { if (userId) cache.delete(Number(userId)); else cache.clear(); }
async function getEffectivePermissions(user) {
  const role = normalizeRole(user?.role);
  if (role === 'admin') return new Set(ALL_CODES);
  const userId = Number(user?.id || 0);
  const cached = cache.get(userId);
  if (userId && cached && cached.expiresAt > Date.now() && cached.role === role) return new Set(cached.permissions);
  const result = defaultSet(role);
  if (await ensureSchemaAvailable()) {
    const [roleRows, userRows] = await Promise.all([
      db.promise().query('SELECT permission_code,allowed FROM role_permission_overrides WHERE role=?',[role]),
      userId ? db.promise().query('SELECT permission_code,allowed FROM user_permission_overrides WHERE user_id=?',[userId]) : Promise.resolve([[]])
    ]);
    // Precedence: Default Role → Role Override → User Override → Mandatory.
    for (const row of roleRows[0] || []) {
      const code = normalizeCode(row.permission_code);
      if (!ALL_CODES.includes(code)) continue;
      applyPermissionOverride(result, role, code, Number(row.allowed) === 1);
    }
    for (const row of userRows[0] || []) {
      const code = normalizeCode(row.permission_code);
      if (!ALL_CODES.includes(code)) continue;
      applyPermissionOverride(result, role, code, Number(row.allowed) === 1);
    }
  }
  applyMandatoryRolePermissions(role, result);
  if (userId) cache.set(userId,{ role, permissions:[...result], expiresAt:Date.now()+CACHE_TTL_MS });
  return result;
}
async function hasPermission(user, code) {
  const role = normalizeRole(user?.role);
  const normalized = normalizeCode(code);
  if (role === 'admin') return true;
  const set = await getEffectivePermissions(user);
  return set.has(normalized);
}
async function getAdminMatrix() {
  const roles = ['admin','manager','lead','worker']; const roleOverrides = {}; const userOverrides = {};
  if (await ensureSchemaAvailable()) {
    const [r] = await db.promise().query('SELECT role,permission_code,allowed FROM role_permission_overrides');
    const [u] = await db.promise().query('SELECT user_id,permission_code,allowed FROM user_permission_overrides');
    for (const row of r) (roleOverrides[row.role] ||= {})[row.permission_code] = Boolean(row.allowed);
    for (const row of u) (userOverrides[row.user_id] ||= {})[row.permission_code] = Boolean(row.allowed);
  }
  return { permissions: PERMISSIONS, mandatoryRolePermissions: Object.fromEntries(
    roles.map((role) => [role, [...(MANDATORY_ROLE_PERMISSIONS[role] || [])]])
  ), roles: roles.map((role) => ({ role, defaults:Object.fromEntries(ALL_CODES.map((code)=>[code,DEFAULTS[role]?.has(code)||false])), capabilities:Object.fromEntries(ALL_CODES.map((code)=>[code,CAPABILITIES[role]?.has(code)||false])), overrides: roleOverrides[role] || {} })), userOverrides };
}
async function setUserPermission(userId, permissionCode, allowed) {
  if (!await ensureSchemaAvailable()) throw Object.assign(new Error('Bảng phân quyền chưa sẵn sàng'), { status: 503 });
  const code = normalizeCode(permissionCode);
  if (!ALL_CODES.includes(code)) throw Object.assign(new Error('Permission không hợp lệ'), { status: 400 });
  await db.promise().query(`INSERT INTO user_permission_overrides(user_id,permission_code,allowed) VALUES(?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed)`,[Number(userId),code,allowed?1:0]);
  clearPermissionCache(Number(userId));
}
async function setRolePermission(role, permissionCode, allowed) {
  if (!await ensureSchemaAvailable()) throw Object.assign(new Error('Bảng phân quyền chưa sẵn sàng'), { status: 503 });
  const normalizedRole = normalizeRole(role);
  const code = normalizeCode(permissionCode);
  if (!DEFAULTS[normalizedRole]) throw Object.assign(new Error('Role không hợp lệ'), { status: 400 });
  if (!ALL_CODES.includes(code)) throw Object.assign(new Error('Permission không hợp lệ'), { status: 400 });
  if (isMandatoryPermission(normalizedRole, code) && !allowed) {
    throw Object.assign(new Error('Không thể tắt quyền bắt buộc của role'), { status: 400 });
  }
  await db.promise().query(`INSERT INTO role_permission_overrides(role,permission_code,allowed) VALUES(?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed)`,[normalizedRole,code,allowed?1:0]);
  cache.clear();
}
function getPermissionList() { return PERMISSIONS.map((item) => ({ ...item })); }
module.exports = { getEffectivePermissions, hasPermission, getPermissionList, getAdminMatrix, setUserPermission, setRolePermission, clearPermissionCache };
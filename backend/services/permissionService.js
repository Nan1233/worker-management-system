const getDb = () => require('../config/db');

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
  lead: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','MASTER_EDIT','AUDIT_VIEW'],
  manager: ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_CREATE','USER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW'],
  admin_ops: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','PROFILE_VIEW'],
  admin: ALL_CODES
};

const ROLE_PARENT = {
  worker: null,
  lead: 'worker',
  manager: 'lead',
  admin_ops: 'lead',
  admin: 'manager'
};

function buildRoleCapabilities() {
  const result = {};
  for (const role of ['worker','lead','manager','admin_ops','admin']) {
    const permissions = new Set();
    const parent = ROLE_PARENT[role];

    if (parent) {
      for (const code of result[parent] || []) {
        if (!WORKER_CONTEXT_PERMISSIONS.has(code)) permissions.add(code);
      }
    }

    for (const code of ROLE_ADDITIONS[role] || []) permissions.add(code);
    if (role === 'admin_ops') {
      for (const code of ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','MASTER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY','REPORT_PENDING_EDIT']) permissions.delete(code);
    }
    result[role] = permissions;
  }

  result.admin = new Set(ALL_CODES);
  return result;
}

const CAPABILITIES = buildRoleCapabilities();
const DEFAULTS = {
  admin: new Set(CAPABILITIES.admin),
  admin_ops: new Set(CAPABILITIES.admin_ops),
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
// super_admin carries every admin permission (effective role admin); privileged super-admin-only
// operations check req.user.is_super_admin separately.
function normalizeRole(value) { const role = String(value || '').trim().toLowerCase(); return role === 'super_admin' ? 'admin' : role; }
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

  // Missing override tables are a supported legacy-schema state: the metadata
  // query succeeds and returns a count below 2. A query/connection/privilege
  // error is different: do not silently ignore configured permission overrides.
  const [rows] = await getDb().promise().query(`SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('role_permission_overrides','user_permission_overrides')`);
  schemaAvailable = Number(rows?.[0]?.total || 0) === 2;
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
  if (role === 'admin_ops') {
    // Role/user overrides may revoke operational rights, but cannot grant beyond this hard ceiling.
    for (const code of [...result]) if (!CAPABILITIES.admin_ops.has(code)) result.delete(code);
  }
  if (userId) cache.set(userId,{ role, permissions:[...result], expiresAt:Date.now()+CACHE_TTL_MS });
  return result;
}
async function hasPermission(user, code) {
  const role = normalizeRole(user?.role);
  const normalized = normalizeCode(code);
  if (role === 'admin') return true;
  if (role === 'admin_ops' && normalized === 'PERMISSION_MANAGE') return false;
  const set = await getEffectivePermissions(user);
  return set.has(normalized);
}
async function getAdminMatrix() {
  const roles = ['admin','admin_ops','manager','lead','worker']; const roleOverrides = {}; const userOverrides = {};
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
function permissionError(status, code, message) {
  return Object.assign(new Error(message), { status, code, isPublic: true });
}

// allowed: true (grant), false (revoke) or null (back to the role/default value = delete the override row).
function normalizeOverrideValue(allowed) {
  if (allowed === null || allowed === undefined || allowed === 'default') return null;
  if (allowed === true || allowed === 1 || allowed === '1' || allowed === 'true') return true;
  if (allowed === false || allowed === 0 || allowed === '0' || allowed === 'false') return false;
  throw permissionError(400, 'PERMISSION_VALUE_INVALID', 'Giá trị quyền phải là cho phép, từ chối hoặc mặc định');
}

function assertOverrideAllowed(role, code, allowed) {
  if (role === 'admin') throw permissionError(400, 'PERMISSION_ADMIN_IMMUTABLE', 'Admin luôn giữ toàn quyền; không thể đặt quyền riêng');
  if (!DEFAULTS[role]) throw permissionError(400, 'PERMISSION_ROLE_INVALID', 'Role không hợp lệ');
  if (!ALL_CODES.includes(code)) throw permissionError(400, 'PERMISSION_CODE_INVALID', 'Permission không hợp lệ');
  if (allowed === false && isMandatoryPermission(role, code)) throw permissionError(400, 'PERMISSION_MANDATORY', 'Không thể tắt quyền bắt buộc của role');
  // Role ceiling: an override may only grant what the role's capability set supports.
  if (allowed === true && !CAPABILITIES[role]?.has(code)) throw permissionError(400, 'PERMISSION_ABOVE_ROLE_CEILING', 'Quyền này vượt quá giới hạn của vai trò');
}

const toOverrideState = (row) => (row ? Number(row.allowed) === 1 : null);

async function writeOverride({ table, keyColumn, keyValue, code, allowed, audit }) {
  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.query(`SELECT allowed FROM ${table} WHERE ${keyColumn}=? AND permission_code=? LIMIT 1`, [keyValue, code]);
    const before = toOverrideState(beforeRows?.[0]);
    if (allowed === null) {
      await connection.query(`DELETE FROM ${table} WHERE ${keyColumn}=? AND permission_code=?`, [keyValue, code]);
    } else {
      await connection.query(`INSERT INTO ${table}(${keyColumn},permission_code,allowed) VALUES(?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed)`, [keyValue, code, allowed ? 1 : 0]);
    }
    if (typeof audit === 'function') await audit({ before, after: allowed, executor: connection });
    await connection.commit();
    return { before, after: allowed };
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* original error wins */ }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Set (true/false) or clear (null) one user's permission override.
 * `audit({ before, after, executor })` runs in the same transaction, so a change is never stored unaudited.
 */
async function setUserPermission(userId, permissionCode, allowed, { audit } = {}) {
  if (!await ensureSchemaAvailable()) throw permissionError(503, 'PERMISSION_SCHEMA_UNAVAILABLE', 'Bảng phân quyền chưa sẵn sàng');
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw permissionError(400, 'PERMISSION_USER_INVALID', 'User không hợp lệ');
  const code = normalizeCode(permissionCode);
  const value = normalizeOverrideValue(allowed);
  const [userRows] = await db.promise().query('SELECT id,role FROM users WHERE id=? LIMIT 1', [id]);
  const targetRole = normalizeRole(userRows?.[0]?.role);
  if (!targetRole) throw permissionError(404, 'PERMISSION_USER_NOT_FOUND', 'User không tồn tại');
  assertOverrideAllowed(targetRole, code, value);
  const result = await writeOverride({ table: 'user_permission_overrides', keyColumn: 'user_id', keyValue: id, code, allowed: value, audit: audit && ((ctx) => audit({ ...ctx, role: targetRole, userId: id, code })) });
  clearPermissionCache(id);
  return { ...result, role: targetRole, userId: id, code };
}

/** Set (true/false) or clear (null) a role-level override. Same audit contract as setUserPermission. */
async function setRolePermission(role, permissionCode, allowed, { audit } = {}) {
  if (!await ensureSchemaAvailable()) throw permissionError(503, 'PERMISSION_SCHEMA_UNAVAILABLE', 'Bảng phân quyền chưa sẵn sàng');
  const normalizedRole = normalizeRole(role);
  const code = normalizeCode(permissionCode);
  const value = normalizeOverrideValue(allowed);
  assertOverrideAllowed(normalizedRole, code, value);
  const result = await writeOverride({ table: 'role_permission_overrides', keyColumn: 'role', keyValue: normalizedRole, code, allowed: value, audit: audit && ((ctx) => audit({ ...ctx, role: normalizedRole, code })) });
  cache.clear();
  return { ...result, role: normalizedRole, code };
}
function getPermissionList() { return PERMISSIONS.map((item) => ({ ...item })); }
module.exports = { getEffectivePermissions, hasPermission, getPermissionList, getAdminMatrix, setUserPermission, setRolePermission, clearPermissionCache, CAPABILITIES, ALL_CODES };
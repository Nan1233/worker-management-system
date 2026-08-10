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
  ['FORMULA_VIEW','Xem công thức','formula'],
  ['FORMULA_EDIT','Sửa công thức','formula'],
  ['GOVERNANCE_VIEW','Xem quản trị dữ liệu','governance'],
  ['PERIOD_LOCK','Khóa kỳ báo cáo','governance'],
  ['PERIOD_UNLOCK','Mở khóa kỳ báo cáo','governance'],
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
const CAPABILITIES = {
  admin: new Set(ALL_CODES),
  manager: new Set(CAPABILITIES.manager),
  lead: new Set(['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_APPROVED_VIEW','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','FORMULA_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','SYSTEM_HEALTH_VIEW','PROFILE_VIEW']),
  worker: new Set(['NOTIFICATION_VIEW','WORKER_ENTRY','WORKER_HISTORY','PROFILE_VIEW'])
};
const DEFAULTS = {
  admin: new Set(ALL_CODES),
  manager: new Set(CAPABILITIES.manager),
  lead: new Set(CAPABILITIES.lead),
  worker: new Set(CAPABILITIES.worker)
};

let schemaAvailable;
let cache = new Map();
const CACHE_TTL_MS = 60_000;

function normalizeRole(value) { return String(value || '').trim().toLowerCase(); }
function normalizeCode(value) { return String(value || '').trim().toUpperCase(); }
function defaultSet(role) { return new Set(DEFAULTS[normalizeRole(role)] || []); }

async function ensureSchemaAvailable() {
  if (schemaAvailable !== undefined) return schemaAvailable;
  try {
    const [rows] = await db.promise().query(
      `SELECT COUNT(*) total FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name IN ('role_permission_overrides','user_permission_overrides')`
    );
    schemaAvailable = Number(rows?.[0]?.total || 0) === 2;
  } catch {
    schemaAvailable = false;
  }
  return schemaAvailable;
}

function clearPermissionCache(userId) {
  if (userId) cache.delete(Number(userId));
  else cache.clear();
}

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
    for (const row of roleRows[0] || []) {
      const code = normalizeCode(row.permission_code);
      if (!ALL_CODES.includes(code)) continue;
      Number(row.allowed) ? result.add(code) : result.delete(code);
    }
    for (const row of userRows[0] || []) {
      const code = normalizeCode(row.permission_code);
      if (!ALL_CODES.includes(code)) continue;
      Number(row.allowed) ? result.add(code) : result.delete(code);
    }
  }
  if (userId) cache.set(userId,{ role, permissions:[...result], expiresAt:Date.now()+CACHE_TTL_MS });
  return result;
}

async function hasPermission(user, code) {
  if (normalizeRole(user?.role) === 'admin') return true;
  const set = await getEffectivePermissions(user);
  return set.has(normalizeCode(code));
}

async function getAdminMatrix() {
  const roles = ['admin','manager','lead','worker'];
  const roleOverrides = {};
  const userOverrides = {};
  if (await ensureSchemaAvailable()) {
    const [r] = await db.promise().query('SELECT role,permission_code,allowed FROM role_permission_overrides');
    const [u] = await db.promise().query('SELECT user_id,permission_code,allowed FROM user_permission_overrides');
    for (const row of r) (roleOverrides[row.role] ||= {})[row.permission_code] = Boolean(row.allowed);
    for (const row of u) (userOverrides[row.user_id] ||= {})[row.permission_code] = Boolean(row.allowed);
  }
  return {
    permissions: PERMISSIONS,
    roles: roles.map((role) => ({ role, defaults:Object.fromEntries(ALL_CODES.map((code)=>[code,DEFAULTS[role]?.has(code)||false])), capabilities:Object.fromEntries(ALL_CODES.map((code)=>[code,CAPABILITIES[role]?.has(code)||false])), overrides: roleOverrides[role] || {} })),
    userOverrides
  };
}

async function setRoleOverride(role, permissionCode, allowed) {
  role = normalizeRole(role); permissionCode = normalizeCode(permissionCode);
  if (!['manager','lead','worker'].includes(role)) throw Object.assign(new Error('Không cho phép thay đổi quyền mặc định của Admin'),{status:400});
  if (!ALL_CODES.includes(permissionCode)) throw Object.assign(new Error('Mã quyền không hợp lệ'),{status:400});
  if (!CAPABILITIES[role]?.has(permissionCode)) throw Object.assign(new Error('Quyền này không áp dụng cho vai trò đã chọn'),{status:400});
  if (!(await ensureSchemaAvailable())) throw Object.assign(new Error('Chưa chạy migration phân quyền'),{status:503});
  if (allowed === null) await db.promise().query('DELETE FROM role_permission_overrides WHERE role=? AND permission_code=?',[role,permissionCode]);
  else await db.promise().query(`INSERT INTO role_permission_overrides(role,permission_code,allowed,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed),updated_at=NOW()`,[role,permissionCode,allowed?1:0]);
  clearPermissionCache();
}

async function setUserOverride(userId, permissionCode, allowed) {
  userId = Number(userId); permissionCode = normalizeCode(permissionCode);
  if (!Number.isInteger(userId) || userId<=0 || !ALL_CODES.includes(permissionCode)) throw Object.assign(new Error('Dữ liệu quyền không hợp lệ'),{status:400});
  if (!(await ensureSchemaAvailable())) throw Object.assign(new Error('Chưa chạy migration phân quyền'),{status:503});
  const [[user]] = await db.promise().query('SELECT id,role FROM users WHERE id=? LIMIT 1',[userId]);
  if (!user) throw Object.assign(new Error('Người dùng không tồn tại'),{status:404});
  if (normalizeRole(user.role)==='admin') throw Object.assign(new Error('Admin luôn có toàn quyền'),{status:400});
  if (!CAPABILITIES[normalizeRole(user.role)]?.has(permissionCode)) throw Object.assign(new Error('Quyền này không áp dụng cho vai trò của người dùng'),{status:400});
  if (allowed === null) await db.promise().query('DELETE FROM user_permission_overrides WHERE user_id=? AND permission_code=?',[userId,permissionCode]);
  else await db.promise().query(`INSERT INTO user_permission_overrides(user_id,permission_code,allowed,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed),updated_at=NOW()`,[userId,permissionCode,allowed?1:0]);
  clearPermissionCache(userId);
}

module.exports = { PERMISSIONS, ALL_CODES, CAPABILITIES, DEFAULTS, getEffectivePermissions, hasPermission, getAdminMatrix, setRoleOverride, setUserOverride, clearPermissionCache };

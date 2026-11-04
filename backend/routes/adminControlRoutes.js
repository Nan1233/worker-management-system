'use strict';

// KTC Master Control Center API. Admin only.
//   auth (full DB-backed user check) -> role('admin') -> permission per module.
// Admin is the existing super-admin role (no new role). admin_ops, manager, lead and worker are
// rejected by role('admin') even if a permission override were granted. Everything here is read-only
// except PATCH /users/:id/status, which reuses the existing user update controller (reversible lock).
// The generic activity middleware does not cover this prefix, so writes are audited explicitly.

const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const db = require('../config/db');
const AuditService = require('../services/auditService');
const control = require('../services/masterControlService');
const updateUserController = require('../controllers/userUpdateController');
const { guardPrivilegedTarget } = require('../middleware/privilegedTargetGuard');

router.use(auth, role('admin'));

const handle = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (error) {
    if (error?.status && error?.isPublic) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return next(error);
  }
};

const readiness = (req) => req.app?.locals?.runtimeReadiness || null;

router.get('/session', handle(async (req) => ({ id: req.user.id, username: req.user.username, role: req.user.role, isSuperAdmin: req.user.is_super_admin === true, access: 'master-control' })));
router.get('/overview', permission('DASHBOARD_VIEW'), handle((req) => control.getOverview({ readiness: readiness(req) })));
router.get('/users', permission('USER_VIEW'), handle((req) => control.listUsers(req.query)));
router.get('/users/:id', permission('USER_VIEW'), handle((req) => control.getUserDetail(req.params.id)));
router.get('/permissions/matrix', permission('PERMISSION_MANAGE'), handle(() => control.getAdminMatrix()));
router.get('/audit', permission('AUDIT_VIEW'), handle((req) => control.listAudit(req.query)));
router.get('/health', permission('SYSTEM_HEALTH_VIEW'), handle((req) => control.getHealth({ readiness: readiness(req) })));
router.get('/database/tables', permission('SYSTEM_HEALTH_VIEW'), handle(async () => ({ tables: await control.listTables(), sqlConsole: control.sqlConsoleStatus() })));
router.get('/database/tables/:name', permission('SYSTEM_HEALTH_VIEW'), handle((req) => control.describeTable(req.params.name)));
router.get('/configuration', permission('SYSTEM_HEALTH_VIEW'), handle(() => control.getConfiguration()));
router.get('/backup', permission('SYSTEM_HEALTH_VIEW'), handle(() => control.getBackupStatus()));

// Reversible account lock/unlock. Unlike PUT /api/users/:id (where status=inactive on a Lead is routed to
// permanent deletion), this endpoint only flips users.status through the existing update controller, which
// keeps its scope checks and revokes refresh sessions on deactivation. No row is deleted.
router.patch('/users/:id/status', permission('USER_EDIT'), guardPrivilegedTarget(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, code: 'CONTROL_USER_INVALID', message: 'ID người dùng không hợp lệ' });
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ success: false, code: 'CONTROL_STATUS_INVALID', message: 'Trạng thái phải là active hoặc inactive' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) return res.status(400).json({ success: false, code: 'CONTROL_REASON_REQUIRED', message: 'Vui lòng nhập lý do (3–500 ký tự)' });
    if (id === Number(req.user.id) && status === 'inactive') return res.status(400).json({ success: false, code: 'CONTROL_SELF_LOCK_FORBIDDEN', message: 'Không thể tự khóa tài khoản đang đăng nhập' });
    const [found] = await db.promise().query('SELECT id, role, status FROM users WHERE id=? LIMIT 1', [id]);
    const before = found?.[0];
    if (!before) return res.status(404).json({ success: false, code: 'CONTROL_USER_NOT_FOUND', message: 'Người dùng không tồn tại' });
    if (String(before.status) === status) return res.json({ success: true, data: { id, status, changed: false } });

    // Run the existing controller with a body that carries only the status change.
    const captured = await new Promise((resolve, reject) => {
      const proxyRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode, payload }); return this; },
      };
      Promise.resolve(updateUserController.updateUser({ ...req, params: { id: String(id) }, body: { status }, _statusAuditHandled: true }, proxyRes, reject)).catch(reject);
    });
    if (captured.status >= 400) return res.status(captured.status).json(captured.payload);

    try {
      await AuditService.logActivity({
        userId: req.user.id,
        action: status === 'inactive' ? 'CONTROL_USER_LOCKED' : 'CONTROL_USER_UNLOCKED',
        entityType: 'user',
        entityId: id,
        description: `${status === 'inactive' ? 'Khóa' : 'Mở khóa'} tài khoản #${id} (${before.role}) từ Master Control`,
        metadata: { before: { status: before.status }, after: { status }, target_role: before.role, reason, actor_is_super_admin: req.user?.is_super_admin === true, request_id: req.requestId || null, reversible: true },
        req,
      });
    } catch (auditError) {
      console.error('[KTC] CONTROL_AUDIT_FAILED', { requestId: req.requestId || null, message: auditError?.message });
      return res.status(500).json({ success: false, code: 'CONTROL_AUDIT_FAILED', message: 'Đã đổi trạng thái nhưng không ghi được nhật ký; hãy kiểm tra Audit Center', data: { id, status, changed: true } });
    }
    return res.json({ success: true, data: { id, status, changed: true } });
  } catch (error) { return next(error); }
});

module.exports = router;

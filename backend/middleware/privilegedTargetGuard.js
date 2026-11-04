'use strict';

const db = require('../config/db');
const AuditService = require('../services/auditService');
const { normalizeRoleName, isSuperAdminActor } = require('../utils/roles');

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin']);

/**
 * Only a super admin may modify an admin / super_admin account (lock, unlock, edit, password,
 * permission overrides). Runs on the server for every such route, so hiding UI buttons is not the
 * control. Denied attempts are written to activity_logs as a security event.
 * @param {(req) => unknown} pickTargetId
 */
const guardPrivilegedTarget = (pickTargetId = (req) => req.params.id) => async (req, res, next) => {
  try {
    const targetId = Number(pickTargetId(req));
    if (!Number.isInteger(targetId) || targetId <= 0) return next();
    const [rows] = await db.promise().query('SELECT id, role FROM users WHERE id=? LIMIT 1', [targetId]);
    const targetRole = normalizeRoleName(rows?.[0]?.role);
    if (!PRIVILEGED_ROLES.has(targetRole) || isSuperAdminActor(req.user)) return next();
    try {
      await AuditService.logActivity({
        userId: req.user?.id,
        action: 'SECURITY_PRIVILEGED_TARGET_DENIED',
        entityType: 'user',
        entityId: targetId,
        description: `Từ chối ${req.method} ${String(req.originalUrl || '').split('?')[0]} lên tài khoản ${targetRole} #${targetId}`,
        metadata: { target_role: targetRole, actor_role: req.user?.role || null, method: req.method, request_id: req.requestId || null },
        req,
      });
    } catch (error) { console.error('[KTC] PRIVILEGED_GUARD_AUDIT_FAILED', { message: error?.message }); }
    return res.status(403).json({ success: false, code: 'PRIVILEGED_TARGET_FORBIDDEN', message: 'Chỉ Super Admin mới được thay đổi tài khoản Admin / Super Admin' });
  } catch (error) { return next(error); }
};

module.exports = { guardPrivilegedTarget, PRIVILEGED_ROLES };

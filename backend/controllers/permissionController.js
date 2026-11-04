const db = require('../config/db');
const service = require('../services/permissionService');

exports.me = async (req,res,next) => { try { const permissions=[...(await service.getEffectivePermissions(req.user))]; res.json({success:true,data:{permissions}}); } catch(e){next(e);} };
exports.matrix = async (req,res,next) => { try {
  const matrix=await service.getAdminMatrix();
  const [users]=await db.promise().query(`SELECT id,username,full_name,role,status FROM users ORDER BY FIELD(role,'admin','manager','lead','worker'),full_name,username`);
  res.json({success:true,data:{...matrix,users}});
} catch(e){next(e);} };
const AuditService = require('../services/auditService');

const sendPermissionError = (res, next, error) => {
  if (error?.status) return res.status(error.status).json({ success: false, code: error.code || 'PERMISSION_UPDATE_FAILED', message: error.message });
  return next(error);
};

// Every permission change is written to activity_logs inside the same DB transaction as the
// override row, so a change can never exist without its audit record (the generic activity
// middleware intentionally skips /api/permissions).
const permissionAudit = (req, entityType) => async ({ before, after, executor, role, userId, code }) => {
  const action = after === null ? 'PERMISSION_OVERRIDE_CLEARED' : after ? 'PERMISSION_OVERRIDE_GRANTED' : 'PERMISSION_OVERRIDE_REVOKED';
  await AuditService.logActivity({
    userId: req.user?.id,
    action,
    entityType,
    entityId: entityType === 'user_permission' ? `${userId}:${code}` : `${role}:${code}`,
    description: `${action} ${entityType === 'user_permission' ? `user ${userId} (${role})` : `role ${role}`} ${code}`,
    metadata: { role, user_id: userId ?? null, permission_code: code, before, after, actor_role: req.user?.role || null, request_id: req.requestId || null },
    req,
  }, executor);
};

exports.setRole = async (req, res, next) => {
  try {
    const result = await service.setRolePermission(req.params.role, req.params.code, req.body?.allowed ?? null, { audit: permissionAudit(req, 'role_permission') });
    res.json({ success: true, data: result });
  } catch (error) { return sendPermissionError(res, next, error); }
};

exports.setUser = async (req, res, next) => {
  try {
    const result = await service.setUserPermission(req.params.userId, req.params.code, req.body?.allowed ?? null, { audit: permissionAudit(req, 'user_permission') });
    res.json({ success: true, data: result });
  } catch (error) { return sendPermissionError(res, next, error); }
};

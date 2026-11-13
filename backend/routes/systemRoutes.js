const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const fastAuth = require('../middleware/fastAuthMiddleware');
const role = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const validate = require('../middleware/validateRequest');
const c = require('../controllers/systemController');

// Badge và danh sách thông báo là API đọc, gọi thường xuyên. Chỉ xác minh JWT
// để tránh truy vấn users/workers lại trong lúc Render vừa deploy/cold start.
router.get('/notifications/unread-count', fastAuth, permission('NOTIFICATION_VIEW'), c.getUnreadNotificationCount);
router.get('/notifications', fastAuth, permission('NOTIFICATION_VIEW'), c.getNotifications);

// Các thao tác thay đổi dữ liệu vẫn kiểm tra trạng thái tài khoản đầy đủ.
router.patch('/notifications/read-all', auth, permission('NOTIFICATION_VIEW'), c.markAllNotificationsRead);
router.patch(
  '/notifications/:id/read',
  auth,
  permission('NOTIFICATION_VIEW'),
  validate({ id: { in: 'params', type: 'positiveInt', required: true } }),
  c.markNotificationRead
);
router.get('/observability', auth, role('admin','manager'), permission('SYSTEM_HEALTH_VIEW'), c.getObservability);
router.get('/activities', auth, role('admin','admin_ops','manager','lead'), permission('AUDIT_VIEW'), c.getActivities);
router.get('/deleted-reports', auth, role('admin','admin_ops','manager','lead'), permission('AUDIT_VIEW'), c.getDeletedReports);

// Startup performance telemetry: authenticated writes; administrator-only reads.
// No raw logs, device hostname, tokens or file paths are accepted.
const startupDiag = require('../services/desktopStartupDiagnosticsService');
router.post('/desktop-startup', auth, async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json({ success: false });
  try {
    const id = await startupDiag.submit(userId, req.body);
    if (id === null) return res.status(400).json({ success: false, code: 'INVALID_STARTUP_DIAGNOSTICS' });
    return res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('DESKTOP_STARTUP_SAVE_FAILED', String(error?.code || 'DB_ERROR'));
    return res.status(503).json({ success: false, code: 'STARTUP_DIAGNOSTICS_UNAVAILABLE' });
  }
});
router.get('/desktop-startup', auth, role('admin'), permission('SYSTEM_HEALTH_VIEW'), async (req, res) => {
  try { return res.json({ success: true, data: await startupDiag.recent(req.query?.limit) }); }
  catch (error) {
    console.error('DESKTOP_STARTUP_LIST_FAILED', String(error?.code || 'DB_ERROR'));
    return res.status(503).json({ success: false, code: 'STARTUP_DIAGNOSTICS_UNAVAILABLE' });
  }
});

const reportVersionPermission = (req,res,next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const type = String(req.query?.type || '').trim().toLowerCase();
  const requiredPermission = role === 'worker'
    ? 'WORKER_HISTORY'
    : type === 'temp' ? 'REPORT_PENDING_VIEW' : 'REPORT_APPROVED_VIEW';
  return permission(requiredPermission)(req,res,next);
};
router.get(
  '/reports/:id/versions',
  auth,
  role('admin', 'admin_ops', 'manager', 'lead', 'worker'),
  validate({ id: { in: 'params', type: 'positiveInt', required: true } }),
  reportVersionPermission,
  c.getReportVersions
);

module.exports = router;

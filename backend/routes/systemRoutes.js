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
router.get('/activities', auth, role('admin','manager','lead'), permission('AUDIT_VIEW'), c.getActivities);
router.get('/deleted-reports', auth, role('admin','manager','lead'), permission('AUDIT_VIEW'), c.getDeletedReports);
router.get(
  '/reports/:id/versions',
  auth,
  role('admin', 'manager', 'lead', 'worker'),
  validate({ id: { in: 'params', type: 'positiveInt', required: true } }),
  c.getReportVersions
);

module.exports = router;

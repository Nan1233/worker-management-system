const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('../controllers/userController');
const controllerExtras = require('../controllers/userControllerExtras');
const updateUserController = require('../controllers/userUpdateController');
const createUserController = require('../controllers/userCreateController');
const promotionController = require('../controllers/workerPromotionController');
const permanentDeletionController = require('../controllers/permanentUserDeletionController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const processAssignmentCapacity = require('../middleware/processAssignmentCapacityMiddleware');

router.use(verifyToken, checkRole('admin','admin_ops','manager','lead'));
const runUserHandler = (name) => (req, res, next) => {
  const handler = controllerExtras?.[name] || controller?.[name];
  if (typeof handler !== 'function') return res.status(500).json({ success: false, code: 'USER_HANDLER_MISSING', message: `Thiếu bộ xử lý ${name} của quản lý người dùng` });
  return handler(req, res, next);
};
router.get('/export/excel', permission('USER_VIEW'), runUserHandler('exportUsersExcel'));
router.post('/import/excel', (req,res,next) => req.user?.role === 'admin_ops' ? res.status(403).json({success:false,code:'ROLE_SCOPE_FORBIDDEN',message:'Admin vận hành không được nhập Excel hàng loạt'}) : next(), permission('USER_CREATE','USER_EDIT'), runUserHandler('importUsersExcel'));
router.get('/', permission('USER_VIEW'), controller.getAllUsers);
router.get('/options/processes', permission('USER_VIEW','MASTER_VIEW'), (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success && Array.isArray(body.data)) body.data = body.data.map((process) => ({ ...process, id: Number(process.id) }));
    return originalJson(body);
  };
  return controller.getProcessOptions(req, res, next);
});
router.get('/:id', permission('USER_VIEW'), controller.getUserById);
const ensureWorkerTechnicalPassword = (req, _res, next) => {
  if (String(req.body?.role || '').trim() === 'worker' && !String(req.body?.password || '')) req.body.password = crypto.randomBytes(32).toString('hex');
  next();
};
// Locking an account (status=inactive) is always a reversible status change handled by updateUser —
// for every role, including Lead. Permanent Lead deletion is only the explicit DELETE /:id/permanent
// endpoint; PUT /:id must never delete an account (decision 2026-11-04).
router.post('/', permission('USER_CREATE'), ensureWorkerTechnicalPassword, processAssignmentCapacity, createUserController.createUser);
router.post('/:id/promote-lead', (req,res,next) => req.user?.role === 'admin_ops' ? res.status(403).json({success:false,code:'ROLE_SCOPE_FORBIDDEN',message:'Admin vận hành không được nâng cấp vai trò tài khoản'}) : next(), permission('USER_EDIT'), promotionController.promoteWorkerToLead);
router.post('/:id/promote-manager', (req,res,next) => req.user?.role === 'admin_ops' ? res.status(403).json({success:false,code:'ROLE_SCOPE_FORBIDDEN',message:'Admin vận hành không được nâng cấp vai trò tài khoản'}) : next(), permission('USER_EDIT'), promotionController.promoteWorkerToManager);
router.delete('/:id/permanent', (req,res,next) => req.user?.role === 'admin_ops' ? res.status(403).json({success:false,code:'ROLE_SCOPE_FORBIDDEN',message:'Admin vận hành không được xóa vĩnh viễn tài khoản'}) : next(), permission('USER_EDIT'), permanentDeletionController.deleteLeadPermanently);
router.put('/:id', permission('USER_EDIT'), processAssignmentCapacity, updateUserController.updateUser);
module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('../controllers/userController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const processAssignmentCapacity = require('../middleware/processAssignmentCapacityMiddleware');

router.use(verifyToken, checkRole('admin','manager','lead'));
router.get('/export/excel', permission('USER_VIEW'), controller.exportUsersExcel);
router.post('/import/excel', permission('USER_CREATE','USER_EDIT'), controller.importUsersExcel);
router.get('/', permission('USER_VIEW'), controller.getAllUsers);
router.get('/options/processes', permission('USER_VIEW','MASTER_VIEW'), controller.getProcessOptions);
router.get('/:id', permission('USER_VIEW'), controller.getUserById);

// Công nhân hiện đăng nhập bằng mã công nhân, không cần nhập mật khẩu.
// DB vẫn có cột password bắt buộc nên backend tạo một mật khẩu kỹ thuật ngẫu nhiên
// và không hiển thị/không yêu cầu công nhân biết mật khẩu này.
const ensureWorkerTechnicalPassword = (req, _res, next) => {
  if (String(req.body?.role || '').trim() === 'worker' && !String(req.body?.password || '')) {
    req.body.password = crypto.randomBytes(32).toString('hex');
  }
  next();
};

router.post('/', permission('USER_CREATE'), ensureWorkerTechnicalPassword, processAssignmentCapacity, controller.createUser);
router.put('/:id', permission('USER_EDIT'), processAssignmentCapacity, controller.updateUser);
module.exports = router;

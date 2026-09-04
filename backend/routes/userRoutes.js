const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('../controllers/userController');
const promotionController = require('../controllers/workerPromotionController');
const permanentDeletionController = require('../controllers/permanentUserDeletionController');
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

const ensureWorkerTechnicalPassword = (req, _res, next) => {
  if (String(req.body?.role || '').trim() === 'worker' && !String(req.body?.password || '')) {
    req.body.password = crypto.randomBytes(32).toString('hex');
  }
  next();
};

const ensureLeadDefaultPassword = (req, _res, next) => {
  if (String(req.body?.role || '').trim() === 'lead' && !String(req.body?.password || '')) {
    req.body.password = process.env.KTC_DEFAULT_LEAD_PASSWORD || '123456';
  }
  next();
};

router.post('/', permission('USER_CREATE'), ensureWorkerTechnicalPassword, ensureLeadDefaultPassword, processAssignmentCapacity, controller.createUser);
router.post('/:id/promote-lead', permission('USER_EDIT'), promotionController.promoteWorkerToLead);
router.post('/:id/promote-manager', permission('USER_EDIT'), promotionController.promoteWorkerToManager);
router.delete('/:id/permanent', permission('USER_EDIT'), permanentDeletionController.deleteLeadPermanently);
router.put('/:id', permission('USER_EDIT'), processAssignmentCapacity, controller.updateUser);
module.exports = router;

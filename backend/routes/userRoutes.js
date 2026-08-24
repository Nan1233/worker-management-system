const express = require('express');
const router = express.Router();
const controller = require('../controllers/userController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');

router.use(verifyToken, checkRole('admin','manager','lead'));
router.get('/export/excel', permission('USER_VIEW'), controller.exportUsersExcel);
router.post('/import/excel', permission('USER_CREATE','USER_EDIT'), controller.importUsersExcel);
router.get('/', permission('USER_VIEW'), controller.getAllUsers);
router.get('/options/processes', permission('USER_VIEW','MASTER_VIEW'), controller.getProcessOptions);
router.get('/:id', permission('USER_VIEW'), controller.getUserById);
router.post('/', permission('USER_CREATE'), controller.createUser);
router.put('/:id', permission('USER_EDIT'), controller.updateUser);
module.exports = router;

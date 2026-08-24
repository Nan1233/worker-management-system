const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const permission = require('../middleware/permissionMiddleware');
const controller = require('../controllers/masterDataTransferController');

router.use(verifyToken);
router.get('/export/:resource', permission('MASTER_VIEW'), controller.export);
router.post('/import/:resource', permission('MASTER_EDIT'), controller.import);

module.exports = router;

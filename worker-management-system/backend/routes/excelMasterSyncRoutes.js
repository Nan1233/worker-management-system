const express = require('express');
const controller = require('../controllers/excelMasterSyncController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const { expensiveUserLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
router.use(verifyToken, checkRole('admin', 'manager'), permission('EXCEL_MASTER_SYNC'));
router.post('/preview', expensiveUserLimiter, controller.preview);
router.post('/apply', expensiveUserLimiter, controller.apply);
router.get('/batches', controller.listBatches);
router.get('/batches/:id/logs', controller.getBatchLogs);
module.exports = router;

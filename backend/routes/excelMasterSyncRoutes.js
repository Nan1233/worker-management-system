const express = require('express');
const controller = require('../controllers/excelMasterSyncController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

const router = express.Router();
router.use(verifyToken, checkRole('admin', 'manager'));
router.post('/preview', controller.preview);
router.post('/apply', controller.apply);
router.get('/batches', controller.listBatches);
router.get('/batches/:id/logs', controller.getBatchLogs);
module.exports = router;

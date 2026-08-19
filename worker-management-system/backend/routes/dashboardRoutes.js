const express = require('express');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();
router.get('/summary', verifyToken, checkRole('admin', 'manager', 'lead'), permission('DASHBOARD_VIEW'), dashboardController.getSummary);
module.exports = router;

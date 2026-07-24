const express = require('express');
const router = express.Router();
const controller = require('../controllers/formulaSettingsController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
router.use(verifyToken, checkRole('admin','manager','lead'));
router.get('/', controller.list);
router.put('/machines/:id', controller.updateMachineRule);
module.exports = router;

const express = require('express');
const router = express.Router();
const controller = require('../controllers/userController');
const verifyToken = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');

router.use(verifyToken, checkRole('admin','manager','lead'));
router.get('/', controller.getAllUsers);
router.get('/options/processes', controller.getProcessOptions);
router.get('/:id', controller.getUserById);
router.post('/', controller.createUser);
router.put('/:id', controller.updateUser);
module.exports = router;
